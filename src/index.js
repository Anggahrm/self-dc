/**
 * EPIC RPG Self Bot
 * A Discord self-bot for automating EPIC RPG tasks
 *
 * Features:
 * - Auto Farm (adventure, axe, hunt with auto-heal)
 * - Auto Event Catch
 * - Auto Enchant (enchant/refine/transmute/transcend)
 * - Auto Voice Channel Join & Stay
 * - Debug Mode
 * - PostgreSQL Database Support
 * - Health Monitoring
 */

require('dotenv').config();
const Discord = require('discord.js-selfbot-v13');
const express = require('express');
const { Logger, database, ErrorHandler, Monitoring } = require('./utils');
const { FarmManager, EventHandler, DebugManager, AutoEnchantManager, VoiceManager } = require('./managers');
const { CommandHandler } = require('./commands');

// Initialize logger
const logger = Logger.create('System');

// Start keep-alive web server for Heroku
const PORT = process.env.PORT || 3000;
const app = express();

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    bot: client.user ? client.user.username : 'starting'
  });
});

app.get('/health', (req, res) => {
  const health = client.monitoring ? client.monitoring.getHealthStatus() : { status: 'starting' };
  res.json(health);
});

app.listen(PORT, () => {
  logger.info(`Keep-alive server listening on port ${PORT}`);
});

// Create Discord client
const client = new Discord.Client({
  readyStatus: false,
  checkUpdate: false,
});

// Initialize error handler
const errorHandler = new ErrorHandler(client);
errorHandler.initialize();

// Initialize monitoring
const monitoring = new Monitoring(client);
monitoring.initialize();

// Initialize managers
const farmManager = new FarmManager(client);
const eventHandler = new EventHandler(client);
const debugManager = new DebugManager(client);
const autoEnchantManager = new AutoEnchantManager(client);
const voiceManager = new VoiceManager(client);

// Initialize command handler
const commandHandler = new CommandHandler(client, {
  farmManager,
  eventHandler,
  debugManager,
  autoEnchantManager,
  voiceManager,
});

// Make monitoring accessible globally for commands
client.monitoring = monitoring;
client.errorHandler = errorHandler;

// Ready event
client.on('ready', async () => {
  logger.success(`Logged in as: ${client.user.username}`);

  // Initialize database
  const dbConnected = await database.initDatabase();
  if (dbConnected) {
    logger.info('Database connected - data will be persisted');
  } else {
    logger.warn('Running without database - data will not persist');
  }

  // Initialize voice manager (restore connections from database)
  await voiceManager.initialize();

  // Log initial health status
  const health = monitoring.getHealthStatus();
  logger.info(`Health status: ${health.status}`);

  logger.info('Self bot ready!');
  logger.info('Use .help to see available commands');
});

// Message event
client.on('messageCreate', async (message) => {
  monitoring.recordMessage();
  await commandHandler.handle(message);
});

// Voice state update event for connection monitoring
client.on('voiceStateUpdate', async (oldState, newState) => {
  await voiceManager.handleVoiceStateUpdate(oldState, newState);
});

// Graceful shutdown
process.on('exit', () => {
  logger.info('Shutting down...');
  // Note: exit event cannot use async, cleanup is done in SIGINT/SIGTERM
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up...');
  farmManager.cleanup();
  autoEnchantManager.cleanup();
  await voiceManager.cleanup();
  await database.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up...');
  farmManager.cleanup();
  autoEnchantManager.cleanup();
  await voiceManager.cleanup();
  await database.closeDatabase();
  process.exit(0);
});

// Validate token and login
if (!process.env.DISCORD_TOKEN) {
  logger.error('DISCORD_TOKEN not found in environment variables');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
