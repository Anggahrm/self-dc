/**
 * EPIC RPG Self Bot
 * A Discord self-bot for automating EPIC RPG tasks
 * 
 * Features:
 * - Auto Farm (adventure, axe, hunt with auto-heal)
 * - Auto Event Catch
 * - Auto Enchant (enchant/refine/transmute/transcend)
 * - Debug Mode
 */

require('dotenv').config();
const Discord = require('discord.js-selfbot-v13');
const { Logger } = require('./utils');
const { FarmManager, EventHandler, DebugManager, AutoEnchantManager } = require('./managers');
const { CommandHandler } = require('./commands');

// Initialize logger
const logger = Logger.create('System');

// Create Discord client
const client = new Discord.Client({
  readyStatus: false,
  checkUpdate: false,
});

// Initialize managers
const farmManager = new FarmManager(client);
const eventHandler = new EventHandler(client);
const debugManager = new DebugManager(client);
const autoEnchantManager = new AutoEnchantManager(client);

// Initialize command handler
const commandHandler = new CommandHandler(client, {
  farmManager,
  eventHandler,
  debugManager,
  autoEnchantManager,
});

// Ready event
client.on('ready', () => {
  logger.success(`Logged in as: ${client.user.username}`);
  logger.info('Self bot ready!');
  logger.info('Use .help to see available commands');
});

// Message event
client.on('messageCreate', async (message) => {
  await commandHandler.handle(message);
});

// Graceful shutdown
process.on('exit', () => {
  logger.info('Shutting down...');
  farmManager.cleanup();
  autoEnchantManager.cleanup();
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, cleaning up...');
  farmManager.cleanup();
  autoEnchantManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, cleaning up...');
  farmManager.cleanup();
  autoEnchantManager.cleanup();
  process.exit(0);
});

// Validate token and login
if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
