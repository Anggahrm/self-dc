/**
 * Discord Utilities
 * Helper functions for Discord interactions
 */

// Pre-compiled regex patterns for performance
const REGEX = {
  HP: /remaining HP is (\d+)\/(\d+)/i,
  COOLDOWN_HMS: /wait at least \*{0,2}(\d+)h (\d+)m (\d+)s\*{0,2}/i,
  COOLDOWN_MS: /wait at least \*{0,2}(\d+)m (\d+)s\*{0,2}/i,
  COOLDOWN_S: /wait at least \*{0,2}(\d+)s\*{0,2}/i,
  COOLDOWN_FALLBACK: /wait.*?(\d+)h.*?(\d+)m.*?(\d+)s/i,
  NUMBER_FORMAT: /\B(?=(\d{3})+(?!\d))/g,
};

// EPIC Guard detection phrases
const EPIC_GUARD_PHRASES = [
  'EPIC GUARD: stop there',
  'We have to check you are actually playing',
  'EPIC GUARD'
];

class DiscordUtils {
  /**
   * Wait for a specified number of milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Safely delete a message (suppress errors)
   * @param {Object} message - Discord message
   * @returns {Promise<boolean>}
   */
  static async safeDelete(message) {
    if (!message?.delete) return false;
    try {
      await message.delete();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Safely send a message to a channel (suppress errors)
   * @param {Object} channel - Discord channel
   * @param {string} content - Message content
   * @returns {Promise<Object|null>}
   */
  static async safeSend(channel, content) {
    if (!channel?.send) return null;
    try {
      return await channel.send(content);
    } catch {
      return null;
    }
  }

  /**
   * Format duration in human readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration
   */
  static formatDuration(seconds) {
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
   * Format number with commas
   * @param {number} num - Number to format
   * @returns {string} Formatted number
   */
  static formatNumber(num) {
    if (typeof num !== 'number') return String(num);
    return num.toString().replace(REGEX.NUMBER_FORMAT, ',');
  }

  /**
   * Send slash command and wait for bot response
   * @param {Object} channel - Discord channel
   * @param {string} botId - Target bot ID
   * @param {string} command - Slash command name
   * @param {Array} options - Command options
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Bot response message
   */
  static async sendSlashAndWait(channel, botId, command, options = [], timeout = 15 * 60 * 1000) {
    const slashResponse = options.length > 0
      ? await channel.sendSlash(botId, command, ...options)
      : await channel.sendSlash(botId, command);

    if (!slashResponse) {
      throw new Error('Failed to send slash command');
    }

    // Check if bot is "thinking" (deferred response)
    if (slashResponse.flags && slashResponse.flags.has('LOADING')) {
      return new Promise((resolve, reject) => {
        let done = false;

        const timeoutId = setTimeout(() => {
          if (!done) {
            done = true;
            channel.client.off('messageUpdate', onUpdate);
            reject(new Error('Timeout waiting for deferred bot response'));
          }
        }, timeout);

        function onUpdate(oldMsg, newMsg) {
          if (oldMsg.id === slashResponse.id && !done) {
            done = true;
            clearTimeout(timeoutId);
            channel.client.off('messageUpdate', onUpdate);
            resolve(newMsg);
          }
        }

        channel.client.on('messageUpdate', onUpdate);
      });
    }

    return slashResponse;
  }

  /**
   * Wait for bot response to a message
   * @param {Object} originalMessage - Original message
   * @param {string} botId - Target bot ID
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Bot response message
   */
  static async waitForBotResponse(originalMessage, botId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let done = false;

      const timeoutId = setTimeout(() => {
        if (!done) {
          done = true;
          originalMessage.client.off('messageCreate', onMessage);
          originalMessage.client.off('messageUpdate', onUpdate);
          reject(new Error('Timeout waiting for bot response'));
        }
      }, timeout);

      function onMessage(message) {
        if (message.author.id === botId && message.channel.id === originalMessage.channel.id) {
          // Skip "thinking" messages
          if (message.flags && message.flags.has('LOADING')) return;

          if (!done) {
            done = true;
            clearTimeout(timeoutId);
            originalMessage.client.off('messageCreate', onMessage);
            originalMessage.client.off('messageUpdate', onUpdate);
            resolve(message);
          }
        }
      }

      function onUpdate(oldMsg, newMsg) {
        if (newMsg.author.id === botId && newMsg.channel.id === originalMessage.channel.id) {
          // Handle transition from "thinking" to actual response
          if (oldMsg.flags?.has('LOADING') && !newMsg.flags?.has('LOADING')) {
            if (!done) {
              done = true;
              clearTimeout(timeoutId);
              originalMessage.client.off('messageCreate', onMessage);
              originalMessage.client.off('messageUpdate', onUpdate);
              resolve(newMsg);
            }
          }
        }
      }

      originalMessage.client.on('messageCreate', onMessage);
      originalMessage.client.on('messageUpdate', onUpdate);
    });
  }

  /**
   * Parse HP from bot response content
   * @param {string} content - Message content
   * @returns {Object|null} HP data { current, max } or null
   */
  static parseHP(content) {
    const match = content.match(REGEX.HP);
    if (!match) return null;

    const current = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);

    // Validate parsed numbers
    if (isNaN(current) || isNaN(max) || current < 0 || max <= 0) {
      return null;
    }

    return { current, max };
  }

