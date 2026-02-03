/**
 * Validation Utilities
 * Helper functions for validating Discord IDs and user input
 */

// Discord snowflake ID pattern: 17-20 digits
const SNOWFLAKE_REGEX = /^[0-9]{17,20}$/;

// Common dangerous patterns for injection prevention
const DANGEROUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+=/i,
  /data:text\/html/i,
];

// Valid command names
const VALID_COMMANDS = [
  'adventure', 'axe', 'hunt', 'heal',
  'enchant', 'refine', 'transmute', 'transcend',
];

// Valid equipment types
const VALID_EQUIPMENT = ['sword', 'armor'];

class ValidationUtils {
  /**
   * Check if value is a valid Discord snowflake ID
   * @param {string} id - ID to validate
   * @returns {boolean}
   */
  static isValidSnowflake(id) {
    if (typeof id !== 'string' && typeof id !== 'number') return false;
    const strId = String(id);
    return SNOWFLAKE_REGEX.test(strId);
  }

  /**
   * Validate and sanitize a Discord channel ID
   * @param {string} channelId - Channel ID to validate
   * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
   */
  static validateChannelId(channelId) {
    if (!channelId) {
      return { valid: false, error: 'Channel ID is required' };
    }

    const sanitized = this.sanitizeInput(String(channelId));

    if (!this.isValidSnowflake(sanitized)) {
      return { valid: false, error: 'Invalid channel ID format' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate and sanitize a guild/server ID
   * @param {string} guildId - Guild ID to validate
   * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
   */
  static validateGuildId(guildId) {
    if (!guildId) {
      return { valid: false, error: 'Guild ID is required' };
    }

    const sanitized = this.sanitizeInput(String(guildId));

    if (!this.isValidSnowflake(sanitized)) {
      return { valid: false, error: 'Invalid guild ID format' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate and sanitize a user ID
   * @param {string} userId - User ID to validate
   * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
   */
  static validateUserId(userId) {
    if (!userId) {
      return { valid: false, error: 'User ID is required' };
    }

    const sanitized = this.sanitizeInput(String(userId));

    if (!this.isValidSnowflake(sanitized)) {
      return { valid: false, error: 'Invalid user ID format' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate enchant command input
   * @param {string} type - Enchant type
   * @param {string} equipment - Equipment type
   * @param {string} target - Target enchant name
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validateEnchantInput(type, equipment, target) {
    if (!type || !VALID_COMMANDS.includes(type.toLowerCase())) {
      return { valid: false, error: `Invalid enchant type. Valid: ${VALID_COMMANDS.join(', ')}` };
    }

    if (!equipment || !VALID_EQUIPMENT.includes(equipment.toLowerCase())) {
      return { valid: false, error: `Invalid equipment. Valid: ${VALID_EQUIPMENT.join(', ')}` };
    }

    if (!target || typeof target !== 'string') {
      return { valid: false, error: 'Target enchant is required' };
    }

    const sanitizedTarget = this.sanitizeInput(target);
    if (sanitizedTarget.length > 50) {
      return { valid: false, error: 'Target enchant name too long (max 50 chars)' };
    }

    return { valid: true, sanitizedTarget };
  }

  /**
   * Sanitize user input to prevent injection
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized input
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') return '';

    // Trim whitespace
    let sanitized = input.trim();

    // Remove zero-width characters
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    return sanitized;
  }

  /**
   * Check if input contains potentially dangerous content
   * @param {string} input - Input to check
   * @returns {Object} { safe: boolean, reason?: string }
   */
  static isSafeInput(input) {
    if (typeof input !== 'string') return { safe: true };

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        return { safe: false, reason: 'Potentially dangerous content detected' };
      }
    }

    return { safe: true };
  }

  /**
   * Validate command arguments length
   * @param {Array} args - Command arguments
   * @param {number} min - Minimum required
   * @param {number} max - Maximum allowed
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validateArgsLength(args, min, max) {
    const length = args?.length || 0;

    if (min !== undefined && length < min) {
      return { valid: false, error: `Too few arguments. Minimum: ${min}` };
    }

    if (max !== undefined && length > max) {
      return { valid: false, error: `Too many arguments. Maximum: ${max}` };
    }

    return { valid: true };
  }

  /**
   * Validate message content length
   * @param {string} content - Message content
   * @param {number} maxLength - Maximum length (default: 2000 for Discord)
   * @returns {Object} { valid: boolean, error?: string, truncated?: string }
   */
  static validateMessageLength(content, maxLength = 2000) {
    if (!content) return { valid: true };

    if (content.length > maxLength) {
      return {
        valid: false,
        error: `Message too long (${content.length}/${maxLength})`,
        truncated: content.substring(0, maxLength - 3) + '...'
      };
    }

    return { valid: true };
  }

  /**
   * Validate timeout value
   * @param {number} timeout - Timeout in milliseconds
   * @param {number} min - Minimum allowed (default: 1000)
   * @param {number} max - Maximum allowed (default: 300000 = 5min)
   * @returns {Object} { valid: boolean, error?: string, value?: number }
   */
  static validateTimeout(timeout, min = 1000, max = 300000) {
    const num = Number(timeout);

    if (isNaN(num)) {
      return { valid: false, error: 'Timeout must be a number' };
    }

    if (num < min) {
      return { valid: false, error: `Timeout too short. Minimum: ${min}ms`, value: min };
    }

    if (num > max) {
      return { valid: false, error: `Timeout too long. Maximum: ${max}ms`, value: max };
    }

    return { valid: true, value: num };
  }

  /**
   * Validate URL for safety
   * @param {string} url - URL to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validateUrl(url) {
    if (!url) return { valid: false, error: 'URL is required' };

    try {
      const parsed = new URL(url);

      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid protocol. Only HTTP/HTTPS allowed' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }
}

module.exports = { ValidationUtils };
