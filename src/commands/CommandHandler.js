/**
 * Command Handler
 * Handles user command parsing and execution
 */

const { Logger } = require('../utils/logger');
const { PREFIX, EPIC_RPG_BOT_ID } = require('../config');

class CommandHandler {
  constructor(client, managers) {
    this.client = client;
    this.logger = Logger.create('Command');
    
    this.farmManager = managers.farmManager;
    this.eventHandler = managers.eventHandler;
    this.debugManager = managers.debugManager;
    this.autoEnchantManager = managers.autoEnchantManager;
  }

  /**
   * Handle incoming message
   */
  async handle(message) {
    // Handle EPIC RPG bot messages
    if (message.author.id === EPIC_RPG_BOT_ID) {
      await this.eventHandler.handleMessage(message);
      await this.debugManager.logBotDebugInfo(message);
      return;
    }

    // Only process self messages
    if (message.author.id !== this.client.user.id) return;

    const content = message.content.trim();
    
    // Check for command prefix
    if (!content.startsWith(PREFIX)) return;

    const lowerContent = content.toLowerCase();

    // Parse and execute commands
    try {
      await this.parseCommand(message, lowerContent, content);
    } catch (error) {
      this.logger.error(`Command error: ${error.message}`);
    }
  }

  /**
   * Parse and execute command
   */
  async parseCommand(message, lowerContent, originalContent) {
    // Debug commands (special case - can be reply or command)
    if (lowerContent === '.debug' || lowerContent.startsWith('.debug ')) {
      return await this.debugManager.handleDebugCommand(message);
    }

    // Farm commands
    if (lowerContent === '.on farm') {
      await message.delete().catch(() => {});
      return await this.farmManager.start(message.channel);
    }
    
    if (lowerContent === '.off farm') {
      await message.delete().catch(() => {});
      this.farmManager.setChannel(message.channel);
      return this.farmManager.stop();
    }
    
    if (lowerContent === '.farm status') {
      await message.delete().catch(() => {});
      const status = this.farmManager.getStatus();
      return message.channel.send(status).catch(() => {});
    }

    // Event commands
    if (lowerContent === '.on event') {
      await message.delete().catch(() => {});
      this.eventHandler.setChannel(message.channel);
      this.eventHandler.setEnabled(true);
      return message.channel.send('🎯 **Auto Event Enabled**').catch(() => {});
    }
    
    if (lowerContent === '.off event') {
      await message.delete().catch(() => {});
      this.eventHandler.setChannel(message.channel);
      this.eventHandler.setEnabled(false);
      return message.channel.send('🛑 **Auto Event Disabled**').catch(() => {});
    }

    // Debug mode commands
    if (lowerContent === '.on debug') {
      await message.delete().catch(() => {});
      this.debugManager.setChannel(message.channel);
      this.debugManager.setEnabled(true);
      return message.channel.send('🔍 **Debug Mode Enabled** - Bot messages will be logged').catch(() => {});
    }
    
    if (lowerContent === '.off debug') {
      await message.delete().catch(() => {});
      this.debugManager.setChannel(message.channel);
      this.debugManager.setEnabled(false);
      return message.channel.send('🔍 **Debug Mode Disabled**').catch(() => {});
    }

    // Auto Enchant commands
    // Pattern: .on enchant/refine/transmute/transcend sword/armor [target]
    const enchantMatch = lowerContent.match(/^\.on\s+(enchant|refine|transmute|transcend)\s+(sword|armor)\s+(\S+)$/);
    if (enchantMatch) {
      await message.delete().catch(() => {});
      const [, type, equipment, target] = enchantMatch;
      return await this.autoEnchantManager.start(message.channel, type, equipment, target);
    }

    // Stop enchant
    if (lowerContent === '.off enchant' || lowerContent === '.off refine' || 
        lowerContent === '.off transmute' || lowerContent === '.off transcend') {
      await message.delete().catch(() => {});
      return await this.autoEnchantManager.stop(message.channel);
    }

    // Enchant status
    if (lowerContent === '.enchant status' || lowerContent === '.refine status' ||
        lowerContent === '.transmute status' || lowerContent === '.transcend status') {
      await message.delete().catch(() => {});
      const status = this.autoEnchantManager.getStatus(message.channel);
      return message.channel.send(status).catch(() => {});
    }

    // Help command
    if (lowerContent === '.help') {
      await message.delete().catch(() => {});
      return this.showHelp(message.channel);
    }
  }

  /**
   * Show help message
   */
  async showHelp(channel) {
    const help = [
      '📖 **Self Bot Commands**',
      '',
      '**🌾 Farm:**',
      '• `.on farm` - Start auto farm',
      '• `.off farm` - Stop auto farm',
      '• `.farm status` - Check farm status',
      '',
      '**🎯 Events:**',
      '• `.on event` - Enable auto event catch',
      '• `.off event` - Disable auto event catch',
      '',
      '**🔍 Debug:**',
      '• `.on debug` - Enable debug logging',
      '• `.off debug` - Disable debug logging',
      '• `.debug <command>` - Debug slash command',
      '• Reply with `.debug` - Debug replied message',
      '',
      '**✨ Auto Enchant:**',
      '• `.on enchant/refine/transmute/transcend sword/armor <target>`',
      '  Example: `.on enchant sword epic`',
      '• `.off enchant` - Stop auto enchant',
      '• `.enchant status` - Check enchant status',
      '',
      '**Available Enchant Tiers:**',
      'normie, good, great, mega, epic, hyper, ultimate,',
      'perfect, edgy, ultra-edgy, omega, ultra-omega, godly, void, eternal',
    ].join('\n');

    await channel.send(help).catch(() => {});
  }
}

module.exports = { CommandHandler };
