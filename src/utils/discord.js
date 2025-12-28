/**
 * Discord Utilities
 * Helper functions for Discord interactions
 */

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
   * Send slash command and wait for bot response
   * @param {Object} channel - Discord channel
   * @param {string} botId - Target bot ID
   * @param {string} command - Slash command name
   * @param {Array} options - Command options
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Bot response message
   */
  static async sendSlashAndWait(channel, botId, command, options = [], timeout = 15 * 60 * 1000) {
    try {
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
    } catch (error) {
      throw error;
    }
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
    const match = content.match(/remaining HP is (\d+)\/(\d+)/i);
    return match ? { current: parseInt(match[1]), max: parseInt(match[2]) } : null;
  }

  /**
   * Parse cooldown duration from title
   * @param {string} title - Embed title
   * @returns {number|null} Cooldown in milliseconds or null
   */
  static parseCooldown(title) {
    // Match: "wait at least **1h 2m 3s**" or "wait at least 1h 2m 3s"
    let match = title.match(/wait at least \*{0,2}(\d+)h (\d+)m (\d+)s\*{0,2}/i);
    if (match) {
      return (parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3])) * 1000;
    }

    // Match: "wait at least **2m 3s**" or "wait at least 2m 3s"
    match = title.match(/wait at least \*{0,2}(\d+)m (\d+)s\*{0,2}/i);
    if (match) {
      return (parseInt(match[1]) * 60 + parseInt(match[2])) * 1000;
    }

    // Match: "wait at least **3s**" or "wait at least 3s"
    match = title.match(/wait at least \*{0,2}(\d+)s\*{0,2}/i);
    if (match) {
      return parseInt(match[1]) * 1000;
    }

    // Fallback pattern
    match = title.match(/wait.*?(\d+)h.*?(\d+)m.*?(\d+)s/i);
    if (match) {
      return (parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3])) * 1000;
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
    const guardPhrases = [
      'EPIC GUARD: stop there',
      'We have to check you are actually playing',
      'EPIC GUARD'
    ];

    // Check content
    if (botResponse.content) {
      for (const phrase of guardPhrases) {
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
            for (const phrase of guardPhrases) {
              if (field.includes(phrase)) return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Format number with commas
   * @param {number} num - Number to format
   * @returns {string} Formatted number
   */
  static formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

module.exports = { DiscordUtils };
