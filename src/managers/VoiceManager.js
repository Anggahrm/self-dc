/**
 * Voice Manager
 * Handles automatic voice channel join and stay functionality
 * With robust heartbeat, reconnection, and circuit breaker patterns
 */

const { BaseManager } = require('./BaseManager');
const { DiscordUtils } = require('../utils/discord');
const {
  getVoiceSettings,
  setVoiceSettings,
  deleteVoiceSettings,
  getAllEnabledVoiceSettings,
  isConnected: isDbConnected,
} = require('../config/database');

/**
 * Connection State Enum
 */
const ConnectionState = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTING: 'DISCONNECTING',
  RECONNECTING: 'RECONNECTING',
};

/**
 * Circuit Breaker State Enum
 */
const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class VoiceManager extends BaseManager {
  constructor(client) {
    super(client, 'Voice');

    // Active voice connections per guild (in-memory for non-db mode)
    this.connections = new Map();

    // Connection state tracking per guild
    this.connectionStates = new Map();

    // Reconnection settings with exponential backoff
    this.baseReconnectDelay = 5000; // 5 seconds
    this.maxReconnectDelay = 300000; // 5 minutes
    this.reconnectMultiplier = 1.5;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 10;

    // Circuit breaker per guild
    this.circuitBreakers = new Map();
    this.circuitBreakerThreshold = 5; // Open after 5 failures
    this.circuitBreakerCooldown = 120000; // 2 minutes

    // Heartbeat settings
    this.heartbeatInterval = 30000; // 30 seconds
    this.heartbeatFailures = new Map();
    this.maxHeartbeatFailures = 3;

    // Correlation IDs per guild for structured logging
    this.correlationIds = new Map();

    // Connection stable tracking (for reset attempts)
    this.connectionStableSince = new Map();
    this.stableThreshold = 120000; // 2 minutes to be considered stable

    // Graceful shutdown flag
    this.isShuttingDown = false;
  }

  /**
   * Generate a correlation ID for tracking connection attempts
   */
  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get correlation ID for a guild
   */
  getCorrelationId(guildId) {
    if (!this.correlationIds.has(guildId)) {
      this.correlationIds.set(guildId, this.generateCorrelationId());
    }
    return this.correlationIds.get(guildId);
  }

  /**
   * Reset correlation ID for a guild (new connection attempt)
   */
  resetCorrelationId(guildId) {
    this.correlationIds.set(guildId, this.generateCorrelationId());
    return this.correlationIds.get(guildId);
  }

  /**
   * Get connection state for a guild
   */
  getConnectionState(guildId) {
    return this.connectionStates.get(guildId) || ConnectionState.IDLE;
  }

  /**
   * Set connection state with logging
   */
  setConnectionState(guildId, state) {
    const oldState = this.getConnectionState(guildId);
    this.connectionStates.set(guildId, state);

    if (oldState !== state) {
      const corrId = this.getCorrelationId(guildId);
      this.logger.info(`[${corrId}] State transition: ${oldState} -> ${state}`);
    }
  }

  /**
   * Get circuit breaker state for a guild
   */
  getCircuitBreaker(guildId) {
    if (!this.circuitBreakers.has(guildId)) {
      this.circuitBreakers.set(guildId, {
        state: CircuitState.CLOSED,
        failures: 0,
        lastFailureTime: null,
        testRequestAllowed: false,
      });
    }
    return this.circuitBreakers.get(guildId);
  }

  /**
   * Record circuit breaker success
   */
  recordCircuitSuccess(guildId) {
    const cb = this.getCircuitBreaker(guildId);
    const oldState = cb.state;

    cb.failures = 0;
    cb.state = CircuitState.CLOSED;
    cb.testRequestAllowed = false;

    if (oldState !== CircuitState.CLOSED) {
      const corrId = this.getCorrelationId(guildId);
      this.logger.success(`[${corrId}] Circuit breaker CLOSED (connection successful)`);
    }
  }

  /**
   * Record circuit breaker failure
   */
  recordCircuitFailure(guildId) {
    const cb = this.getCircuitBreaker(guildId);
    cb.failures++;
    cb.lastFailureTime = Date.now();

    const corrId = this.getCorrelationId(guildId);

    if (cb.state === CircuitState.HALF_OPEN) {
      cb.state = CircuitState.OPEN;
      this.logger.warn(`[${corrId}] Circuit breaker OPEN (test request failed)`);
    } else if (cb.failures >= this.circuitBreakerThreshold && cb.state === CircuitState.CLOSED) {
      cb.state = CircuitState.OPEN;
      this.logger.warn(`[${corrId}] Circuit breaker OPEN after ${cb.failures} consecutive failures`);
    }
  }

  /**
   * Check if circuit breaker allows request
   */
  canAttemptReconnect(guildId) {
    const cb = this.getCircuitBreaker(guildId);

    if (cb.state === CircuitState.CLOSED) {
      return true;
    }

    if (cb.state === CircuitState.OPEN) {
      const timeSinceFailure = Date.now() - cb.lastFailureTime;

      if (timeSinceFailure >= this.circuitBreakerCooldown) {
        cb.state = CircuitState.HALF_OPEN;
        cb.testRequestAllowed = true;
        const corrId = this.getCorrelationId(guildId);
        this.logger.info(`[${corrId}] Circuit breaker HALF-OPEN (allowing test request)`);
        return true;
      }

      const remainingCooldown = Math.ceil((this.circuitBreakerCooldown - timeSinceFailure) / 1000);
      const corrId = this.getCorrelationId(guildId);
      this.logger.warn(`[${corrId}] Circuit breaker OPEN, pausing reconnects (${remainingCooldown}s cooldown remaining)`);
      return false;
    }

    if (cb.state === CircuitState.HALF_OPEN) {
      if (cb.testRequestAllowed) {
        cb.testRequestAllowed = false;
        const corrId = this.getCorrelationId(guildId);
        this.logger.info(`[${corrId}] Circuit breaker allowing test request (HALF_OPEN)`);
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  calculateReconnectDelay(attempts) {
    // Base exponential calculation
    const exponentialDelay = this.baseReconnectDelay * Math.pow(this.reconnectMultiplier, attempts);

    // Add jitter (0-30% random variation)
    const jitter = 1 + Math.random() * 0.3;

    // Apply cap
    const delay = Math.min(exponentialDelay * jitter, this.maxReconnectDelay);

    return Math.round(delay);
  }

  /**
   * Reset reconnect attempts if connection has been stable
   */
  maybeResetReconnectAttempts(guildId) {
    const stableSince = this.connectionStableSince.get(guildId);
    if (stableSince) {
      const stableDuration = Date.now() - stableSince;
      if (stableDuration >= this.stableThreshold) {
        const attempts = this.reconnectAttempts.get(guildId) || 0;
        if (attempts > 0) {
          const corrId = this.getCorrelationId(guildId);
          this.logger.info(`[${corrId}] Connection stable for ${Math.round(stableDuration / 1000)}s, resetting reconnect attempts`);
          this.reconnectAttempts.delete(guildId);
          this.recordCircuitSuccess(guildId);
        }
      }
    }
  }

  /**
   * Initialize voice manager and restore connections from database
   */
  async initialize() {
    if (!isDbConnected()) {
      this.logger.info('Database not connected - voice settings will not persist');
      return;
    }

    try {
      const savedSettings = await getAllEnabledVoiceSettings();

      for (const settings of savedSettings) {
        try {
          const channel = this.client.channels.cache.get(settings.channelId);
          if (channel && channel.isVoice()) {
            const corrId = this.resetCorrelationId(settings.guildId);
            this.logger.info(`[${corrId}] Restoring voice connection to ${channel.name}`);
            await this.joinChannel(channel, settings.selfMute, settings.selfDeaf, false);
          } else {
            // Channel no longer exists, cleanup DB
            this.logger.warn(`Voice channel ${settings.channelId} no longer exists, removing from database`);
            await deleteVoiceSettings(settings.guildId);
          }
        } catch (error) {
          this.logger.warn(`Failed to restore voice connection: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to initialize voice connections: ${error.message}`);
    }
  }

  /**
   * Validate that bot is actually in the voice channel
   */
  async validateConnection(guildId, expectedChannelId) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      return false;
    }

    // Wait for voice state to propagate (max 12s, 4 retries with shorter delays)
    const maxRetries = 4;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Fetch fresh member data
        const member = await guild.members.fetch(this.client.user.id);
        const actualChannelId = member.voice?.channelId;

        if (actualChannelId === expectedChannelId) {
          return true;
        }

        if (attempt < maxRetries) {
          await DiscordUtils.sleep(retryDelay);
        }
      } catch (error) {
        this.logger.debug(`Validation attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) {
          await DiscordUtils.sleep(retryDelay);
        }
      }
    }

    return false;
  }

  /**
   * Start heartbeat for a connection
   */
  startHeartbeat(guildId, connection) {
    // Clear any existing heartbeat
    this.stopHeartbeat(guildId);

    const heartbeatKey = `heartbeat_${guildId}`;
    this.heartbeatFailures.set(guildId, 0);

    const heartbeatFn = async () => {
      const connectionInfo = this.connections.get(guildId);
      if (!connectionInfo || this.isShuttingDown) {
        this.stopHeartbeat(guildId);
        return;
      }

      // Check if connection is still valid using voice state (more reliable than readyState)
      const connection = connectionInfo?.connection;
      if (!connection) {
        this.stopHeartbeat(guildId);
        return;
      }

      // For discord.js-selfbot-v13, use voice state check instead of readyState
      try {
        const guild = this.client.guilds.cache.get(guildId);
        const member = await guild?.members.fetch(this.client.user.id);
        const actualChannelId = member?.voice?.channelId;
        const expectedChannelId = connectionInfo.channelId;

        if (actualChannelId !== expectedChannelId) {
          const failures = (this.heartbeatFailures.get(guildId) || 0) + 1;
          this.heartbeatFailures.set(guildId, failures);

          const corrId = this.getCorrelationId(guildId);
          if (failures >= this.maxHeartbeatFailures) {
            this.logger.warn(`[${corrId}] Heartbeat failed ${failures}x (not in voice), triggering reconnect`);
            this.stopHeartbeat(guildId);
            this.handleDisconnect(guildId, connectionInfo, 'heartbeat_failure');
          } else {
            this.logger.debug(`[${corrId}] Heartbeat warning (${failures}/${this.maxHeartbeatFailures})`);
          }
          return;
        }
      } catch (error) {
        this.logger.debug(`Heartbeat voice check failed: ${error.message}`);
      }

      // Reset failures on success
      this.heartbeatFailures.set(guildId, 0);

      // Check if we should reset reconnect attempts (connection stable)
      this.maybeResetReconnectAttempts(guildId);
    };

    // Use managed interval pattern (setManagedTimer for one-shot, we'll use interval)
    const intervalId = setInterval(heartbeatFn, this.heartbeatInterval);
    this.timers.set(heartbeatKey, intervalId);

    // Run first heartbeat immediately
    heartbeatFn();
  }

  /**
   * Stop heartbeat for a guild
   */
  stopHeartbeat(guildId) {
    const heartbeatKey = `heartbeat_${guildId}`;
    const intervalId = this.timers.get(heartbeatKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.timers.delete(heartbeatKey);
    }
    this.heartbeatFailures.delete(guildId);
  }

  /**
   * Handle voice state updates from Discord
   */
  async handleVoiceStateUpdate(oldState, newState) {
    try {
      // Only care about our own voice state
      const memberId = oldState.member?.id || newState.member?.id;
      if (memberId !== this.client.user.id) {
        return;
      }

      const guildId = oldState.guild?.id || newState.guild?.id;
      if (!guildId) return;

      const corrId = this.getCorrelationId(guildId);
      const oldChannelId = oldState.channelId;
      const newChannelId = newState.channelId;

      // Log state change
      this.logger.info(`[${corrId}] Voice state update: ${oldChannelId || 'null'} -> ${newChannelId || 'null'}`);

      // Detect disconnect (left voice channel)
      if (oldChannelId && !newChannelId) {
        const connectionInfo = this.connections.get(guildId);
        if (connectionInfo) {
          this.logger.warn(`[${corrId}] Detected disconnect from ${connectionInfo.channelName}`);
          await this.handleDisconnect(guildId, connectionInfo, 'voice_state_update');
        }
      }

      // Detect channel change
      if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
        this.logger.info(`[${corrId}] Channel change detected: ${oldChannelId} -> ${newChannelId}`);
      }
    } catch (error) {
      this.logger.error(`Error handling voice state update: ${error.message}`);
    }
  }

  /**
   * Handle disconnect event
   */
  async handleDisconnect(guildId, connectionInfo, reason) {
    const corrId = this.getCorrelationId(guildId);

    // Don't reconnect if shutting down
    if (this.isShuttingDown) {
      this.logger.info(`[${corrId}] Not reconnecting - shutdown in progress`);
      return;
    }

    // Update state
    this.setConnectionState(guildId, ConnectionState.DISCONNECTING);

    // Stop heartbeat
    this.stopHeartbeat(guildId);

    // Clean up connection reference but keep settings for reconnect
    const channelId = connectionInfo.channelId;
    const selfMute = connectionInfo.selfMute;
    const selfDeaf = connectionInfo.selfDeaf;

    // Get fresh channel reference
    const channel = this.client.channels.cache.get(channelId);

    // Clean up old connection
    this.connections.delete(guildId);

    // Trigger reconnect if we have channel info
    if (channel && channel.isVoice()) {
      this.logger.info(`[${corrId}] Scheduling reconnect after ${reason}`);
      this.scheduleReconnect(guildId, channel, selfMute, selfDeaf);
    } else {
      this.logger.warn(`[${corrId}] Cannot reconnect - channel no longer available`);
      this.cleanupGuildState(guildId);
    }
  }

  /**
   * Join a voice channel and stay
   * @param {Object} channel - Voice channel to join
   * @param {boolean} selfMute - Self mute
   * @param {boolean} selfDeaf - Self deafen
   * @param {boolean} saveToDb - Whether to save to database
   * @returns {Promise<Object|null>} Voice connection or null
   */
  async joinChannel(channel, selfMute = true, selfDeaf = true, saveToDb = true) {
    if (!channel || !channel.isVoice()) {
      this.logger.error('Invalid voice channel');
      return null;
    }

    const guildId = channel.guild.id;

    // Check if already connected to this channel
    const existingConnection = this.connections.get(guildId);
    if (existingConnection && existingConnection.channelId === channel.id) {
      this.logger.warn(`Already connected to ${channel.name}`);
      return existingConnection;
    }

    // Generate new correlation ID for this connection attempt
    const corrId = this.resetCorrelationId(guildId);

    // Set connecting state
    this.setConnectionState(guildId, ConnectionState.CONNECTING);

    try {
      // Disconnect from existing connection if any
      if (existingConnection) {
        await this.disconnect(guildId, false);
        await DiscordUtils.sleep(500);
      }

      this.logger.info(`[${corrId}] Joining voice channel: ${channel.name}`);

      // Join the voice channel
      const connection = await this.client.voice.joinChannel(channel, {
        selfMute,
        selfDeaf,
        selfVideo: false,
      });

      // For discord.js-selfbot-v13, ready event is unreliable
      // Use voice state validation instead of waiting for ready event
      this.logger.info(`[${corrId}] Waiting for voice state to propagate...`);
      await DiscordUtils.sleep(2000); // Give Discord time to propagate

      // Validate connection via guild voice state (primary source of truth)
      const isValid = await this.validateConnection(guildId, channel.id);

      if (!isValid) {
        this.logger.warn(`[${corrId}] Connection did not become ready in time`);
        connection.disconnect();
        this.cleanupGuildState(guildId);
        return null;
      }

      // Store connection info AFTER validation
      const connectionInfo = {
        connection,
        channelId: channel.id,
        channelName: channel.name,
        guildId,
        guildName: channel.guild.name,
        selfMute,
        selfDeaf,
        joinedAt: Date.now(),
      };

      this.connections.set(guildId, connectionInfo);
      this.connectionStableSince.set(guildId, Date.now());
      this.setConnectionState(guildId, ConnectionState.CONNECTED);

      // Save to database
      if (saveToDb && isDbConnected()) {
        await setVoiceSettings(guildId, channel.id, true, selfMute, selfDeaf);
      }

      this.logger.success(`[${corrId}] Successfully joined voice channel: ${channel.name}`);

      // Start heartbeat
      this.startHeartbeat(guildId, connection);

      // Set up disconnect handler
      this.setupConnectionHandlers(connection, guildId);

      return connectionInfo;
    } catch (error) {
      this.logger.error(`[${corrId}] Failed to join voice channel: ${error.message}`);
      this.setConnectionState(guildId, ConnectionState.IDLE);
      return null;
    }
  }

  /**
   * Set up connection event handlers
   */
  setupConnectionHandlers(connection, guildId) {
    const connectionInfo = this.connections.get(guildId);
    if (!connectionInfo) return;

    connection.on('disconnect', () => {
      if (this.isShuttingDown) return;

      const corrId = this.getCorrelationId(guildId);
      this.logger.warn(`[${corrId}] Connection disconnect event fired`);

      this.handleDisconnect(guildId, connectionInfo, 'connection_disconnect');
    });

    connection.on('error', (error) => {
      const corrId = this.getCorrelationId(guildId);
      this.logger.error(`[${corrId}] Voice connection error: ${error.message}`);
    });

    connection.on('close', () => {
      const corrId = this.getCorrelationId(guildId);
      this.logger.warn(`[${corrId}] Voice connection closed`);
    });
  }

  /**
   * Schedule a reconnect attempt with exponential backoff and circuit breaker
   */
  scheduleReconnect(guildId, channel, selfMute, selfDeaf) {
    try {
      const corrId = this.getCorrelationId(guildId);

      // Check circuit breaker
      if (!this.canAttemptReconnect(guildId)) {
        // Schedule another check after cooldown
        const cb = this.getCircuitBreaker(guildId);
        if (cb.state === CircuitState.OPEN) {
          const timeUntilHalfOpen = this.circuitBreakerCooldown - (Date.now() - cb.lastFailureTime);
          this.setManagedTimer(
            `reconnect_${guildId}`,
            () => this.scheduleReconnect(guildId, channel, selfMute, selfDeaf),
            Math.max(timeUntilHalfOpen + 1000, 5000)
          );
        }
        return;
      }

      const attempts = this.reconnectAttempts.get(guildId) || 0;

      if (attempts >= this.maxReconnectAttempts) {
        this.logger.error(`[${corrId}] Max reconnect attempts reached for ${channel.name}`);
        this.cleanupGuildState(guildId);
        return;
      }

      this.reconnectAttempts.set(guildId, attempts + 1);
      this.setConnectionState(guildId, ConnectionState.RECONNECTING);

      // Calculate delay with exponential backoff and jitter
      const delay = this.calculateReconnectDelay(attempts);
      this.logger.info(`[${corrId}] Reconnect attempt ${attempts + 1}/${this.maxReconnectAttempts} in ${Math.round(delay / 1000)}s...`);

      this.setManagedTimer(
        `reconnect_${guildId}`,
        async () => {
          await this.handleReconnect(guildId, channel, selfMute, selfDeaf);
        },
        delay
      );
    } catch (error) {
      this.logger.error(`Error scheduling reconnect: ${error.message}`);
    }
  }

  /**
   * Handle reconnection logic
   */
  async handleReconnect(guildId, channel, selfMute, selfDeaf) {
    const corrId = this.getCorrelationId(guildId);

    // Don't reconnect if shutting down
    if (this.isShuttingDown) {
      this.logger.info(`[${corrId}] Not reconnecting - shutdown in progress`);
      return;
    }

    // Check if we should still be connected
    const savedConnection = this.connections.get(guildId);
    if (savedConnection && savedConnection.channelId === channel.id) {
      this.logger.debug(`[${corrId}] Already connected to target channel, skipping reconnect`);
      return;
    }

    try {
      // Refresh channel from cache
      const freshChannel = this.client.channels.cache.get(channel.id);
      if (!freshChannel || !freshChannel.isVoice()) {
        this.logger.warn(`[${corrId}] Channel ${channel.id} no longer exists or is not a voice channel`);
        this.logger.info(`[${corrId}] Stopping reconnect - voice channel was deleted`);
        
        // Cleanup and remove from DB since channel is gone
        await this.disconnect(guildId, true);
        return;
      }

      const result = await this.joinChannel(freshChannel, selfMute, selfDeaf, false);
      if (result) {
        this.logger.success(`[${corrId}] Successfully reconnected to ${freshChannel.name}`);
        this.recordCircuitSuccess(guildId);
      } else {
        throw new Error('joinChannel returned null');
      }
    } catch (error) {
      this.logger.error(`[${corrId}] Reconnect failed: ${error.message}`);
      this.recordCircuitFailure(guildId);

      const attempts = this.reconnectAttempts.get(guildId) || 0;
      if (attempts < this.maxReconnectAttempts) {
        this.scheduleReconnect(guildId, channel, selfMute, selfDeaf);
      } else {
        this.logger.error(`[${corrId}] Max reconnect attempts exhausted`);
        this.cleanupGuildState(guildId);
      }
    }
  }

  /**
   * Cleanup all state for a guild
   */
  cleanupGuildState(guildId) {
    this.connections.delete(guildId);
    this.connectionStates.delete(guildId);
    this.reconnectAttempts.delete(guildId);
    this.heartbeatFailures.delete(guildId);
    this.connectionStableSince.delete(guildId);
    this.correlationIds.delete(guildId);
    this.circuitBreakers.delete(guildId);
    this.clearManagedTimer(`reconnect_${guildId}`);
    this.stopHeartbeat(guildId);
  }

  /**
   * Disconnect from voice channel in a guild
   * @param {string} guildId - Guild ID
   * @param {boolean} removeFromDb - Whether to remove from database
   * @returns {Promise<boolean>}
   */
  async disconnect(guildId, removeFromDb = true) {
    const connectionInfo = this.connections.get(guildId);
    const corrId = this.getCorrelationId(guildId);

    if (!connectionInfo) {
      return false;
    }

    try {
      this.setConnectionState(guildId, ConnectionState.DISCONNECTING);

      // Stop heartbeat
      this.stopHeartbeat(guildId);

      // Clear reconnect timer
      this.clearManagedTimer(`reconnect_${guildId}`);

      // Disconnect the voice connection
      if (connectionInfo.connection) {
        connectionInfo.connection.disconnect();
      }

      // Remove from database
      if (removeFromDb && isDbConnected()) {
        await deleteVoiceSettings(guildId);
      }

      this.logger.success(`[${corrId}] Disconnected from voice channel: ${connectionInfo.channelName}`);

      // Cleanup state
      this.cleanupGuildState(guildId);

      return true;
    } catch (error) {
      this.logger.error(`[${corrId}] Failed to disconnect: ${error.message}`);
      this.cleanupGuildState(guildId);
      return false;
    }
  }

  /**
   * Get connection status for a guild
   * @param {string} guildId - Guild ID
   * @returns {Object|null}
   */
  getConnectionStatus(guildId) {
    const connectionInfo = this.connections.get(guildId);
    if (!connectionInfo) return null;

    return {
      ...connectionInfo,
      state: this.getConnectionState(guildId),
      correlationId: this.getCorrelationId(guildId),
    };
  }

  /**
   * Check if connected to a voice channel in a guild
   * @param {string} guildId - Guild ID
   * @returns {boolean}
   */
  isConnected(guildId) {
    return this.connections.has(guildId) && this.getConnectionState(guildId) === ConnectionState.CONNECTED;
  }

  /**
   * Get formatted status message
   * @param {string} guildId - Guild ID (optional)
   * @returns {string}
   */
  getStatus(guildId = null) {
    if (guildId) {
      const connectionInfo = this.connections.get(guildId);
      const state = this.getConnectionState(guildId);

      if (!connectionInfo) {
        return '🔇 **Voice Status:** Not connected';
      }

      const duration = Math.round((Date.now() - connectionInfo.joinedAt) / 1000);
      const durationStr = this.formatDuration(duration);
      const stateEmoji = state === ConnectionState.CONNECTED ? '🟢' : '🟡';

      return [
        `${stateEmoji} **Voice Status:** ${state}`,
        '',
        `📍 **Channel:** ${connectionInfo.channelName}`,
        `🏠 **Server:** ${connectionInfo.guildName}`,
        `🔇 **Self Mute:** ${connectionInfo.selfMute ? 'Yes' : 'No'}`,
        `🔈 **Self Deaf:** ${connectionInfo.selfDeaf ? 'Yes' : 'No'}`,
        `⏱️ **Duration:** ${durationStr}`,
      ].join('\n');
    }

    // Return status for all connections
    if (this.connections.size === 0) {
      return '🔇 **Voice Status:** No active connections';
    }

    const statuses = [];
    for (const [, info] of this.connections) {
      const duration = Math.round((Date.now() - info.joinedAt) / 1000);
      const state = this.getConnectionState(info.guildId);
      const stateEmoji = state === ConnectionState.CONNECTED ? '🟢' : '🟡';
      statuses.push(`${stateEmoji} ${info.guildName} - ${info.channelName} (${this.formatDuration(duration)}) [${state}]`);
    }

    return [
      `🎤 **Voice Status:** ${this.connections.size} active connection(s)`,
      '',
      ...statuses,
    ].join('\n');
  }

  /**
   * Format duration in human readable format
   * @param {number} seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    return DiscordUtils.formatDuration(seconds);
  }

  /**
   * Clear all managed timers (both timeouts and intervals)
   */
  clearAllTimers() {
    for (const [name, timer] of this.timers) {
      // Use clearInterval for both since in Node.js clearTimeout === clearInterval
      clearInterval(timer);
      this.logger.debug(`Cleared timer: ${name}`);
    }
    this.timers.clear();
  }

  /**
   * Cleanup all voice connections (graceful shutdown)
   */
  async cleanup(options = {}) {
    const { disconnect = true } = options;
    this.logger.info('Cleaning up voice connections...');
    this.isShuttingDown = true;

    if (disconnect) {
      // Disconnect all connections
      for (const [guildId, connectionInfo] of this.connections) {
        const corrId = this.getCorrelationId(guildId);
        this.logger.info(`[${corrId}] Disconnecting from ${connectionInfo.channelName}`);

        // Stop heartbeat
        this.stopHeartbeat(guildId);

        // Clear reconnect timer
        this.clearManagedTimer(`reconnect_${guildId}`);

        // Disconnect
        try {
          if (connectionInfo.connection) {
            connectionInfo.connection.disconnect();
          }
        } catch (error) {
          this.logger.debug(`[${corrId}] Error during disconnect: ${error.message}`);
        }
      }
    } else {
      // Just stop all heartbeats without disconnecting
      for (const guildId of this.connections.keys()) {
        this.stopHeartbeat(guildId);
        this.clearManagedTimer(`reconnect_${guildId}`);
      }
      this.logger.info('Voice state preserved for Heroku dyno cycling');
    }

    // Clear all state
    this.connections.clear();
    this.connectionStates.clear();
    this.reconnectAttempts.clear();
    this.heartbeatFailures.clear();
    this.connectionStableSince.clear();
    this.correlationIds.clear();
    this.circuitBreakers.clear();

    // Clear all timers (including intervals)
    this.clearAllTimers();

    this.logger.info('Voice connections cleanup complete');

    // Call parent cleanup (which also calls clearAllTimers)
    super.cleanup();
  }
}

module.exports = { VoiceManager, ConnectionState, CircuitState };
