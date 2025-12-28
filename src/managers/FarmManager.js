/**
 * Farm Manager
 * Handles automatic farming commands (adventure, axe, hunt, heal)
 */

const { Logger } = require('../utils/logger');
const { DiscordUtils } = require('../utils/discord');
const { EPIC_RPG_BOT_ID, FARM } = require('../config');

class FarmManager {
  constructor(client) {
    this.client = client;
    this.logger = Logger.create('Farm');
    this.enabled = false;
    this.channel = null;

    // Timers for each command
    this.timers = {
      adventure: null,
      axe: null,
      hunt: null,
    };

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

    if (hpPercentage < FARM.HEAL_HP_THRESHOLD || hpData.current < FARM.HEAL_HP_THRESHOLD) {
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
    if (this.timers[command]) {
      clearTimeout(this.timers[command]);
      this.timers[command] = null;
    }

    // Schedule next execution after cooldown
    this.timers[command] = setTimeout(async () => {
      this.states[command].onCooldown = false;
      if (this.states[command].enabled && this.enabled) {
        await this.executeCommand(command);
        if (this.states[command].enabled && this.enabled) {
          this.scheduleNext(command);
        }
      }
    }, cooldownMs + 2000);
  }

  /**
   * Handle EPIC Guard detection
   */
  async handleEpicGuard() {
    this.logger.error('EPIC GUARD DETECTED! Auto-stopping farm for safety');
    if (this.channel) {
      await this.channel.send('⚠️ **EPIC GUARD DETECTED!** Farm stopped automatically for safety.').catch(() => {});
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

    if (this.timers[command]) {
      clearTimeout(this.timers[command]);
    }

    this.timers[command] = setTimeout(async () => {
      if (this.states[command].enabled && this.enabled) {
        await this.executeCommand(command);
        if (this.states[command].enabled && this.enabled) {
          this.scheduleNext(command);
        }
      }
    }, cooldown);
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
    });
  }

  /**
   * Stop a specific command timer
   */
  stopCommandTimer(command) {
    if (command === 'heal') return;

    this.states[command].enabled = false;
    this.states[command].onCooldown = false;

    if (this.timers[command]) {
      clearTimeout(this.timers[command]);
      this.timers[command] = null;
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

    await channel.send('🌾 **Auto Farm Started**\nRunning: adventure, axe, hunt with auto-heal').catch(() => {});

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
      this.channel.send('🛑 **Auto Farm Stopped**').catch(() => {});
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
    Object.values(this.timers).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * Set current channel
   */
  setChannel(channel) {
    this.channel = channel;
  }
}

module.exports = { FarmManager };
