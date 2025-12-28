/**
 * Auto Enchant Manager
 * Handles automatic enchanting until target enchant is achieved
 * Supports: enchant, refine, transmute, transcend
 */

const { Logger } = require('../utils/logger');
const { DiscordUtils } = require('../utils/discord');
const { EPIC_RPG_BOT_ID, ENCHANT } = require('../config');

class AutoEnchantManager {
  constructor(client) {
    this.client = client;
    this.logger = Logger.create('Enchant');
    
    // Active enchant sessions per channel
    this.sessions = new Map();
  }

  /**
   * Start auto enchant session
   * @param {Object} channel - Discord channel
   * @param {string} type - enchant/refine/transmute/transcend
   * @param {string} equipment - sword/armor
   * @param {string} targetEnchant - Target enchant tier name
   */
  async start(channel, type, equipment, targetEnchant) {
    const sessionKey = channel.id;

    // Check if session already active
    if (this.sessions.has(sessionKey)) {
      await channel.send('⚠️ Auto enchant already running in this channel. Use `.off enchant` to stop.').catch(() => {});
      return;
    }

    // Validate type
    if (!ENCHANT.TYPES[type]) {
      await channel.send(`❌ Invalid type: ${type}. Valid types: ${Object.keys(ENCHANT.TYPES).join(', ')}`).catch(() => {});
      return;
    }

    // Validate equipment
    if (!ENCHANT.EQUIPMENT.includes(equipment)) {
      await channel.send(`❌ Invalid equipment: ${equipment}. Valid options: ${ENCHANT.EQUIPMENT.join(', ')}`).catch(() => {});
      return;
    }

    // Validate target enchant
    const targetTier = this.findTier(targetEnchant);
    if (!targetTier) {
      const validTiers = ENCHANT.TIERS.map(t => t.name.toLowerCase()).join(', ');
      await channel.send(`❌ Invalid enchant: ${targetEnchant}. Valid enchants: ${validTiers}`).catch(() => {});
      return;
    }

    // Create session
    const session = {
      channel,
      type,
      equipment,
      targetTier,
      targetEnchant: targetEnchant.toUpperCase(),
      running: true,
      attempts: 0,
      startTime: Date.now(),
    };

    this.sessions.set(sessionKey, session);

    this.logger.success(`Auto ${type} started for ${equipment} targeting ${targetEnchant.toUpperCase()}`);
    
    await channel.send([
      `✨ **Auto ${type.charAt(0).toUpperCase() + type.slice(1)} Started**`,
      ``,
      `🎯 **Target:** ${targetEnchant.toUpperCase()} (+${targetTier.bonus}% ${equipment === 'sword' ? 'AT' : 'DEF'})`,
      `⚔️ **Equipment:** ${equipment}`,
      `🔮 **Type:** ${type}`,
      ``,
      `Use \`.off enchant\` to stop`,
    ].join('\n')).catch(() => {});

    // Start enchanting loop
    await this.runEnchantLoop(session, sessionKey);
  }

  /**
   * Stop auto enchant session
   * @param {Object} channel - Discord channel
   */
  async stop(channel) {
    const sessionKey = channel.id;
    const session = this.sessions.get(sessionKey);

    if (!session) {
      await channel.send('⚠️ No auto enchant session running in this channel.').catch(() => {});
      return;
    }

    session.running = false;
    this.sessions.delete(sessionKey);

    const duration = Math.round((Date.now() - session.startTime) / 1000);
    
    this.logger.info(`Auto ${session.type} stopped after ${session.attempts} attempts (${duration}s)`);
    
    await channel.send([
      `🛑 **Auto ${session.type.charAt(0).toUpperCase() + session.type.slice(1)} Stopped**`,
      ``,
      `📊 **Stats:**`,
      `• Attempts: ${session.attempts}`,
      `• Duration: ${this.formatDuration(duration)}`,
      `• Target: ${session.targetEnchant} (not reached)`,
    ].join('\n')).catch(() => {});
  }

  /**
   * Main enchant loop
   */
  async runEnchantLoop(session, sessionKey) {
    while (session.running && this.sessions.has(sessionKey)) {
      try {
        session.attempts++;
        
        this.logger.command(session.type, `Attempt #${session.attempts} for ${session.equipment}`);

        // Send enchant command
        const response = await DiscordUtils.sendSlashAndWait(
          session.channel,
          EPIC_RPG_BOT_ID,
          session.type,
          [session.equipment],
          ENCHANT.RESPONSE_TIMEOUT
        );

        if (!response) {
          this.logger.warn('No response from bot, retrying...');
          await DiscordUtils.sleep(ENCHANT.RETRY_DELAY);
          continue;
        }

        // Check for EPIC Guard
        if (DiscordUtils.checkForEpicGuard(response)) {
          this.logger.error('EPIC GUARD DETECTED! Stopping auto enchant for safety');
          await session.channel.send('⚠️ **EPIC GUARD DETECTED!** Auto enchant stopped for safety.').catch(() => {});
          session.running = false;
          this.sessions.delete(sessionKey);
          return;
        }

        // Check for cooldown
        const cooldownMs = DiscordUtils.checkForCooldown(response);
        if (cooldownMs > 0) {
          this.logger.warn(`Cooldown detected: ${Math.ceil(cooldownMs / 1000)}s`);
          await session.channel.send(`⏳ Cooldown: ${Math.ceil(cooldownMs / 1000)}s - waiting...`).catch(() => {});
          await DiscordUtils.sleep(cooldownMs + 2000);
          continue;
        }

        // Check for insufficient coins
        if (this.checkInsufficientCoins(response)) {
          this.logger.error('Insufficient coins! Stopping auto enchant');
          await session.channel.send('💰 **Insufficient coins!** Auto enchant stopped.').catch(() => {});
          session.running = false;
          this.sessions.delete(sessionKey);
          return;
        }

        // Parse enchant result
        const result = this.parseEnchantResult(response);
        
        if (result) {
          this.logger.info(`Got: ${result.enchant} (+${result.bonus}%)`);

          // Check if target reached
          if (this.isTargetReached(result.enchant, session.targetEnchant)) {
            const duration = Math.round((Date.now() - session.startTime) / 1000);
            
            this.logger.success(`Target ${session.targetEnchant} reached!`);
            
            await session.channel.send([
              `🎉 **Target Enchant Achieved!**`,
              ``,
              `✨ **Result:** ${result.enchant} (+${result.bonus}% ${session.equipment === 'sword' ? 'AT' : 'DEF'})`,
              ``,
              `📊 **Stats:**`,
              `• Total Attempts: ${session.attempts}`,
              `• Duration: ${this.formatDuration(duration)}`,
            ].join('\n')).catch(() => {});

            session.running = false;
            this.sessions.delete(sessionKey);
            return;
          }
        }

        // Delay before next attempt
        await DiscordUtils.sleep(ENCHANT.RETRY_DELAY);

      } catch (error) {
        this.logger.error(`Enchant error: ${error.message}`);
        
        if (error.message.includes('Timeout')) {
          this.logger.warn('Bot response timeout, retrying...');
        } else {
          // Stop on unexpected errors
          await session.channel.send(`❌ Error: ${error.message}`).catch(() => {});
          session.running = false;
          this.sessions.delete(sessionKey);
          return;
        }

        await DiscordUtils.sleep(ENCHANT.RETRY_DELAY);
      }
    }
  }

