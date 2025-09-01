const { EPIC_RPG_BOT_ID } = require('../config/config');
const { Utils } = require('../utils/utils');

class DebugManager {
  constructor(client) {
    this.client = client;
    this.debugEnabled = false;
    this.currentChannel = null;
  }

  setDebugEnabled(enabled) {
    this.debugEnabled = enabled;
  }

  isDebugEnabled() {
    return this.debugEnabled;
  }

  setCurrentChannel(channel) {
    this.currentChannel = channel;
  }

  async debugBotMessage(message, targetMessage) {
    try {
      console.log('🔍 Starting debug of bot message...');
      
      // Debug message content
      if (targetMessage.content && targetMessage.content.trim()) {
        await message.channel.send(`**[DEBUG]** Bot Message Content:\n\`\`\`\n${targetMessage.content}\n\`\`\``).catch(() => {});
      }

      // Debug embeds
      if (targetMessage.embeds && targetMessage.embeds.length > 0) {
        await message.channel.send(`**[DEBUG]** Bot has ${targetMessage.embeds.length} embed(s)`).catch(() => {});

        for (let i = 0; i < targetMessage.embeds.length; i++) {
          const embed = targetMessage.embeds[i];
          let embedInfo = `**[DEBUG]** Embed ${i + 1}:\n`;

          if (embed.title) embedInfo += `**Title:** ${embed.title}\n`;
          if (embed.description) embedInfo += `**Description:** ${embed.description}\n`;
          if (embed.color) embedInfo += `**Color:** ${embed.color}\n`;
          if (embed.author) embedInfo += `**Author:** ${embed.author.name || 'N/A'}\n`;
          if (embed.footer) embedInfo += `**Footer:** ${embed.footer.text || 'N/A'}\n`;
          if (embed.timestamp) embedInfo += `**Timestamp:** ${embed.timestamp}\n`;

          if (embed.fields && embed.fields.length > 0) {
            embedInfo += `**Fields (${embed.fields.length}):**\n`;
            embed.fields.forEach((field, index) => {
              embedInfo += `  ${index + 1}. **${field.name}:** ${field.value}\n`;
            });
          }

          // Split long messages
          if (embedInfo.length > 1900) {
            const chunks = embedInfo.match(/.{1,1900}(\n|$)/g);
            for (const chunk of chunks) {
              await message.channel.send(chunk).catch(() => {});
            }
          } else {
            await message.channel.send(embedInfo).catch(() => {});
          }
        }
      }

      // Debug buttons/components
      if (targetMessage.components && targetMessage.components.length > 0) {
        await message.channel.send(`**[DEBUG]** Bot has ${targetMessage.components.length} component row(s) with buttons`).catch(() => {});
        
        for (let rowIndex = 0; rowIndex < targetMessage.components.length; rowIndex++) {
          const row = targetMessage.components[rowIndex];
          let buttonInfo = `**[DEBUG]** Button Row ${rowIndex + 1}:\n`;
          
          if (row.components && row.components.length > 0) {
            buttonInfo += `**Total Buttons:** ${row.components.length}\n`;
            
            row.components.forEach((component, btnIndex) => {
              buttonInfo += `**Button ${btnIndex + 1}:**\n`;
              buttonInfo += `  - Type: ${component.type || 'Unknown'}\n`;
              buttonInfo += `  - Style: ${component.style || 'Unknown'}\n`;
              buttonInfo += `  - Label: ${component.label || 'No Label'}\n`;
              buttonInfo += `  - Custom ID: ${component.customId || 'No Custom ID'}\n`;
              buttonInfo += `  - Disabled: ${component.disabled || false}\n`;
              if (component.emoji) {
                buttonInfo += `  - Emoji: ${component.emoji.name || component.emoji.id || 'Unknown emoji'}\n`;
              }
              if (component.url) {
                buttonInfo += `  - URL: ${component.url}\n`;
              }
              buttonInfo += `\n`;
            });
          }

          // Split long button info
          if (buttonInfo.length > 1900) {
            const chunks = buttonInfo.match(/.{1,1900}(\n|$)/g);
            for (const chunk of chunks) {
              await message.channel.send(chunk).catch(() => {});
            }
          } else {
            await message.channel.send(buttonInfo).catch(() => {});
          }
        }
      }

      // Debug message metadata
      let metadataInfo = `**[DEBUG]** Message Metadata:\n`;
      metadataInfo += `**Message ID:** ${targetMessage.id}\n`;
      metadataInfo += `**Author:** ${targetMessage.author.username} (${targetMessage.author.id})\n`;
      metadataInfo += `**Channel:** ${targetMessage.channel.name || targetMessage.channel.id}\n`;
      metadataInfo += `**Timestamp:** ${targetMessage.createdAt}\n`;
      metadataInfo += `**Has Content:** ${!!targetMessage.content}\n`;
      metadataInfo += `**Has Embeds:** ${!!(targetMessage.embeds && targetMessage.embeds.length > 0)}\n`;
      metadataInfo += `**Has Components:** ${!!(targetMessage.components && targetMessage.components.length > 0)}\n`;
      
      // Check for LOADING flag
      if (targetMessage.flags) {
        metadataInfo += `**Flags:** ${targetMessage.flags.toArray().join(', ')}\n`;
        metadataInfo += `**Had LOADING Flag:** ${targetMessage.flags.has('LOADING')}\n`;
      }
      
      await message.channel.send(metadataInfo).catch(() => {});

      // If no content, embeds, or components
      if ((!targetMessage.content || !targetMessage.content.trim()) && 
          (!targetMessage.embeds || targetMessage.embeds.length === 0) &&
          (!targetMessage.components || targetMessage.components.length === 0)) {
        await message.channel.send(`**[DEBUG]** ⚠️ Bot message has no content, embeds, or components`).catch(() => {});
      }

      console.log('✅ Bot message debug completed');

    } catch (error) {
      console.error('❌ Error debugging bot message:', error);
      await message.channel.send(`**[DEBUG ERROR]** ${error.message}`).catch(() => {});
    }
  }

