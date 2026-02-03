/**
 * Base Manager
 * Abstract base class for all managers to ensure consistent patterns
 */

const { Logger } = require('../utils/logger');

class BaseManager {
  constructor(client, name) {
    this.client = client;
    this.logger = Logger.create(name);
    this.enabled = false;
    this.channel = null;
    this.pendingMessages = new Map();
    this.timers = new Map();
  }

  /**
   * Enable/disable the manager
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.logger.info(`${this.constructor.name} ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Check if manager is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Set current channel
   */
  setChannel(channel) {
    this.channel = channel;
  }

  /**
   * Register a pending message with automatic cleanup
   * @param {string} messageId - Message ID to track
   * @param {Object} message - Message object
   * @param {Function} onResolve - Callback when resolved
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  registerPendingMessage(messageId, message, onResolve, timeoutMs = 900000) {
    // Clean up any existing entry for this message
    this.cleanupPendingMessage(messageId);

    const cleanup = () => {
      this.cleanupPendingMessage(messageId);
    };

    // Set up the resolver
    const resolver = (result) => {
      cleanup();
      if (onResolve) onResolve(result);
    };

    // Store with cleanup function
    this.pendingMessages.set(messageId, {
      message,
      resolver,
      cleanup,
    });

    // Auto-cleanup after timeout
    const timeoutId = setTimeout(() => {
      if (this.pendingMessages.has(messageId)) {
        this.logger.debug(`Pending message ${messageId} timed out`);
        cleanup();
      }
    }, timeoutMs);

    // Update stored entry with timeout
    const entry = this.pendingMessages.get(messageId);
    if (entry) {
      entry.timeoutId = timeoutId;
    }

    return resolver;
  }

  /**
   * Clean up a pending message
   */
  cleanupPendingMessage(messageId) {
    const entry = this.pendingMessages.get(messageId);
    if (entry) {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      this.pendingMessages.delete(messageId);
    }
  }

  /**
   * Set a managed timer (auto-cleanup on stop)
   */
  setManagedTimer(name, callback, delay) {
    // Clear existing timer if any
    this.clearManagedTimer(name);

    const timer = setTimeout(async () => {
      this.timers.delete(name);
      try {
        await callback();
      } catch (error) {
        this.logger.error(`Timer ${name} error: ${error.message}`);
      }
    }, delay);

    this.timers.set(name, timer);
    return timer;
  }

  /**
   * Clear a managed timer
   */
  clearManagedTimer(name) {
    const timer = this.timers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(name);
    }
  }

  /**
   * Clear all managed timers
   */
  clearAllTimers() {
    for (const [name, timer] of this.timers) {
      clearTimeout(timer);
      this.logger.debug(`Cleared timer: ${name}`);
    }
    this.timers.clear();
  }

  /**
   * Clean up all resources
   */
  cleanup() {
    this.logger.info('Cleaning up...');

    // Clear all pending messages
    for (const [messageId, entry] of this.pendingMessages) {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    }
    this.pendingMessages.clear();

    // Clear all timers
    this.clearAllTimers();

    this.enabled = false;
  }
}

module.exports = { BaseManager };
