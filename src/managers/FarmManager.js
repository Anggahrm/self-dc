/**
 * Farm Manager
 * Handles automatic farming commands (adventure, axe, hunt, heal)
 */

const { BaseManager } = require('./BaseManager');
const { DiscordUtils } = require('../utils/discord');
const { EPIC_RPG_BOT_ID, FARM } = require('../config');

class FarmManager extends BaseManager {
  constructor(client) {
    super(client, 'Farm');
    this.channel = null;

    // State tracking for each command
    this.states = {
      adventure: { enabled: false, executing: false, onCooldown: false },
      axe: { enabled: false, executing: false, onCooldown: false },
      hunt: { enabled: false, executing: false, onCooldown: false },
      heal: { executing: false },
    };
  }

  /**
   * Check HP and heal if necessary
   */
  async checkAndHeal(botResponse) {
    if (!botResponse.content) return;

    const hpData = DiscordUtils.parseHP(botResponse.content);
    if (!hpData) return;

    const hpPercentage = (hpData.current / hpData.max) * 100;

    // Heal if HP percentage is low OR absolute HP is low
    if (hpPercentage < FARM.HEAL_HP_PERCENT || hpData.current < FARM.HEAL_HP_MIN) {
      this.logger.warn(`HP low (${hpData.current}/${hpData.max} - ${Math.round(hpPercentage)}%), healing...`);
      await this.triggerHeal();
      await DiscordUtils.sleep(FARM.HEAL_DELAY);
    } else {
      this.logger.debug(`HP healthy (${hpData.current}/${hpData.max} - ${Math.round(hpPercentage)}%)`);
    }
  }

  /**
   * Execute heal command
   */
  async triggerHeal() {
    if (this.states.heal.executing) {
      this.logger.debug('Heal already in progress, skipping');
      return;
    }

    this.states.heal.executing = true;
    this.logger.command('heal', 'Emergency heal triggered');

    try {
      const response = await DiscordUtils.sendSlashAndWait(
        this.channel,
        EPIC_RPG_BOT_ID,
        'heal',
        [],
        FARM.RESPONSE_TIMEOUT
      );

      if (response) {
        if (DiscordUtils.checkForEpicGuard(response)) {
          await this.handleEpicGuard();
          return;
        }

        const healMatch = response.content?.match(/healed.*?(\d+).*?hp/i);
        if (healMatch) {
          this.logger.success(`Healed ${healMatch[1]} HP`);
        } else {
          this.logger.success('Heal completed');
        }
      }
    } catch (error) {
      this.handleError('heal', error);
    } finally {
      this.states.heal.executing = false;
    }
  }

  /**
   * Execute a farm command
   */
  async executeCommand(command) {
    if (command === 'heal') {
      return await this.triggerHeal();
    }

    // Check if command can be executed
    if (this.states[command].executing || !this.enabled || !this.channel || this.states[command].onCooldown) {
      return;
    }

    this.states[command].executing = true;
    this.logger.command(command, 'Executing');

    try {
      const response = await DiscordUtils.sendSlashAndWait(
        this.channel,
        EPIC_RPG_BOT_ID,
        command,
        [],
        FARM.RESPONSE_TIMEOUT
      );

      if (response) {
        // Check for EPIC Guard
        if (DiscordUtils.checkForEpicGuard(response)) {
          await this.handleEpicGuard();
          return;
        }

        // Check for cooldown
        const cooldownMs = DiscordUtils.checkForCooldown(response);
        if (cooldownMs > 0) {
          this.logger.warn(`${command} on cooldown: ${Math.ceil(cooldownMs / 1000)}s`);
          await this.handleCooldown(command, cooldownMs);
          return;
        }

        // Check HP after combat commands
        if (command === 'adventure' || command === 'hunt') {
          await this.checkAndHeal(response);
        }

        this.logger.success(`${command} completed`);
      }
    } catch (error) {
      this.handleError(command, error);
    } finally {
      this.states[command].executing = false;
    }
  }

  /**
   * Handle cooldown for a command
   */
  async handleCooldown(command, cooldownMs) {
    this.states[command].onCooldown = true;

    // Clear existing timer
    this.clearCommandTimer(command);

    // Schedule next execution after cooldown using managed timer
    const timerName = `cooldown_${command}`;
    const timer = setTimeout(async () => {
      this.timers.delete(timerName);
      this.states[command].onCooldown = false;
      if (this.states[command].enabled && this.enabled) {
        try {
          await this.executeCommand(command);
          if (this.states[command].enabled && this.enabled) {
            this.scheduleNext(command);
          }
        } catch (error) {
          this.logger.error(`Cooldown execution error for ${command}: ${error.message}`);
        }
      }
    }, cooldownMs + 2000);

    this.timers.set(timerName, timer);
  }

