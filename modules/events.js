const { EVENTS, EPIC_RPG_BOT_ID } = require('../config/config');

class EventHandler {
  constructor(client) {
    this.client = client;
  }

  async handleAutoEvent(message) {
    if (message.author.id !== EPIC_RPG_BOT_ID) return;

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
          comp.customId.includes('fight')
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
      MINIBOSS: '👹'
    };
    return emojis[eventName] || '🎯';
  }
}

module.exports = { EventHandler };