  /**
   * Find tier by name
   */
  findTier(name) {
    const normalizedName = name.toLowerCase().replace(/[-_\s]/g, '');
    return ENCHANT.TIERS.find(tier => {
      const tierName = tier.name.toLowerCase().replace(/[-_\s]/g, '');
      return tierName === normalizedName;
    });
  }

  /**
   * Parse enchant result from bot response
   */
  parseEnchantResult(response) {
    // Check embeds for enchant result
    if (response.embeds?.length) {
      for (const embed of response.embeds) {
        // Check author for enchant type confirmation
        if (embed.author?.name) {
          const authorMatch = embed.author.name.match(/enchant|refine|transmute|transcend/i);
          if (!authorMatch) continue;
        }

        // Check fields for enchant result
        if (embed.fields?.length) {
          for (const field of embed.fields) {
            // Look for the sparkles pattern with enchant name
            const enchantMatch = field.name.match(/~-~>\s*\*{0,2}(\w+(?:-\w+)?)\*{0,2}\s*<~-~/i);
            if (enchantMatch) {
              const enchantName = enchantMatch[1].toUpperCase();
              const tier = this.findTier(enchantName);
              if (tier) {
                return {
                  enchant: enchantName,
                  bonus: tier.bonus,
                };
              }
            }

            // Alternative pattern: check for tier name in field
            for (const tier of ENCHANT.TIERS) {
              if (field.name.toUpperCase().includes(tier.name) || 
                  field.value.toUpperCase().includes(tier.name)) {
                return {
                  enchant: tier.name,
                  bonus: tier.bonus,
                };
              }
            }
          }
        }

        // Check description
        if (embed.description) {
          for (const tier of ENCHANT.TIERS) {
            if (embed.description.toUpperCase().includes(tier.name)) {
              return {
                enchant: tier.name,
                bonus: tier.bonus,
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if target enchant is reached (or better)
   */
  isTargetReached(currentEnchant, targetEnchant) {
    const currentIdx = ENCHANT.TIERS.findIndex(t => 
      t.name.toLowerCase() === currentEnchant.toLowerCase()
    );
    const targetIdx = ENCHANT.TIERS.findIndex(t => 
      t.name.toLowerCase() === targetEnchant.toLowerCase()
    );

    // Current enchant index >= target index means equal or better
    return currentIdx >= targetIdx;
  }

  /**
   * Check if response indicates insufficient coins
   */
  checkInsufficientCoins(response) {
    const keywords = ['not enough coins', 'insufficient', "you don't have enough"];
    
    if (response.content) {
      const lowerContent = response.content.toLowerCase();
      if (keywords.some(kw => lowerContent.includes(kw))) return true;
    }

    if (response.embeds?.length) {
      for (const embed of response.embeds) {
        const text = [embed.title, embed.description, ...(embed.fields || []).map(f => f.value)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (keywords.some(kw => text.includes(kw))) return true;
      }
    }

    return false;
  }

  /**
   * Format duration in human readable format
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
   * Get session status for a channel
   */
  getStatus(channel) {
    const session = this.sessions.get(channel.id);
    
    if (!session) {
      return '🔮 **Auto Enchant:** Not running';
    }

    const duration = Math.round((Date.now() - session.startTime) / 1000);

    return [
      `🔮 **Auto Enchant Status:**`,
      ``,
      `🎯 Target: ${session.targetEnchant}`,
      `⚔️ Equipment: ${session.equipment}`,
      `🔮 Type: ${session.type}`,
      `📊 Attempts: ${session.attempts}`,
      `⏱️ Duration: ${this.formatDuration(duration)}`,
    ].join('\n');
  }

  /**
   * Check if session is active for channel
   */
  isActive(channelId) {
    return this.sessions.has(channelId);
  }

  /**
   * Cleanup all sessions
   */
  cleanup() {
    for (const session of this.sessions.values()) {
      session.running = false;
    }
    this.sessions.clear();
  }
}

module.exports = { AutoEnchantManager };
