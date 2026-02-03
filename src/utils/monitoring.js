/**
 * Monitoring Utilities
 * System metrics and health monitoring
 */

const os = require('os');

class Monitoring {
  constructor(client) {
    this.client = client;
    this.startTime = Date.now();
    this.metrics = {
      commandsExecuted: 0,
      messagesProcessed: 0,
      apiCalls: 0,
      errors: 0,
    };
    this.hourlyStats = new Map();
  }

  /**
   * Initialize monitoring
   */
  initialize() {
    // Record hourly stats
    setInterval(() => this.recordHourlyStats(), 3600000); // Every hour

    // Track message processing
    this.client.on('messageCreate', () => {
      this.metrics.messagesProcessed++;
    });
  }

  /**
   * Record command execution
   */
  recordCommand() {
    this.metrics.commandsExecuted++;
  }

  /**
   * Record message processed
   */
  recordMessage() {
    this.metrics.messagesProcessed++;
  }

  /**
   * Record API call
   */
  recordApiCall() {
    this.metrics.apiCalls++;
  }

  /**
   * Record error
   */
  recordError() {
    this.metrics.errors++;
  }

  /**
   * Get system metrics
   * @returns {Object}
   */
  getSystemMetrics() {
    const usage = process.memoryUsage();
    const loadAvg = os.loadavg();

    return {
      memory: {
        used: Math.round(usage.rss / 1024 / 1024),
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        systemTotal: Math.round(os.totalmem() / 1024 / 1024),
        systemFree: Math.round(os.freemem() / 1024 / 1024),
      },
      cpu: {
        loadAvg1m: loadAvg[0].toFixed(2),
        loadAvg5m: loadAvg[1].toFixed(2),
        loadAvg15m: loadAvg[2].toFixed(2),
        cores: os.cpus().length,
      },
      uptime: {
        process: this.formatDuration(Math.floor(process.uptime())),
        system: this.formatDuration(os.uptime()),
        bot: this.formatDuration(Math.floor((Date.now() - this.startTime) / 1000)),
      },
      platform: {
        node: process.version,
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
      },
    };
  }

  /**
   * Get Discord client metrics
   * @returns {Object}
   */
  getDiscordMetrics() {
    return {
      status: this.client.readyState || 'unknown',
      ping: this.client.ws?.ping || 0,
      guilds: this.client.guilds?.cache?.size || 0,
      channels: this.client.channels?.cache?.size || 0,
      users: this.client.users?.cache?.size || 0,
      shards: this.client.ws?.shards?.size || 1,
    };
  }

  /**
   * Get application metrics
   * @returns {Object}
   */
  getAppMetrics() {
    return {
      ...this.metrics,
      commandsPerHour: this.calculateCommandsPerHour(),
      messagesPerHour: this.calculateMessagesPerHour(),
    };
  }

  /**
   * Calculate commands per hour
   * @returns {number}
   */
  calculateCommandsPerHour() {
    const hours = (Date.now() - this.startTime) / 3600000;
    return hours > 0 ? Math.round(this.metrics.commandsExecuted / hours) : 0;
  }

  /**
   * Calculate messages per hour
   * @returns {number}
   */
  calculateMessagesPerHour() {
    const hours = (Date.now() - this.startTime) / 3600000;
    return hours > 0 ? Math.round(this.metrics.messagesProcessed / hours) : 0;
  }

  /**
   * Record hourly statistics
   */
  recordHourlyStats() {
    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    this.hourlyStats.set(hour, { ...this.metrics });

    // Keep only last 24 hours
    const keys = Array.from(this.hourlyStats.keys());
    if (keys.length > 24) {
      this.hourlyStats.delete(keys[0]);
    }
  }

  /**
   * Get health status
   * @returns {Object}
   */
  getHealthStatus() {
    const system = this.getSystemMetrics();
    const discord = this.getDiscordMetrics();

    const checks = {
      memory: system.memory.used < system.memory.systemTotal * 0.8,
      heap: system.memory.heapUsed < system.memory.heapTotal * 0.9,
      discord: discord.status === 'READY',
      ping: discord.ping < 500,
      errors: this.metrics.errors < 100,
    };

    const healthy = Object.values(checks).every(Boolean);

    return {
      healthy,
      status: healthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format health status for display
   * @returns {string}
   */
  formatHealthStatus() {
    const health = this.getHealthStatus();
    const system = this.getSystemMetrics();
    const discord = this.getDiscordMetrics();
    const app = this.getAppMetrics();

    const statusIcon = health.healthy ? '🟢' : '🟡';

    return [
      `${statusIcon} **Bot Health Status: ${health.status.toUpperCase()}**`,
      '',
      '📊 **System:**',
      `Memory: ${system.memory.used}MB / ${system.memory.systemTotal}MB`,
      `Heap: ${system.memory.heapUsed}MB / ${system.memory.heapTotal}MB`,
      `CPU Load: ${system.cpu.loadAvg1m} (${system.cpu.cores} cores)`,
      '',
      '🤖 **Discord:**',
      `Status: ${discord.status}`,
      `Ping: ${discord.ping}ms`,
      `Guilds: ${discord.guilds} | Channels: ${discord.channels}`,
      '',
      '📈 **Metrics:**',
      `Commands: ${app.commandsExecuted} (${app.commandsPerHour}/hr)`,
      `Messages: ${app.messagesProcessed} (${app.messagesPerHour}/hr)`,
      `Errors: ${app.errors}`,
      '',
      '⏱️ **Uptime:**',
      `Bot: ${system.uptime.bot}`,
      `System: ${system.uptime.system}`,
    ].join('\n');
  }

  /**
   * Format duration in human readable format
   * @param {number} seconds
   * @returns {string}
   */
  formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Get full status report
   * @returns {Object}
   */
  getFullStatus() {
    return {
      health: this.getHealthStatus(),
      system: this.getSystemMetrics(),
      discord: this.getDiscordMetrics(),
      app: this.getAppMetrics(),
    };
  }
}

module.exports = { Monitoring };
