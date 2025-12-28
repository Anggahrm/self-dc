/**
 * Professional Logger Utility
 * Provides clean, formatted logging with different log levels
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  SUCCESS: 2,
  WARN: 3,
  ERROR: 4,
};

// ANSI color codes for terminal output
const Colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

class Logger {
  constructor(module = 'System') {
    this.module = module;
    this.logLevel = LogLevel.DEBUG;
  }

  static create(module) {
    return new Logger(module);
  }

  setLevel(level) {
    this.logLevel = level;
  }

  formatTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.formatTimestamp();
    const prefix = `[${timestamp}] [${this.module}]`;
    
    if (data) {
      return `${prefix} ${level}: ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${level}: ${message}`;
  }

  colorize(color, text) {
    return `${color}${text}${Colors.reset}`;
  }

  debug(message, data = null) {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(this.colorize(Colors.gray, this.formatMessage('DEBUG', message, data)));
    }
  }

  info(message, data = null) {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.colorize(Colors.blue, this.formatMessage('INFO', message, data)));
    }
  }

  success(message, data = null) {
    if (this.logLevel <= LogLevel.SUCCESS) {
      console.log(this.colorize(Colors.green, this.formatMessage('SUCCESS', message, data)));
    }
  }

  warn(message, data = null) {
    if (this.logLevel <= LogLevel.WARN) {
      console.log(this.colorize(Colors.yellow, this.formatMessage('WARN', message, data)));
    }
  }

  error(message, data = null) {
    if (this.logLevel <= LogLevel.ERROR) {
      console.log(this.colorize(Colors.red, this.formatMessage('ERROR', message, data)));
    }
  }

  command(action, details = '') {
    const timestamp = this.formatTimestamp();
    const message = details 
      ? `[${timestamp}] [${this.module}] ▶ ${action}: ${details}`
      : `[${timestamp}] [${this.module}] ▶ ${action}`;
    console.log(this.colorize(Colors.cyan, message));
  }

  response(status, message) {
    const timestamp = this.formatTimestamp();
    const statusIcon = status === 'success' ? '✓' : status === 'error' ? '✗' : '•';
    const color = status === 'success' ? Colors.green : status === 'error' ? Colors.red : Colors.white;
    console.log(this.colorize(color, `[${timestamp}] [${this.module}] ${statusIcon} ${message}`));
  }
}

module.exports = { Logger, LogLevel };
