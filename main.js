require('dotenv').config();
const Discord = require('discord.js-selfbot-v13');
const { FarmManager } = require('./modules/farm');
const { EventHandler } = require('./modules/events');
const { DebugManager } = require('./modules/debug');
const { MessageHandler } = require('./modules/messageHandler');

const client = new Discord.Client({
  readyStatus: false,
  checkUpdate: false,
});

// Initialize managers
const farmManager = new FarmManager(client);
const debugManager = new DebugManager(client);
const eventHandler = new EventHandler(client);
const messageHandler = new MessageHandler(client, {
  farmManager,
  debugManager,
  eventHandler
});

client.on('ready', () => {
  console.log(`Logged in as: ${client.user.username}`);
  console.log('Selfbot ready!');
  console.log('Commands: .on farm, .off farm, .farm status, .on event, .off event, .on debug, .off debug, .debug <command>');
});

client.on('messageCreate', async (message) => {
  await messageHandler.handle(message);
});

// Graceful shutdown
process.on('exit', () => {
  farmManager.cleanup();
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN not found in environment variables.');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);