const { FARM_COOLDOWNS, FARM, EPIC_RPG_BOT_ID } = require('../config/config');
const { Utils } = require('../utils/utils');

class FarmManager {
  constructor(client) {
    this.client = client;
    this.farmEnabled = false;
    this.currentChannel = null;
    
    // Individual timer system for each command
    this.farmTimers = {
      adventure: null,
      axe: null,
      hunt: null,
      heal: null
    };

    this.farmStates = {
      adventure: { enabled: false, executing: false },
      axe: { enabled: false, executing: false },
      hunt: { enabled: false, executing: false },
      heal: { enabled: false, executing: false }
    };
  }

  async checkAndHeal(botResponse) {
    if (!botResponse.content) return;
    
    const hpData = Utils.parseHP(botResponse.content);
    if (hpData) {
      const hpPercentage = (hpData.current / hpData.max) * 100;
      
      // More aggressive healing - heal at configured threshold
      if (hpPercentage < FARM.HEAL_HP_THRESHOLD || hpData.current < FARM.HEAL_HP_THRESHOLD) {
        console.log(`🩹 HP is low (${hpData.current}/${hpData.max} - ${Math.round(hpPercentage)}%), triggering heal...`);
        await this.triggerHeal();
        
        // Wait a bit after heal to ensure it processes
        await Utils.sleep(FARM.HEAL_DELAY);
      } else {
        console.log(`💚 HP is healthy (${hpData.current}/${hpData.max} - ${Math.round(hpPercentage)}%)`);
      }
    }
  }

  async triggerHeal() {
    if (this.farmStates.heal.executing) {
      console.log('🩹 Heal already in progress, skipping...');
      return;
    }
    
    this.farmStates.heal.executing = true;
    console.log('🩹 Executing emergency heal...');
    
    try {
      const slashResponse = await this.currentChannel.sendSlash(EPIC_RPG_BOT_ID, 'heal');
      
      if (slashResponse) {
        try {
          const botResponse = await Utils.waitForBotResponse(slashResponse, EPIC_RPG_BOT_ID, FARM.RESPONSE_TIMEOUT);
          
          // Check for EPIC GUARD first
          if (Utils.checkForEpicGuard(botResponse)) {
            console.log('🚨 EPIC GUARD DETECTED! Auto-stopping farm...');
            if (this.currentChannel) {
              this.currentChannel.send('🚨 **EPIC GUARD DETECTED!** 👮‍♂️ Auto-stopping farm for safety').catch(() => {});
            }
            this.stop();
            this.farmStates.heal.executing = false;
            return;
          }
          
          console.log('✅ Heal completed successfully');
          
          // Check if heal was successful by parsing response
          if (botResponse.content) {
            const healMatch = botResponse.content.match(/healed.*?(\d+).*?hp/i);
            if (healMatch) {
              console.log(`🩹 Healed ${healMatch[1]} HP successfully`);
            }
          }
          
        } catch (responseError) {
          console.log('⚠️ Heal: No response received');
        }
      }
    } catch (error) {
      console.error('❌ Heal execution failed:', error);
    } finally {
      // Always reset executing state immediately, no cooldown
      this.farmStates.heal.executing = false;
    }
  }

  async executeCommand(command) {
    if (this.farmStates[command].executing || !this.farmEnabled || !this.currentChannel) return;
    
    this.farmStates[command].executing = true;
    console.log(`${this.getCommandEmoji(command)} Executing ${command}...`);
    
    try {
      const slashResponse = await this.currentChannel.sendSlash(EPIC_RPG_BOT_ID, command);
      
      if (slashResponse) {
        try {
          const botResponse = await Utils.waitForBotResponse(slashResponse, EPIC_RPG_BOT_ID, FARM.RESPONSE_TIMEOUT);
          
          // Check for EPIC GUARD first
          if (Utils.checkForEpicGuard(botResponse)) {
            console.log('🚨 EPIC GUARD DETECTED! Auto-stopping farm...');
            if (this.currentChannel) {
              this.currentChannel.send('🚨 **EPIC GUARD DETECTED!** 👮‍♂️ Auto-stopping farm for safety').catch(() => {});
            }
            this.stop();
            this.farmStates[command].executing = false;
            return;
          }
          
          // Check for dynamic cooldown
          const cooldownMs = Utils.checkForCooldown(botResponse);
          if (cooldownMs > 0) {
            console.log(`⏰ ${command} cooldown detected: ${Math.ceil(cooldownMs/1000)}s`);
            // Reschedule with actual cooldown
            this.farmStates[command].enabled = false;
            if (this.farmTimers[command]) clearTimeout(this.farmTimers[command]);
            this.farmTimers[command] = setTimeout(async () => {
              await this.executeCommand(command);
              this.startCommandTimer(command); // Return to normal schedule
            }, cooldownMs + 2000);
            this.farmStates[command].executing = false;
            return;
          }
          
          // Check HP and trigger heal if needed (only for commands that can cause HP loss)
          if (command === 'adventure' || command === 'hunt') {
            await this.checkAndHeal(botResponse);
          }
          
          console.log(`✅ ${command} completed successfully`);
          
        } catch (responseError) {
          console.log(`⚠️ ${command}: No response received`);
        }
      }
    } catch (error) {
      console.error(`❌ ${command} execution failed:`, error);
    } finally {
      this.farmStates[command].executing = false;
    }
  }