  /**
   * Clear a command timer
   */
  clearCommandTimer(command) {
    const timerName = `cooldown_${command}`;
    const timer = this.timers.get(timerName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timerName);
    }
  }

  /**
   * Handle EPIC Guard detection
   */
  async handleEpicGuard() {
    this.logger.error('EPIC GUARD DETECTED! Auto-stopping farm for safety');
    if (this.channel) {
      await DiscordUtils.safeSend(this.channel, '⚠️ **EPIC GUARD DETECTED!** Farm stopped automatically for safety.');
    }
    this.stop();
  }

  /**
   * Handle command error
   */
  handleError(command, error) {
    if (error.message.includes('Timeout waiting for deferred bot response')) {
      this.logger.warn(`${command}: Bot response timeout`);
    } else {
      this.logger.error(`${command} failed: ${error.message}`);
    }
  }

  /**
   * Schedule next command execution
   */
  scheduleNext(command) {
    if (command === 'heal') return;
    if (!this.states[command].enabled || !this.enabled || this.states[command].onCooldown) return;

    const cooldown = FARM.COOLDOWNS[command];
    if (!cooldown) return;

    const timerName = `schedule_${command}`;
    const existingTimer = this.timers.get(timerName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.timers.delete(timerName);
      if (this.states[command].enabled && this.enabled) {
        try {
          await this.executeCommand(command);
          if (this.states[command].enabled && this.enabled) {
            this.scheduleNext(command);
          }
        } catch (error) {
          this.logger.error(`Schedule execution error for ${command}: ${error.message}`);
        }
      }
    }, cooldown);

    this.timers.set(timerName, timer);
  }

  /**
   * Start a specific command timer
   */
  startCommandTimer(command) {
    if (command === 'heal') return;
    if (this.states[command].enabled || !FARM.COOLDOWNS[command]) return;

    this.states[command].enabled = true;
    this.states[command].onCooldown = false;
    this.logger.info(`${command} timer started`);

    this.executeCommand(command).then(() => {
      if (this.states[command].enabled && this.enabled) {
        this.scheduleNext(command);
      }
    }).catch(error => {
      this.logger.error(`Start command error for ${command}: ${error.message}`);
    });
  }

  /**
   * Stop a specific command timer
   */
  stopCommandTimer(command) {
    if (command === 'heal') return;

    this.states[command].enabled = false;
    this.states[command].onCooldown = false;

    this.clearCommandTimer(command);

    const scheduleTimer = this.timers.get(`schedule_${command}`);
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      this.timers.delete(`schedule_${command}`);
    }

    this.logger.info(`${command} timer stopped`);
  }

  /**
   * Start auto farm
   */
  async start(channel) {
    if (this.enabled) {
      this.logger.warn('Farm already running');
      return;
    }

    this.enabled = true;
    this.channel = channel;
    this.logger.success('Auto Farm Started');

    await DiscordUtils.safeSend(channel, '🌾 **Auto Farm Started**\nRunning: adventure, axe, hunt with auto-heal');

    // Initial heal
    await this.triggerHeal();

    // Start all command timers after delay
    setTimeout(() => {
      this.startCommandTimer('adventure');
      this.startCommandTimer('axe');
      this.startCommandTimer('hunt');
      this.logger.info('All farm timers running');
    }, FARM.START_DELAY);
  }

  /**
   * Stop auto farm
   */
  stop() {
    if (!this.enabled) {
      this.logger.warn('Farm not running');
      return;
    }

    this.enabled = false;
    this.stopCommandTimer('adventure');
    this.stopCommandTimer('axe');
    this.stopCommandTimer('hunt');
    this.states.heal.executing = false;

    this.logger.success('Auto Farm Stopped');

    if (this.channel) {
      DiscordUtils.safeSend(this.channel, '🛑 **Auto Farm Stopped**');
    }
  }

  /**
   * Get farm status
   */
  getStatus() {
    if (!this.enabled) {
      return '🛑 **Farm Status:** Stopped';
    }

    const getCommandStatus = (cmd) => {
      if (cmd === 'heal') {
        return this.states.heal.executing ? '🔄 Healing...' : '✅ Ready';
      }
      if (!this.states[cmd].enabled) return '⏹️ Stopped';
      if (this.states[cmd].executing) return '🔄 Executing...';
      if (this.states[cmd].onCooldown) return '⏳ Cooldown';
      return '✅ Active';
    };

    return [
      '🌾 **Farm Status:** Running',
      '',
      `⚔️ Adventure: ${getCommandStatus('adventure')}`,
      `🪓 Axe: ${getCommandStatus('axe')}`,
      `🏹 Hunt: ${getCommandStatus('hunt')}`,
      `❤️ Heal: ${getCommandStatus('heal')}`,
      '',
      '🛡️ EPIC Guard: Auto-stop enabled',
    ].join('\n');
  }

  /**
   * Cleanup timers
   */
  cleanup() {
    for (const [name, timer] of this.timers) {
      clearTimeout(timer);
      this.logger.debug(`Cleaned up timer: ${name}`);
    }
    this.timers.clear();
    
    // Call parent cleanup
    super.cleanup();
  }

  /**
   * Set current channel
   */
  setChannel(channel) {
    this.channel = channel;
  }
}

module.exports = { FarmManager };
