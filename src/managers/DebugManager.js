/**
 * Debug Manager
 * Handles debug commands and bot message inspection
 */

const { Logger } = require('../utils/logger');
const { DiscordUtils } = require('../utils/discord');
const { EPIC_RPG_BOT_ID, TIMEOUTS } = require('../config');

class DebugManager {
  constructor(client) {
    this.client = client;
    this.logger = Logger.create('Debug');
    this.enabled = false;
    this.channel = null;
    this.pendingMessages = new Map();
  }

  /**
   * Enable/disable debug mode
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.logger.info(`Debug Mode ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Check if debug mode is enabled
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
   * Handle debug command from user
   */
  async handleDebugCommand(message) {
    await message.delete().catch(() => {});

    const content = message.content.toLowerCase().trim();

    // Debug a replied message
    if (message.reference?.messageId) {
      return await this.debugRepliedMessage(message);
    }

    // Debug a slash command
    if (content.startsWith('.debug ')) {
      const command = content.substring(7).trim();
      if (command) {
        return await this.debugSlashCommand(message, command);
      }
    }

    // Show usage
    await this.sendUsage(message.channel);
    return true;
  }

  /**
   * Debug a replied message
   */
  async debugRepliedMessage(message) {
    try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);

      if (repliedMessage.author.id !== EPIC_RPG_BOT_ID) {
        await message.channel.send(`❌ Can only debug messages from EPIC RPG bot`).catch(() => {});
        return true;
      }

