/**
 * Command Handler
 * Handles user command parsing and execution using Command Registry
 */

const { Logger } = require('../utils/logger');
const { DiscordUtils } = require('../utils/discord');
const { ValidationUtils } = require('../utils/validation');
const { registry } = require('./CommandRegistry');
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

    // Register all commands
    this.registerCommands();
  }

  /**
   * Register all commands to the registry
   */
  registerCommands() {
    // Farm Commands
    registry.register(
      {
        name: '.on farm',
        description: 'Start auto farm (adventure, axe, hunt with auto-heal)',
        category: 'Farm',
        aliases: ['.farm on'],
      },
      async (message, args, handler) => {
        await handler.farmManager.start(message.channel);
      }
    );

    registry.register(
      {
        name: '.off farm',
        description: 'Stop auto farm',
        category: 'Farm',
        aliases: ['.farm off'],
      },
      async (message, args, handler) => {
        handler.farmManager.setChannel(message.channel);
        handler.farmManager.stop();
      }
    );

    registry.register(
      {
        name: '.farm status',
        description: 'Check farm status',
        category: 'Farm',
      },
      async (message, args, handler) => {
        const status = handler.farmManager.getStatus();
        await DiscordUtils.safeSend(message.channel, status);
      }
    );

    // Event Commands
    registry.register(
      {
        name: '.on event',
        description: 'Enable auto event catch',
        category: 'Events',
        aliases: ['.event on'],
      },
      async (message, args, handler) => {
        handler.eventHandler.setChannel(message.channel);
        handler.eventHandler.setEnabled(true);
        await DiscordUtils.safeSend(message.channel, '🎯 **Auto Event Enabled**');
      }
    );

    registry.register(
      {
        name: '.off event',
        description: 'Disable auto event catch',
        category: 'Events',
        aliases: ['.event off'],
      },
      async (message, args, handler) => {
        handler.eventHandler.setChannel(message.channel);
        handler.eventHandler.setEnabled(false);
        await DiscordUtils.safeSend(message.channel, '🛑 **Auto Event Disabled**');
      }
    );

    // Voice Commands
    registry.register(
      {
        name: '.on vc',
        description: 'Join voice channel & stay',
        category: 'Voice',
        aliases: ['.vc on', '.voice on'],
        args: [
          { name: 'channel_id', description: 'Voice channel ID (optional)', required: false },
        ],
        examples: ['.on vc', '.on vc 123456789012345678'],
        guildOnly: true,
      },
      async (message, args, handler) => {
        await handler.handleVoiceJoin(message, args[0]);
      }
    );

    registry.register(
      {
        name: '.off vc',
        description: 'Leave voice channel',
        category: 'Voice',
        aliases: ['.vc off', '.voice off'],
        guildOnly: true,
      },
      async (message, args, handler) => {
        await handler.handleVoiceLeave(message);
      }
    );

    registry.register(
      {
        name: '.vc status',
        description: 'Check voice status',
        category: 'Voice',
        guildOnly: true,
      },
      async (message, args, handler) => {
        const guildId = message.guild?.id;
        const status = handler.voiceManager.getStatus(guildId);
        await DiscordUtils.safeSend(message.channel, status);
      }
    );

    // Debug Commands
    registry.register(
      {
        name: '.on debug',
        description: 'Enable debug logging',
        category: 'Debug',
      },
      async (message, args, handler) => {
        handler.debugManager.setChannel(message.channel);
        handler.debugManager.setEnabled(true);
        await DiscordUtils.safeSend(message.channel, '🔍 **Debug Mode Enabled** - Bot messages will be logged');
      }
    );

    registry.register(
      {
        name: '.off debug',
        description: 'Disable debug logging',
        category: 'Debug',
      },
      async (message, args, handler) => {
        handler.debugManager.setChannel(message.channel);
        handler.debugManager.setEnabled(false);
        await DiscordUtils.safeSend(message.channel, '🔍 **Debug Mode Disabled**');
      }
    );

    // Debug command (special - handles replies and subcommands)
    registry.register(
      {
        name: '.debug',
        description: 'Debug slash command or replied message',
        category: 'Debug',
        args: [
          { name: 'command', description: 'Slash command to debug', required: false },
        ],
        examples: ['.debug', '.debug hunt', '.debug (reply to message)'],
      },
      async (message, args, handler) => {
        await handler.debugManager.handleDebugCommand(message);
      }
    );

    // Enchant Commands
    const enchantTypes = ['enchant', 'refine', 'transmute', 'transcend'];
    for (const type of enchantTypes) {
      registry.register(
        {
          name: `.on ${type}`,
          description: `Start auto ${type} until target is achieved`,
          category: 'Enchant',
          args: [
            { name: 'equipment', description: 'sword or armor', required: true },
            { name: 'target', description: 'Target enchant tier', required: true },
          ],
          examples: [`.on ${type} sword epic`, `.on ${type} armor godly`],
        },
        async (message, args, handler) => {
          const equipment = args[0];
          const target = args.slice(1).join(' ');

          if (!equipment || !target) {
            return DiscordUtils.safeSend(
              message.channel,
              `❌ Usage: \`.on ${type} <sword/armor> <target>\``
            );
          }

          const validation = ValidationUtils.validateEnchantInput(type, equipment, target);
          if (!validation.valid) {
            return DiscordUtils.safeSend(message.channel, `❌ ${validation.error}`);
          }

          await handler.autoEnchantManager.start(
            message.channel,
            type,
            equipment,
            validation.sanitizedTarget || target
          );
        }
      );

      registry.register(
        {
          name: `.off ${type}`,
          description: `Stop auto ${type}`,
          category: 'Enchant',
        },
        async (message, args, handler) => {
          await handler.autoEnchantManager.stop(message.channel);
        }
      );
    }

    // Enchant status commands
    for (const type of ['enchant', 'refine', 'transmute', 'transcend']) {
      registry.register(
        {
          name: `.${type} status`,
          description: `Check ${type} status`,
          category: 'Enchant',
        },
        async (message, args, handler) => {
          const status = handler.autoEnchantManager.getStatus(message.channel);
          await DiscordUtils.safeSend(message.channel, status);
        }
      );
    }

    // Help Command
    registry.register(
      {
        name: '.help',
        description: 'Show this help message',
        category: 'General',
        args: [
          { name: 'command', description: 'Specific command to get help for', required: false },
        ],
        examples: ['.help', '.help .on farm'],
      },
      async (message, args, handler) => {
        if (args.length > 0) {
          const cmdName = args[0].toLowerCase();
          const help = registry.generateCommandHelp(cmdName);
          if (help) {
            await DiscordUtils.safeSend(message.channel, help);
          } else {
            await DiscordUtils.safeSend(message.channel, `❌ Unknown command: \`${cmdName}\``);
          }
        } else {
          const help = registry.generateHelp();
          await DiscordUtils.safeSend(message.channel, help);
        }
      }
    );

    this.logger.info(`Registered ${registry.getAll().length} commands`);
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

    // Sanitize input
    const lowerContent = ValidationUtils.sanitizeInput(content.toLowerCase());

    // Parse command and arguments
    const { commandName, args } = this.parseCommand(lowerContent);

    // Look up command
    const command = registry.get(commandName);
    if (!command) return;

    // Check guild requirement
    if (command.guildOnly && !message.guild) {
      await DiscordUtils.safeSend(message.channel, '❌ This command must be used in a server');
      return;
    }

    // Delete command message
    await DiscordUtils.safeDelete(message);

    // Execute command
    try {
      this.logger.debug(`Executing: ${command.name}`);
      await command.handler(message, args, this);
    } catch (error) {
      this.logger.error(`Command error (${command.name}): ${error.message}`);
    }
  }

  /**
   * Parse command name and arguments from message
   * @param {string} content - Message content (lowercase)
   * @returns {Object} { commandName, args }
   */
  parseCommand(content) {
    const parts = content.split(/\s+/);
    const commandName = parts[0];

    // Special handling for enchant commands (.on enchant, .on refine, etc.)
    const enchantMatch = content.match(/^\.on\s+(enchant|refine|transmute|transcend)\s+(.+)$/);
    if (enchantMatch) {
      const [, type, rest] = enchantMatch;
      const restParts = rest.trim().split(/\s+/);
      return {
        commandName: `.on ${type}`,
        args: restParts,
      };
    }

    // Special handling for .debug command
    if (parts[0] === '.debug' && parts.length > 1) {
      return {
        commandName: '.debug',
        args: parts.slice(1),
      };
    }

    return {
      commandName,
      args: parts.slice(1),
    };
  }

  /**
   * Handle voice join command
   * @param {Object} message - Discord message
   * @param {string} channelIdArg - Optional channel ID from args
   */
  async handleVoiceJoin(message, channelIdArg) {
    let targetChannel = null;

    if (channelIdArg) {
      // Channel ID provided as argument
      const validation = ValidationUtils.validateChannelId(channelIdArg);
      if (!validation.valid) {
        return DiscordUtils.safeSend(message.channel, `❌ ${validation.error}`);
      }

      targetChannel = this.client.channels.cache.get(validation.sanitized);

      if (!targetChannel || !targetChannel.isVoice()) {
        return DiscordUtils.safeSend(message.channel, `❌ Voice channel not found: \`${channelIdArg}\``);
      }
    } else {
      // No channel ID provided
      const guildId = message.guild?.id;
      const currentConnection = guildId ? this.voiceManager.getConnectionStatus(guildId) : null;

      if (currentConnection) {
        return DiscordUtils.safeSend(message.channel, [
          '⚠️ **Already connected to a voice channel**',
          '',
          `📍 **Channel:** ${currentConnection.channelName}`,
          'Use `.off vc` to disconnect first, or provide a different channel ID.',
        ].join('\n'));
      }

      return DiscordUtils.safeSend(message.channel, [
        '❌ **No voice channel specified**',
        '',
        'Please provide a channel ID:',
        '• `.on vc <channel_id>` - Join a specific voice channel',
        '',
        'You can get a channel ID by right-clicking a voice channel and selecting "Copy ID".',
      ].join('\n'));
    }

    // Send processing message
    const processingMsg = await DiscordUtils.safeSend(message.channel, '🔄 **Joining voice channel...**');

    const result = await this.voiceManager.joinChannel(targetChannel, true, true);

    if (processingMsg) {
      await DiscordUtils.safeDelete(processingMsg);
    }

    // Check connection status
    const guildId = message.guild?.id;
    const connectionStatus = guildId ? this.voiceManager.getConnectionStatus(guildId) : null;

    if (result || connectionStatus) {
      const status = result || connectionStatus;
      return DiscordUtils.safeSend(message.channel, [
        '🎤 **Auto Voice Enabled**',
        '',
        `📍 **Channel:** ${status.channelName}`,
        `🏠 **Server:** ${status.guildName}`,
        '🔇 **Self Mute:** Yes',
        '🔈 **Self Deaf:** Yes',
        '',
        '*Will auto-reconnect if disconnected*',
        'Use `.off vc` to leave',
      ].join('\n'));
    } else {
      return DiscordUtils.safeSend(message.channel, '❌ **Failed to join voice channel**');
    }
  }

  /**
   * Handle voice leave command
   * @param {Object} message - Discord message
   */
  async handleVoiceLeave(message) {
    const guildId = message.guild?.id;

    if (!guildId) {
      return DiscordUtils.safeSend(message.channel, '❌ **This command must be used in a server**');
    }

    const wasConnected = this.voiceManager.isConnected(guildId);

    if (!wasConnected) {
      return DiscordUtils.safeSend(message.channel, '❌ **Not connected to any voice channel in this server**');
    }

    await this.voiceManager.disconnect(guildId);

    return DiscordUtils.safeSend(message.channel, '🔇 **Auto Voice Disabled** - Left voice channel');
  }
}

module.exports = { CommandHandler };
