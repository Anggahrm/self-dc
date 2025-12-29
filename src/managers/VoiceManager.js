/**
 * Voice Manager
 * Handles automatic voice channel join and stay functionality
 */

const { Logger } = require('../utils/logger');
const { 
  getVoiceSettings, 
  setVoiceSettings, 
  deleteVoiceSettings,
  getAllEnabledVoiceSettings,
  isConnected: isDbConnected,
} = require('../utils/database');

class VoiceManager {
  constructor(client) {
    this.client = client;
    this.logger = Logger.create('Voice');
    
    // Active voice connections per guild (in-memory for non-db mode)
    this.connections = new Map();
    
    // Reconnection settings
    this.reconnectDelay = 5000; // 5 seconds
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 10;
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
            await this.joinChannel(channel, settings.selfMute, settings.selfDeaf, false);
            this.logger.info(`Restored voice connection to ${channel.name}`);
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

    try {
      // Check if already connected to this channel
      const existingConnection = this.connections.get(guildId);
      if (existingConnection && existingConnection.channelId === channel.id) {
        this.logger.warn(`Already connected to ${channel.name}`);
        return existingConnection;
      }

      // Disconnect from existing connection if any
      if (existingConnection) {
        await this.disconnect(guildId, false);
      }

      // Join the voice channel
      const connection = await this.client.voice.joinChannel(channel, {
        selfMute,
        selfDeaf,
        selfVideo: false,
      });

      // Store connection info
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
      this.reconnectAttempts.delete(guildId);

      // Save to database
      if (saveToDb && isDbConnected()) {
        await setVoiceSettings(guildId, channel.id, true, selfMute, selfDeaf);
      }

      this.logger.success(`Joined voice channel: ${channel.name} (${channel.guild.name})`);

      // Set up disconnect handler for auto-reconnect
      this.setupReconnectHandler(connection, channel, selfMute, selfDeaf);

      return connectionInfo;
    } catch (error) {
      this.logger.error(`Failed to join voice channel: ${error.message}`);
      return null;
    }
  }

  /**
   * Set up auto-reconnect handler
   */
  setupReconnectHandler(connection, channel, selfMute, selfDeaf) {
    const guildId = channel.guild.id;

    connection.on('disconnect', () => {
      this.logger.warn(`Disconnected from ${channel.name}, attempting reconnect...`);
      
      // Handle reconnection asynchronously with proper error handling
      this.handleReconnect(guildId, channel, selfMute, selfDeaf).catch(error => {
        this.logger.error(`Reconnection error: ${error.message}`);
      });
    });
  }

  /**
   * Handle reconnection logic
   */
  async handleReconnect(guildId, channel, selfMute, selfDeaf) {
    // Get current reconnect attempts
    const attempts = this.reconnectAttempts.get(guildId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      this.logger.error(`Max reconnect attempts reached for ${channel.name}`);
      this.connections.delete(guildId);
      this.reconnectAttempts.delete(guildId);
      return;
    }

    this.reconnectAttempts.set(guildId, attempts + 1);

    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    // Check if we should still be connected
    const savedConnection = this.connections.get(guildId);
    if (!savedConnection || savedConnection.channelId !== channel.id) {
      this.logger.debug('Connection was intentionally closed, not reconnecting');
      return;
    }

    // Try to reconnect
    try {
      const freshChannel = this.client.channels.cache.get(channel.id);
      if (freshChannel && freshChannel.isVoice()) {
        await this.joinChannel(freshChannel, selfMute, selfDeaf, false);
      }
    } catch (error) {
      this.logger.error(`Reconnect failed: ${error.message}`);
    }
  }

  /**
   * Disconnect from voice channel in a guild
   * @param {string} guildId - Guild ID
   * @param {boolean} removeFromDb - Whether to remove from database
   * @returns {Promise<boolean>}
   */
  async disconnect(guildId, removeFromDb = true) {
    const connectionInfo = this.connections.get(guildId);
    
    if (!connectionInfo) {
      return false;
    }

    try {
      // Disconnect the voice connection
      if (connectionInfo.connection) {
        connectionInfo.connection.disconnect();
      }

      this.connections.delete(guildId);
      this.reconnectAttempts.delete(guildId);

      // Remove from database
      if (removeFromDb && isDbConnected()) {
        await deleteVoiceSettings(guildId);
      }

      this.logger.success(`Disconnected from voice channel: ${connectionInfo.channelName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to disconnect: ${error.message}`);
      return false;
    }
  }

  /**
   * Get connection status for a guild
   * @param {string} guildId - Guild ID
   * @returns {Object|null}
   */
  getConnectionStatus(guildId) {
    return this.connections.get(guildId) || null;
  }

  /**
   * Check if connected to a voice channel in a guild
   * @param {string} guildId - Guild ID
   * @returns {boolean}
   */
  isConnected(guildId) {
    return this.connections.has(guildId);
  }

  /**
   * Get formatted status message
   * @param {string} guildId - Guild ID (optional)
   * @returns {string}
   */
  getStatus(guildId = null) {
    if (guildId) {
      const connectionInfo = this.connections.get(guildId);
      
      if (!connectionInfo) {
        return '🔇 **Voice Status:** Not connected';
      }

      const duration = Math.round((Date.now() - connectionInfo.joinedAt) / 1000);
      const durationStr = this.formatDuration(duration);

      return [
        '🎤 **Voice Status:** Connected',
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
      statuses.push(`• ${info.guildName} - ${info.channelName} (${this.formatDuration(duration)})`);
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
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  /**
   * Cleanup all voice connections
   */
  async cleanup() {
    this.logger.info('Cleaning up voice connections...');
    
    for (const [guildId] of this.connections) {
      await this.disconnect(guildId, false);
    }
    
    this.connections.clear();
    this.reconnectAttempts.clear();
  }
}

module.exports = { VoiceManager };