  async handleDebugCommand(message) {
    await message.delete().catch(() => {});
    
    // Check if this is a reply to another message
    if (message.reference && message.reference.messageId) {
      try {
        // Fetch the replied message
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        
        // Check if the replied message is from EPIC RPG bot
        if (repliedMessage.author.id === EPIC_RPG_BOT_ID) {
          console.log('🔍 Debugging replied bot message...');
          await message.channel.send('🔍 **Debugging replied bot message...**').catch(() => {});
          await this.debugBotMessage(message, repliedMessage);
          return true;
        } else {
          await message.channel.send(`❌ **Error:** You can only debug messages from EPIC RPG bot (ID: ${EPIC_RPG_BOT_ID})`).catch(() => {});
          return true;
        }
      } catch (error) {
        await message.channel.send(`❌ **Error fetching replied message:** ${error.message}`).catch(() => {});
        return true;
      }
    }
    
    // If not a reply, check if it's a slash command debug
    const content = message.content.toLowerCase().trim();
    if (content.startsWith('.debug ')) {
      const command = content.substring(7).trim();
      
      if (!command) {
        await message.channel.send('❌ **Usage:** `.debug <command>` or reply to a bot message with `.debug`').catch(() => {});
        return true;
      }

      try {
        console.log(`🔍 Debug slash command: ${command}`);
        await message.channel.send(`🔍 **Executing debug command:** \`${command}\``).catch(() => {});
        
        // Use the enhanced sendSlashAndWait method that handles "thinking" responses
        const botResponse = await Utils.sendSlashAndWait(
          message.channel, 
          EPIC_RPG_BOT_ID, 
          command, 
          [], 
          15000 // 15 seconds timeout for debug
        );

        if (botResponse) {
          console.log('✅ Debug command sent successfully');
          await message.channel.send('✅ **Bot responded! Debugging response...**').catch(() => {});
          await this.debugBotMessage(message, botResponse);
        } else {
          await message.channel.send('❌ **Failed to get bot response**').catch(() => {});
        }
      } catch (error) {
        if (error.message.includes('Timeout waiting for deferred bot response')) {
          await message.channel.send('**[DEBUG]** ⚠️ Bot took too long to respond after thinking (15s timeout)').catch(() => {});
        } else {
          await message.channel.send(`❌ **Debug command failed:** ${error.message}`).catch(() => {});
        }
      }
      return true;
    }
    
    // If it's just ".debug" without parameters and not a reply
    if (content === '.debug') {
      await message.channel.send('ℹ️ **Debug Usage:**\n• `.debug <command>` - Debug a slash command\n• Reply to a bot message with `.debug` - Debug that message').catch(() => {});
      return true;
    }
    
    return false;
  }

