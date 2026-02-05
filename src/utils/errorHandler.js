/**
 * Error Handler
 * Global error handling and reporting
 */

const { Logger } = require('./logger');

class ErrorHandler {
  constructor(client) {
    this.client = client;
    this.logger = Logger.create('ErrorHandler');
    this.errorCounts = new Map();
    this.maxErrorsPerMinute = 10;
    this.circuitBreakers = new Map();
  }

  /**
   * Initialize global error handlers
   */
  initialize() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleFatalError('Uncaught Exception', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleFatalError('Unhandled Rejection', reason);
    });

    // Handle Discord.js errors
    this.client.on('error', (error) => {
      this.logger.error(`Discord client error: ${error.message}`);
    });

    this.client.on('shardError', (error, shardId) => {
      this.logger.error(`Shard ${shardId} error: ${error.message}`);
    });

    // Handle disconnections
    this.client.on('disconnect', (event) => {
      this.logger.warn(`Client disconnected: ${event.code} - ${event.reason}`);
    });

    // Periodic cleanup of error counts
    setInterval(() => this.cleanupErrorCounts(), 60000);

    this.logger.info('Error handlers initialized');
  }

  /**
   * Handle a fatal error (may crash the process)
   * @param {string} type - Error type
   * @param {Error} error - Error object
   */
  handleFatalError(type, error) {
    this.logger.error(`=== FATAL ERROR: ${type} ===`);
    this.logger.error(error.stack || error.message || error);

    // Log system state
    this.logSystemState();

    // Graceful shutdown attempt
    this.gracefulShutdown();
  }

  /**
   * Handle operational errors (recoverable)
   * @param {string} context - Error context
   * @param {Error} error - Error object
   * @returns {boolean} Whether error count exceeded threshold
   */
  handleOperationalError(context, error) {
    const key = `${context}:${error.message}`;
    const count = (this.errorCounts.get(key) || 0) + 1;
    this.errorCounts.set(key, count);

    // Log with context
    this.logger.error(`[${context}] ${error.message}`, {
      count,
      stack: error.stack?.split('\n')[0],
    });

    // Check if we should circuit break
    if (count >= this.maxErrorsPerMinute) {
      this.logger.warn(`Circuit breaker triggered for: ${context}`);
      this.circuitBreakers.set(context, Date.now() + 60000); // Block for 1 minute
      return true;
    }

    return false;
  }

  /**
   * Check if a context is circuit broken
   * @param {string} context - Context to check
   * @returns {boolean}
   */
  isCircuitBroken(context) {
    const breakUntil = this.circuitBreakers.get(context);
    if (!breakUntil) return false;

    if (Date.now() > breakUntil) {
      this.circuitBreakers.delete(context);
      this.errorCounts.delete(context);
      return false;
    }

    return true;
  }

  /**
   * Wrap an async function with error handling
   * @param {string} context - Error context
   * @param {Function} fn - Function to wrap
   * @returns {Function}
   */
  wrap(context, fn) {
    return async (...args) => {
      if (this.isCircuitBroken(context)) {
        throw new Error(`Circuit breaker active for: ${context}`);
      }

      try {
        return await fn(...args);
      } catch (error) {
        this.handleOperationalError(context, error);
        throw error;
      }
    };
  }

  /**
   * Log current system state
   */
  logSystemState() {
    const usage = process.memoryUsage();
    this.logger.info('System State:', {
      memory: {
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      },
      uptime: `${Math.round(process.uptime())}s`,
      errors: this.errorCounts.size,
    });
  }

  /**
   * Get error statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalErrors: 0,
      byContext: {},
      circuitBreakers: Array.from(this.circuitBreakers.keys()),
    };

    for (const [key, count] of this.errorCounts) {
      stats.totalErrors += count;
      stats.byContext[key] = count;
    }

    return stats;
  }

  /**
   * Cleanup old error counts
   */
  cleanupErrorCounts() {
    const hadErrors = this.errorCounts.size > 0;
    this.errorCounts.clear();
    // Only log if there were errors to clean up
    if (hadErrors) {
      this.logger.debug('Error counts cleaned up');
    }
  }

  /**
   * Graceful shutdown attempt
   */
  gracefulShutdown() {
    this.logger.info('Attempting graceful shutdown...');

    // Give logger time to flush
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  }
}

module.exports = { ErrorHandler };
