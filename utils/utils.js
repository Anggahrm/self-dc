const { EPIC_RPG_BOT_ID } = require('../config/config');

class Utils {
  static getRandomFile(fileNames) {
    return fileNames[Math.floor(Math.random() * fileNames.length)];
  }

  static getRandomInterval() {
    return (Math.floor(Math.random() * 60) + 1) * 60 * 1000;
  }

  static async waitForBotResponse(originalMessage, botId = EPIC_RPG_BOT_ID, timeout = 30000) {
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
          if (message.flags && message.flags.has('LOADING')) {
            console.log('Bot is thinking... waiting for actual response');
            return;
          }
          
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
          if (oldMsg.flags && oldMsg.flags.has('LOADING') && (!newMsg.flags || !newMsg.flags.has('LOADING'))) {
            console.log('Bot finished thinking, got actual response');
            if (!done) {
              done = true;
              clearTimeout(timeoutId);
              originalMessage.client.off('messageCreate', onMessage);
              originalMessage.client.off('messageUpdate', onUpdate);
              resolve(newMsg);
            }
            return;
          }
          
          if (!done) {
            done = true;
            clearTimeout(timeoutId);
            originalMessage.client.off('messageCreate', onMessage);
            originalMessage.client.off('messageUpdate', onUpdate);
            resolve(newMsg);
          }
        }
      }

      originalMessage.client.on('messageCreate', onMessage);
      originalMessage.client.on('messageUpdate', onUpdate);
    });
  }

  static async sendSlashAndWait(channel, botId, command, options = [], timeout = 15 * 60 * 1000) {
    try {
      const slashResponse = options.length > 0 
        ? await channel.sendSlash(botId, command, ...options)
        : await channel.sendSlash(botId, command);
      
      if (!slashResponse) {
        throw new Error('Failed to send slash command');
      }

      if (slashResponse.flags && slashResponse.flags.has('LOADING')) {
        console.log('Bot is thinking... waiting for actual response (up to 15 minutes)');
        
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
            if (oldMsg.id === slashResponse.id) {
              if (!done) {
                done = true;
                clearTimeout(timeoutId);
                channel.client.off('messageUpdate', onUpdate);
                console.log('Bot finished thinking, got actual response');
                resolve(newMsg);
              }
            }
          }

          channel.client.on('messageUpdate', onUpdate);
        });
      } else {
        console.log('Got immediate bot response');
        return slashResponse;
      }
    } catch (error) {
      console.error('Error in sendSlashAndWait:', error);
      throw error;
    }
  }

  static parseHP(content) {
    const hpMatch = content.match(/remaining HP is (\d+)\/(\d+)/i);
    if (hpMatch) {
      return {
        current: parseInt(hpMatch[1]),
        max: parseInt(hpMatch[2])
      };
    }
    return null;
  }

  static parseCooldown(title) {
    let cooldownMatch = title.match(/wait at least \*{0,2}(\d+)h (\d+)m (\d+)s\*{0,2}/i);
    if (cooldownMatch) {
      const hours = parseInt(cooldownMatch[1]);
      const minutes = parseInt(cooldownMatch[2]);
      const seconds = parseInt(cooldownMatch[3]);
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      return totalMs;
    }

    cooldownMatch = title.match(/wait at least \*{0,2}(\d+)m (\d+)s\*{0,2}/i);
    if (cooldownMatch) {
      const minutes = parseInt(cooldownMatch[1]);
      const seconds = parseInt(cooldownMatch[2]);
      const totalMs = (minutes * 60 + seconds) * 1000;
      return totalMs;
    }

    cooldownMatch = title.match(/wait at least \*{0,2}(\d+)s\*{0,2}/i);
    if (cooldownMatch) {
      const seconds = parseInt(cooldownMatch[1]);
      const totalMs = seconds * 1000;
      return totalMs;
    }

    cooldownMatch = title.match(/wait.*?(\d+)h.*?(\d+)m.*?(\d+)s/i);
    if (cooldownMatch) {
      const hours = parseInt(cooldownMatch[1]);
      const minutes = parseInt(cooldownMatch[2]);
      const seconds = parseInt(cooldownMatch[3]);
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
      return totalMs;
    }

    return null;
  }

  static checkForCooldown(botResponse) {
    if (botResponse.embeds && botResponse.embeds.length > 0) {
      for (const embed of botResponse.embeds) {
        if (embed.title && embed.title.includes('wait at least')) {
          const cooldownMs = this.parseCooldown(embed.title);
          if (cooldownMs && cooldownMs > 0) {
            return cooldownMs;
          }
        }
      }
    }
    return 0;
  }

  static checkForEpicGuard(botResponse) {
    if (botResponse.content && 
        (botResponse.content.includes('EPIC GUARD: stop there') || 
         botResponse.content.includes('We have to check you are actually playing'))) {
      return true;
    }
    
    if (botResponse.embeds && botResponse.embeds.length > 0) {
      for (const embed of botResponse.embeds) {
        if (embed.title && 
            (embed.title.includes('EPIC GUARD') || 
             embed.title.includes('stop there') ||
             embed.title.includes('We have to check you are actually playing'))) {
          return true;
        }
        
        if (embed.description && 
            (embed.description.includes('EPIC GUARD') || 
             embed.description.includes('stop there') ||
             embed.description.includes('We have to check you are actually playing'))) {
          return true;
        }
        
        if (embed.fields && embed.fields.length > 0) {
          for (const field of embed.fields) {
            if ((field.name && 
                 (field.name.includes('EPIC GUARD') || 
                  field.name.includes('stop there') ||
                  field.name.includes('We have to check you are actually playing'))) ||
                (field.value && 
                 (field.value.includes('EPIC GUARD') || 
                  field.value.includes('stop there') ||
                  field.value.includes('We have to check you are actually playing')))) {
              return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { Utils };
