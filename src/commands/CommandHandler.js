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
    this.voiceManager = managers.voiceManager;
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

    // Voice channel commands
    if (lowerContent === '.on vc' || lowerContent.startsWith('.on vc ')) {
      await message.delete().catch(() => {});
      return await this.handleVoiceJoin(message, lowerContent);
    }
    
    if (lowerContent === '.off vc') {
      await message.delete().catch(() => {});
      return await this.handleVoiceLeave(message);
    }
    
    if (lowerContent === '.vc status') {
      await message.delete().catch(() => {});
      const guildId = message.guild?.id;
      const status = this.voiceManager.getStatus(guildId);
      return message.channel.send(status).catch(() => {});
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
   * Handle voice join command
   */
  async handleVoiceJoin(message, lowerContent) {
    // Parse optional channel ID from command
    const parts = lowerContent.split(' ');
    let targetChannel = null;
    
    if (parts.length > 2) {
      // Channel ID provided
      const channelId = parts[2];
      targetChannel = this.client.channels.cache.get(channelId);
      
      if (!targetChannel || !targetChannel.isVoice()) {
        return message.channel.send(`❌ Invalid voice channel ID: \`${channelId}\``).catch(() => {});
      }
    } else {
      // No channel ID provided - try to get current voice channel from VoiceManager or guild
      const guildId = message.guild?.id;
      const currentConnection = guildId ? this.voiceManager.getConnectionStatus(guildId) : null;
      
      if (currentConnection) {
        // Already connected to a voice channel
        return message.channel.send([
          '⚠️ **Already connected to a voice channel**',
          '',
          `📍 **Channel:** ${currentConnection.channelName}`,
          'Use `.off vc` to disconnect first, or provide a different channel ID.',
        ].join('\n')).catch(() => {});
      }
      
      // Try to find a voice channel in the guild
      return message.channel.send([
        '❌ **No voice channel specified**',
        '',
        'Please provide a channel ID:',
        '• `.on vc <channel_id>` - Join a specific voice channel',
        '',
        'You can get a channel ID by right-clicking a voice channel and selecting "Copy ID".',
      ].join('\n')).catch(() => {});
    }

    // Send processing message first
    const processingMsg = await message.channel.send('🔄 **Joining voice channel...**').catch(() => null);
    
    const result = await this.voiceManager.joinChannel(targetChannel, true, true);
    
    // Delete processing message if it exists
    if (processingMsg) {
      await processingMsg.delete().catch(() => {});
    }
    
    // Check connection status directly as fallback
    const guildId = message.guild?.id;
    const connectionStatus = guildId ? this.voiceManager.getConnectionStatus(guildId) : null;
    
    if (result || connectionStatus) {
      const status = result || connectionStatus;
      return message.channel.send([
        '🎤 **Auto Voice Enabled**',
        '',
        `📍 **Channel:** ${status.channelName}`,
        `🏠 **Server:** ${status.guildName}`,
        '🔇 **Self Mute:** Yes',
        '🔈 **Self Deaf:** Yes',
        '',
        '*Will auto-reconnect if disconnected*',
        'Use `.off vc` to leave',
      ].join('\n')).catch(() => {});
    } else {
      return message.channel.send('❌ **Failed to join voice channel**').catch(() => {});
    }
  }

  /**
   * Handle voice leave command
   */
  async handleVoiceLeave(message) {
    const guildId = message.guild?.id;
    
    if (!guildId) {
      return message.channel.send('❌ **This command must be used in a server**').catch(() => {});
    }

    const wasConnected = this.voiceManager.isConnected(guildId);
    
    if (!wasConnected) {
      return message.channel.send('❌ **Not connected to any voice channel in this server**').catch(() => {});
    }

    await this.voiceManager.disconnect(guildId);
    
    return message.channel.send('🔇 **Auto Voice Disabled** - Left voice channel').catch(() => {});
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
      '**🎤 Voice Channel:**',
      '• `.on vc <channel_id>` - Join voice channel & stay',
      '• `.off vc` - Leave voice channel',
      '• `.vc status` - Check voice status',
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