  getCommandEmoji(command) {
    const emojis = {
      adventure: '🗺️',
      axe: '🪓',
      hunt: '🏹',
      heal: '🩹'
    };
    return emojis[command] || '⚡';
  }

  startCommandTimer(command) {
    if (this.farmStates[command].enabled || !FARM_COOLDOWNS[command]) return;
    
    this.farmStates[command].enabled = true;
    console.log(`${this.getCommandEmoji(command)} ${command} timer started`);
    
    // Execute immediately then start timer
    this.executeCommand(command);
    
    const scheduleNext = () => {
      if (!this.farmStates[command].enabled || !this.farmEnabled) return;
      
      this.farmTimers[command] = setTimeout(async () => {
        await this.executeCommand(command);
        scheduleNext();
      }, FARM_COOLDOWNS[command]);
    };
    
    scheduleNext();
  }

  stopCommandTimer(command) {
    this.farmStates[command].enabled = false;
    if (this.farmTimers[command]) {
      clearTimeout(this.farmTimers[command]);
      this.farmTimers[command] = null;
    }
    console.log(`🛑 ${command} timer stopped`);
  }

  async start(channel) {
    if (this.farmEnabled) return;

    this.farmEnabled = true;
    this.currentChannel = channel;
    console.log('🚜 Independent Auto Farm Started');
    if (this.currentChannel) {
      this.currentChannel.send('🚜 **Independent Auto Farm Started** - Each command runs on its own timer').catch(() => {});
    }

    // Initial heal before starting all timers
    await this.triggerHeal();
    
    // Wait configured delay after heal then start all timers
    setTimeout(() => {
      this.startCommandTimer('adventure');
      this.startCommandTimer('axe');
      this.startCommandTimer('hunt');
      console.log('✅ All farm timers are now running independently');
      console.log(`🩹 Heal system: HP-based triggering (${FARM.HEAL_HP_THRESHOLD}% threshold)`);
      console.log('🚨 EPIC GUARD detection: Auto-stop enabled');
    }, FARM.FARM_START_DELAY);
  }

  stop() {
    if (!this.farmEnabled) return;

    this.farmEnabled = false;
    
    // Stop all individual timers
    this.stopCommandTimer('adventure');
    this.stopCommandTimer('axe');
    this.stopCommandTimer('hunt');
    
    // Reset heal state
    this.farmStates.heal.executing = false;

    console.log('🛑 Independent Auto Farm Stopped');
    if (this.currentChannel) {
      this.currentChannel.send('🛑 **Independent Auto Farm Stopped** - All timers cleared').catch(() => {});
    }
  }

  getStatus() {
    if (!this.farmEnabled) return '🛑 Farm is stopped';
    
    let status = '🚜 **Independent Farm Status:**\n';
    status += `🗺️ Adventure: ${this.farmStates.adventure.enabled ? (this.farmStates.adventure.executing ? 'Executing...' : 'Active') : 'Stopped'}\n`;
    status += `🪓 Axe: ${this.farmStates.axe.enabled ? (this.farmStates.axe.executing ? 'Executing...' : 'Active') : 'Stopped'}\n`;
    status += `🏹 Hunt: ${this.farmStates.hunt.enabled ? (this.farmStates.hunt.executing ? 'Executing...' : 'Active') : 'Stopped'}\n`;
    status += `🩹 Heal: ${this.farmStates.heal.executing ? 'Healing...' : 'Ready (HP-based trigger)'}\n`;
    status += `🚨 EPIC GUARD: Auto-stop protection enabled`;
    
    return status;
  }

  cleanup() {
    Object.values(this.farmTimers).forEach(timer => {
      if (timer) {
        clearTimeout(timer);
      }
    });
  }

  setCurrentChannel(channel) {
    this.currentChannel = channel;
  }
}

module.exports = { FarmManager };