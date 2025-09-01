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
      adventure: { enabled: false, executing: false, onCooldown: false },
      axe: { enabled: false, executing: false, onCooldown: false },
      hunt: { enabled: false, executing: false, onCooldown: false },
      heal: { executing: false } // heal doesn't have cooldown or timer
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
      // Use the enhanced sendSlashAndWait method that handles "thinking" responses
      const botResponse = await Utils.sendSlashAndWait(
        this.currentChannel, 
        EPIC_RPG_BOT_ID, 
        'heal', 
        [], 
        FARM.RESPONSE_TIMEOUT
      );
      
      if (botResponse) {
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
      }
    } catch (error) {
      if (error.message.includes('Timeout waiting for deferred bot response')) {
        console.log('⚠️ Heal: Bot took too long to respond after thinking');
      } else {
        console.error('❌ Heal execution failed:', error);
      }
    } finally {
      // Always reset executing state immediately, no cooldown
      this.farmStates.heal.executing = false;
    }
  }

  async executeCommand(command) {
    // Special handling for heal - only check if executing
    if (command === 'heal') {
      return await this.triggerHeal();
    }
    
    // Prevent execution if already executing, farm disabled, no channel, or on cooldown
    if (this.farmStates[command].executing || 
        !this.farmEnabled || 
        !this.currentChannel ||
        this.farmStates[command].onCooldown) {
      return;
    }
    
    this.farmStates[command].executing = true;
    console.log(`${this.getCommandEmoji(command)} Executing ${command}...`);
    
    try {
      // Use the enhanced sendSlashAndWait method that handles "thinking" responses
      const botResponse = await Utils.sendSlashAndWait(
        this.currentChannel, 
        EPIC_RPG_BOT_ID, 
        command, 
        [], 
        FARM.RESPONSE_TIMEOUT
      );
      
      if (botResponse) {
        // Check for EPIC GUARD first
        if (Utils.checkForEpicGuard(botResponse)) {
          console.log('🚨 EPIC GUARD DETECTED! Auto-stopping farm...');
          if (this.currentChannel) {
            this.currentChannel.send('🚨 **EPIC GUARD DETECTED!** 👮‍♂️ Auto-stopping farm for safety').catch(() => {});
          }
          this.stop();
          return;
        }
        
        // Check for dynamic cooldown
        const cooldownMs = Utils.checkForCooldown(botResponse);
        if (cooldownMs > 0) {
          console.log(`⏰ ${command} cooldown detected: ${Math.ceil(cooldownMs/1000)}s`);
          
          // Set cooldown flag to prevent spam
          this.farmStates[command].onCooldown = true;
          
          // Clear existing timer and set new one with dynamic cooldown
          if (this.farmTimers[command]) {
            clearTimeout(this.farmTimers[command]);
            this.farmTimers[command] = null;
          }
          
          this.farmTimers[command] = setTimeout(async () => {
            this.farmStates[command].onCooldown = false;
            if (this.farmStates[command].enabled && this.farmEnabled) {
              await this.executeCommand(command);
              // Only restart normal timer if we're still enabled
              if (this.farmStates[command].enabled && this.farmEnabled) {
                this.scheduleNextExecution(command);
              }
            }
          }, cooldownMs + 2000);
          
          return; // Exit here - timer will handle next execution
        }
        
        // Check HP and trigger heal if needed (only for commands that can cause HP loss)
        if (command === 'adventure' || command === 'hunt') {
          await this.checkAndHeal(botResponse);
        }
        
        console.log(`✅ ${command} completed successfully`);
      }
    } catch (error) {
      if (error.message.includes('Timeout waiting for deferred bot response')) {
        console.log(`⚠️ ${command}: Bot took too long to respond after thinking`);
      } else {
        console.error(`❌ ${command} execution failed:`, error);
      }
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

  scheduleNextExecution(command) {
    // Skip heal as it doesn't have scheduled timer
    if (command === 'heal') return;
    
    if (!this.farmStates[command].enabled || 
        !this.farmEnabled || 
        this.farmStates[command].onCooldown) return;
    
    const cooldown = FARM_COOLDOWNS[command];
    if (!cooldown) return;
    
    // Clear existing timer first
    if (this.farmTimers[command]) {
      clearTimeout(this.farmTimers[command]);
    }
    
    this.farmTimers[command] = setTimeout(async () => {
      if (this.farmStates[command].enabled && this.farmEnabled) {
        await this.executeCommand(command);
        // Schedule next execution if still enabled
        if (this.farmStates[command].enabled && this.farmEnabled) {
          this.scheduleNextExecution(command);
        }
      }
    }, cooldown);
  }

  startCommandTimer(command) {
    // Skip heal as it doesn't have scheduled timer
    if (command === 'heal') return;
    
    if (this.farmStates[command].enabled || !FARM_COOLDOWNS[command]) return;
    
    this.farmStates[command].enabled = true;
    this.farmStates[command].onCooldown = false;
    console.log(`${this.getCommandEmoji(command)} ${command} timer started`);
    
    // Execute immediately
    this.executeCommand(command).then(() => {
      // Schedule next execution only after first one completes
      if (this.farmStates[command].enabled && this.farmEnabled) {
        this.scheduleNextExecution(command);
      }
    });
  }

  stopCommandTimer(command) {
    // Skip heal as it doesn't have scheduled timer
    if (command === 'heal') return;
    
    this.farmStates[command].enabled = false;
    this.farmStates[command].onCooldown = false;
    
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
    
    const getCommandStatus = (command) => {
      if (command === 'heal') {
        return this.farmStates[command].executing ? 'Healing...' : 'Ready (HP-based trigger)';
      }
      
      if (!this.farmStates[command].enabled) return 'Stopped';
      if (this.farmStates[command].executing) return 'Executing...';
      if (this.farmStates[command].onCooldown) return 'On Cooldown';
      return 'Active';
    };
    
    status += `🗺️ Adventure: ${getCommandStatus('adventure')}\n`;
    status += `🪓 Axe: ${getCommandStatus('axe')}\n`;
    status += `🏹 Hunt: ${getCommandStatus('hunt')}\n`;
    status += `🩹 Heal: ${getCommandStatus('heal')}\n`;
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