      await message.channel.send('🔍 **Debugging replied message...**').catch(() => {});
      await this.formatBotMessage(message.channel, repliedMessage);
      return true;

    } catch (error) {
      await message.channel.send(`❌ Error: ${error.message}`).catch(() => {});
      return true;
    }
  }

  /**
   * Debug a slash command
   */
  async debugSlashCommand(message, command) {
    try {
      await message.channel.send(`🔍 **Executing debug command:** \`${command}\``).catch(() => {});

      const response = await DiscordUtils.sendSlashAndWait(
        message.channel,
        EPIC_RPG_BOT_ID,
        command,
        [],
        TIMEOUTS.DEBUG_COMMAND
      );

      if (response) {
        await message.channel.send('✅ **Bot responded! Debugging...**').catch(() => {});
        await this.formatBotMessage(message.channel, response);
      } else {
        await message.channel.send('❌ No response from bot').catch(() => {});
      }

    } catch (error) {
      if (error.message.includes('Timeout')) {
        await message.channel.send('⏱️ Bot response timeout (15s)').catch(() => {});
      } else {
        await message.channel.send(`❌ Error: ${error.message}`).catch(() => {});
      }
    }
    return true;
  }

  /**
   * Send debug usage information
   */
  async sendUsage(channel) {
    const usage = [
      '📖 **Debug Usage:**',
      '• `.debug <command>` - Debug a slash command response',
      '• Reply to a bot message with `.debug` - Debug that message',
    ].join('\n');
    await channel.send(usage).catch(() => {});
  }

  /**
   * Log bot debug info when debug mode is enabled
   */
  async logBotDebugInfo(message) {
    if (!this.enabled) return;

    // Handle "thinking" messages
    if (message.flags?.has('LOADING')) {
      await message.channel.send('🔄 **[DEBUG]** Bot is thinking...').catch(() => {});

      this.pendingMessages.set(message.id, message);

      const onUpdate = async (oldMsg, newMsg) => {
        if (oldMsg.id === message.id) {
          message.client.off('messageUpdate', onUpdate);
          this.pendingMessages.delete(message.id);
          await message.channel.send('✅ **[DEBUG]** Bot finished thinking:').catch(() => {});
          await this.formatBotMessage(message.channel, newMsg);
        }
      };

      message.client.on('messageUpdate', onUpdate);

      // Cleanup timeout
      setTimeout(() => {
        if (this.pendingMessages.has(message.id)) {
          message.client.off('messageUpdate', onUpdate);
          this.pendingMessages.delete(message.id);
        }
      }, TIMEOUTS.THINKING_CLEANUP);

      return;
    }

    await this.formatBotMessage(message.channel, message);
  }

  /**
   * Format and send bot message debug info
   */
  async formatBotMessage(channel, message) {
    try {
      // Content
      if (message.content?.trim()) {
        await channel.send(`**[DEBUG]** Content:\n\`\`\`\n${message.content}\n\`\`\``).catch(() => {});
      }

      // Embeds
      if (message.embeds?.length) {
        for (let i = 0; i < message.embeds.length; i++) {
          const info = this.formatEmbed(message.embeds[i], i + 1);
          await this.sendChunked(channel, info);
        }
      }

      // Components (buttons)
      if (message.components?.length) {
        for (let i = 0; i < message.components.length; i++) {
          const info = this.formatComponents(message.components[i], i + 1);
          await this.sendChunked(channel, info);
        }
      }

      // Metadata
      const metadata = this.formatMetadata(message);
      await channel.send(metadata).catch(() => {});

      // Empty message warning
      if (!message.content?.trim() && !message.embeds?.length && !message.components?.length) {
        await channel.send('⚠️ **[DEBUG]** Message has no content/embeds/components').catch(() => {});
      }

    } catch (error) {
      this.logger.error(`Format error: ${error.message}`);
    }
  }

  /**
   * Format embed for display
   */
  formatEmbed(embed, index) {
    let info = `**[DEBUG]** Embed ${index}:\n`;

    if (embed.title) info += `**Title:** ${embed.title}\n`;
    if (embed.description) info += `**Description:** ${embed.description}\n`;
    if (embed.color) info += `**Color:** ${embed.color}\n`;
    if (embed.author) info += `**Author:** ${embed.author.name || 'N/A'}\n`;
    if (embed.footer) info += `**Footer:** ${embed.footer.text || 'N/A'}\n`;
    if (embed.timestamp) info += `**Timestamp:** ${embed.timestamp}\n`;

    if (embed.fields?.length) {
      info += `**Fields (${embed.fields.length}):**\n`;
      embed.fields.forEach((field, idx) => {
        info += `  ${idx + 1}. **${field.name}:** ${field.value}\n`;
      });
    }

    return info;
  }

  /**
   * Format components for display
   */
  formatComponents(row, rowIndex) {
    let info = `**[DEBUG]** Button Row ${rowIndex}:\n`;

    if (row.components?.length) {
      info += `**Total Buttons:** ${row.components.length}\n`;

      row.components.forEach((comp, idx) => {
        info += `**Button ${idx + 1}:**\n`;
        info += `  - Type: ${comp.type || 'Unknown'}\n`;
        info += `  - Style: ${comp.style || 'Unknown'}\n`;
        info += `  - Label: ${comp.label || 'No Label'}\n`;
        info += `  - Custom ID: ${comp.customId || 'No Custom ID'}\n`;
        info += `  - Disabled: ${comp.disabled || false}\n`;
        if (comp.emoji) {
          info += `  - Emoji: ${comp.emoji.name || comp.emoji.id || 'Unknown'}\n`;
        }
        if (comp.url) {
          info += `  - URL: ${comp.url}\n`;
        }
        info += '\n';
      });
    }

    return info;
  }

  /**
   * Format message metadata
   */
  formatMetadata(message) {
    let info = `**[DEBUG]** Metadata:\n`;
    info += `**Message ID:** ${message.id}\n`;
    info += `**Author:** ${message.author.username} (${message.author.id})\n`;
    info += `**Channel:** ${message.channel.name || message.channel.id}\n`;
    info += `**Timestamp:** ${message.createdAt}\n`;
    info += `**Has Content:** ${!!message.content}\n`;
    info += `**Has Embeds:** ${!!(message.embeds?.length)}\n`;
    info += `**Has Components:** ${!!(message.components?.length)}`;

    if (message.flags) {
      info += `\n**Flags:** ${message.flags.toArray().join(', ') || 'None'}`;
    }

    return info;
  }

  /**
   * Send message in chunks if too long
   */
  async sendChunked(channel, text) {
    if (text.length <= 1900) {
      await channel.send(text).catch(() => {});
      return;
    }

    const chunks = text.match(/.{1,1900}(\n|$)/g) || [];
    for (const chunk of chunks) {
      await channel.send(chunk).catch(() => {});
    }
  }
}

module.exports = { DebugManager };
