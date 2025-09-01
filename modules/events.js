const { EVENTS, EPIC_RPG_BOT_ID } = require('../config/config');

class EventHandler {
  constructor(client) {
    this.client = client;
    this.pendingMessages = new Map(); // Track messages that are still "thinking"
  }

  async handleAutoEvent(message) {
    if (message.author.id !== EPIC_RPG_BOT_ID) return;

    // If this is a "thinking" message, store it and wait for the actual content
    if (message.flags && message.flags.has('LOADING')) {
      console.log('🤔 Bot is thinking... storing message for event detection');
      this.pendingMessages.set(message.id, message);
      
      // Set up listener for when this message gets updated
      const onUpdate = (oldMsg, newMsg) => {
        if (oldMsg.id === message.id) {
          console.log('✅ Bot finished thinking, checking for events...');
          message.client.off('messageUpdate', onUpdate);
          this.pendingMessages.delete(message.id);
          // Process the updated message for events
          this.processEventDetection(newMsg);
        }
      };
      
      message.client.on('messageUpdate', onUpdate);
      
      // Set timeout to clean up if message never gets updated (15 minutes)
      setTimeout(() => {
        if (this.pendingMessages.has(message.id)) {
          message.client.off('messageUpdate', onUpdate);
          this.pendingMessages.delete(message.id);
          console.log('⚠️ Thinking message timeout, cleaning up');
        }
      }, 15 * 60 * 1000);
      
      return; // Don't process yet, wait for the actual content
    }

    // Process immediate messages (not thinking)
    this.processEventDetection(message);
  }

  async processEventDetection(message) {
    let isAutoCatchEvent = false;

    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        if (embed.fields && embed.fields.length > 0) {
          for (const field of embed.fields) {

            // Check each event type
            for (const [eventName, eventConfig] of Object.entries(EVENTS)) {
              if (field.name && field.name.includes(eventConfig.FIELD_NAME) &&
                  field.value && field.value.includes(eventConfig.FIELD_VALUE)) {
                isAutoCatchEvent = true;
                console.log(`${this.getEventEmoji(eventName)} ${eventName} EVENT DETECTED! Auto-responding...`);

                setTimeout(async () => {
                  try {
                    // Try button click first if available
                    if (eventConfig.BUTTON_ID && message.components && message.components.length > 0) {
                      await message.clickButton(eventConfig.BUTTON_ID);
                      console.log(`✅ Auto-${eventConfig.RESPONSE} button clicked successfully`);
                    } else if (message.components && message.components.length > 0) {
                      // Try to find appropriate button
                      let buttonCustomId = await this.findEventButton(message, eventConfig.RESPONSE);
                      
                      if (buttonCustomId) {
                        await message.clickButton(buttonCustomId);
                        console.log(`✅ Auto-${eventConfig.RESPONSE} button clicked successfully`);
                      } else {
                        await message.channel.send(eventConfig.RESPONSE);
                        console.log(`✅ Auto-${eventConfig.RESPONSE} typed successfully (no button found)`);
                      }
                    } else {
                      await message.channel.send(eventConfig.RESPONSE);
                      console.log(`✅ Auto-${eventConfig.RESPONSE} typed successfully`);
                    }
                  } catch (error) {
                    console.error(`❌ ${eventConfig.RESPONSE} failed:`, error.message);
                    try {
                      await message.channel.send(eventConfig.RESPONSE);
                      console.log(`✅ Auto-${eventConfig.RESPONSE} typed successfully (fallback)`);
                    } catch (typeError) {
                      console.error(`❌ Failed to auto-${eventConfig.RESPONSE}:`, typeError);
                    }
                  }
                }, 1000);
                break;
              }
            }

            if (isAutoCatchEvent) break;
          }
          if (isAutoCatchEvent) break;
        }
      }
    }
  }

  async findEventButton(message, response) {
    for (const row of message.components) {
      for (const comp of row.components || []) {
        // Check by label first
        if (comp.label === response) {
          return comp.customId;
        }
        
        // Check by custom ID patterns
        const responsePattern = response.toLowerCase();
        if (comp.customId && (
          comp.customId.includes(responsePattern) ||
          comp.customId.includes('catch') ||
          comp.customId.includes('lure') ||
          comp.customId.includes('join') ||
          comp.customId.includes('fight') ||
          comp.customId.includes('summon') ||
          comp.customId.includes('legendaryboss')
        )) {
          return comp.customId;
        }
      }
    }
    return null;
  }

  getEventEmoji(eventName) {
    const emojis = {
      EPIC_COIN: '👾',
      COIN_RAIN: '🪙',
      EPIC_TREE: '🌳',
      MEGALODON: '🦈',
      ARENA: '⚔️',
      MINIBOSS: '👹',
      LOOTBOX_SUMMONING: '📦',
      LEGENDARY_BOSS: '🐉'
    };
    return emojis[eventName] || '🎯';
  }
}

module.exports = { EventHandler };