  async logBotDebugInfo(message) {
    if (!this.debugEnabled) return;

    try {
      // Send content if exists
      if (message.content && message.content.trim()) {
        await message.channel.send(`**[BOT EVENT]** Bot Message:\n\`\`\`\n${message.content}\n\`\`\``);
      }

      // Send embed info if exists
      if (message.embeds && message.embeds.length > 0) {
        await message.channel.send(`**[BOT EVENT]** Bot has ${message.embeds.length} embed(s)`);

        // Display each embed's content
        for (let i = 0; i < message.embeds.length; i++) {
          const embed = message.embeds[i];
          let embedInfo = `**[BOT EVENT]** Embed ${i + 1}:\n`;

          if (embed.title) embedInfo += `**Title:** ${embed.title}\n`;
          if (embed.description) embedInfo += `**Description:** ${embed.description}\n`;
          if (embed.color) embedInfo += `**Color:** ${embed.color}\n`;
          if (embed.author) embedInfo += `**Author:** ${embed.author.name || 'N/A'}\n`;
          if (embed.footer) embedInfo += `**Footer:** ${embed.footer.text || 'N/A'}\n`;
          if (embed.timestamp) embedInfo += `**Timestamp:** ${embed.timestamp}\n`;

          if (embed.fields && embed.fields.length > 0) {
            embedInfo += `**Fields:**\n`;
            embed.fields.forEach((field, index) => {
              embedInfo += `  ${index + 1}. **${field.name}:** ${field.value}\n`;
            });
          }

          // Check if message is too long and split if needed
          if (embedInfo.length > 1900) {
            const chunks = embedInfo.match(/.{1,1900}(\n|$)/g);
            for (const chunk of chunks) {
              await message.channel.send(chunk);
            }
          } else {
            await message.channel.send(embedInfo);
          }
        }
      }

      // Send button/component info if exists
      if (message.components && message.components.length > 0) {
        await message.channel.send(`**[BOT EVENT]** Bot has ${message.components.length} component row(s) with buttons`);
        
        for (let rowIndex = 0; rowIndex < message.components.length; rowIndex++) {
          const row = message.components[rowIndex];
          let buttonInfo = `**[BOT EVENT]** Button Row ${rowIndex + 1}:\n`;
          
          if (row.components && row.components.length > 0) {
            buttonInfo += `**Total Buttons:** ${row.components.length}\n`;
            
            row.components.forEach((component, btnIndex) => {
              buttonInfo += `**Button ${btnIndex + 1}:**\n`;
              buttonInfo += `  - Label: ${component.label || 'No Label'}\n`;
              buttonInfo += `  - Custom ID: ${component.customId || 'No Custom ID'}\n`;
              buttonInfo += `  - Style: ${component.style || 'Unknown'}\n`;
              buttonInfo += `  - Disabled: ${component.disabled || false}\n`;
              if (component.emoji) {
                buttonInfo += `  - Emoji: ${component.emoji.name || component.emoji.id || 'Unknown emoji'}\n`;
              }
              buttonInfo += `\n`;
            });
          }

          // Split long button info if needed
          if (buttonInfo.length > 1900) {
            const chunks = buttonInfo.match(/.{1,1900}(\n|$)/g);
            for (const chunk of chunks) {
              await message.channel.send(chunk);
            }
          } else {
            await message.channel.send(buttonInfo);
          }
        }
      }

      // Check for LOADING flag and log it
      if (message.flags && message.flags.has('LOADING')) {
        await message.channel.send(`**[BOT EVENT]** ⏳ Bot message has LOADING flag (thinking...)`);
      }

      // If no content, embeds, or components, still log it
      if ((!message.content || !message.content.trim()) && 
          (!message.embeds || message.embeds.length === 0) &&
          (!message.components || message.components.length === 0)) {
        await message.channel.send(`**[BOT EVENT]** Bot sent a message with no content/embeds/components`);
      }
    } catch (error) {
      console.error('Error sending bot event debug:', error);
    }
  }
}

module.exports = { DebugManager };