  /**
   * Parse cooldown duration from title
   * @param {string} title - Embed title
   * @returns {number|null} Cooldown in milliseconds or null
   */
  static parseCooldown(title) {
    // Match: "wait at least **1h 2m 3s**" or "wait at least 1h 2m 3s"
    let match = title.match(REGEX.COOLDOWN_HMS);
    if (match) {
      return (parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10)) * 1000;
    }

    // Match: "wait at least **2m 3s**" or "wait at least 2m 3s"
    match = title.match(REGEX.COOLDOWN_MS);
    if (match) {
      return (parseInt(match[1], 10) * 60 + parseInt(match[2], 10)) * 1000;
    }

    // Match: "wait at least **3s**" or "wait at least 3s"
    match = title.match(REGEX.COOLDOWN_S);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }

    // Fallback pattern
    match = title.match(REGEX.COOLDOWN_FALLBACK);
    if (match) {
      return (parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10)) * 1000;
    }

    return null;
  }

  /**
   * Check if bot response contains a cooldown message
   * @param {Object} botResponse - Bot response message
   * @returns {number} Cooldown in milliseconds or 0
   */
  static checkForCooldown(botResponse) {
    if (botResponse.embeds?.length > 0) {
      for (const embed of botResponse.embeds) {
        if (embed.title?.includes('wait at least')) {
          const cooldownMs = this.parseCooldown(embed.title);
          if (cooldownMs > 0) return cooldownMs;
        }
      }
    }
    return 0;
  }

  /**
   * Check if bot response is an EPIC Guard captcha
   * @param {Object} botResponse - Bot response message
   * @returns {boolean} True if EPIC Guard detected
   */
  static checkForEpicGuard(botResponse) {
    // Check content
    if (botResponse.content) {
      for (const phrase of EPIC_GUARD_PHRASES) {
        if (botResponse.content.includes(phrase)) return true;
      }
    }

    // Check embeds
    if (botResponse.embeds?.length > 0) {
      for (const embed of botResponse.embeds) {
        const fieldsToCheck = [
          embed.title,
          embed.description,
          ...(embed.fields || []).flatMap(f => [f.name, f.value])
        ];

        for (const field of fieldsToCheck) {
          if (field) {
            for (const phrase of EPIC_GUARD_PHRASES) {
              if (field.includes(phrase)) return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Click a button and wait for the bot's updated response
   * @param {Object} message - Message containing the button
   * @param {string} customId - Custom ID of the button to click
   * @param {string} botId - Target bot ID
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Bot response message
   */
  static async clickButtonAndWait(message, customId, botId, timeout = 15000) {
    return new Promise((resolve, reject) => {
      let done = false;

      const timeoutId = setTimeout(() => {
        if (!done) {
          done = true;
          message.client.off('messageUpdate', onUpdate);
          reject(new Error('Timeout waiting for button response'));
        }
      }, timeout);

      function onUpdate(oldMsg, newMsg) {
        // Check if this is the same message being updated by the bot
        if (newMsg.id === message.id && newMsg.author.id === botId) {
          if (!done) {
            done = true;
            clearTimeout(timeoutId);
            message.client.off('messageUpdate', onUpdate);
            resolve(newMsg);
          }
        }
      }

      message.client.on('messageUpdate', onUpdate);

      // Click the button after setting up the listener
      message.clickButton(customId).catch(err => {
        if (!done) {
          done = true;
          clearTimeout(timeoutId);
          message.client.off('messageUpdate', onUpdate);
          reject(err);
        }
      });
    });
  }
}

module.exports = { DiscordUtils };
