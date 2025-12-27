const { EPIC_RPG_BOT_ID } = require('../config/config');

class MessageHandler {
  constructor(client, managers) {
    this.client = client;
    this.farmManager = managers.farmManager;
    this.debugManager = managers.debugManager;
    this.eventHandler = managers.eventHandler;
  }

  async handle(message) {
    // Process auto-events and debug logging for EPIC RPG bot messages
    if (message.author.id === EPIC_RPG_BOT_ID) {
      await this.eventHandler.handleAutoEvent(message);
      await this.debugManager.logBotDebugInfo(message);
      return;
    }

    // Only process messages from the client user
    if (message.author.id !== this.client.user.id) return;

    const content = message.content.toLowerCase().trim();

    // Handle debug commands (both reply and slash command)
    if (content === '.debug' || content.startsWith('.debug ')) {
      const handled = await this.debugManager.handleDebugCommand(message);
      if (handled) return;
    }

    // Handle Farm commands
    if (content === '.on farm') {
      await message.delete().catch(() => {});
      await this.farmManager.start(message.channel);
    } else if (content === '.off farm') {
      await message.delete().catch(() => {});
      this.farmManager.setCurrentChannel(message.channel);
      this.farmManager.stop();
    } else if (content === '.farm status') {
      await message.delete().catch(() => {});
      const status = this.farmManager.getStatus();
      message.channel.send(status).catch(() => {});
    }
    
    // Handle Event commands
    else if (content === '.on event') {
      await message.delete().catch(() => {});
      this.eventHandler.setCurrentChannel(message.channel);
      this.eventHandler.setEnabled(true);
      console.log('Auto Event Enabled');
      message.channel.send('**Auto Event Enabled**').catch(() => {});
    } else if (content === '.off event') {
      await message.delete().catch(() => {});
      this.eventHandler.setCurrentChannel(message.channel);
      this.eventHandler.setEnabled(false);
      console.log('Auto Event Disabled');
      message.channel.send('**Auto Event Disabled**').catch(() => {});
    }
    
    // Handle Debug commands
    else if (content === '.on debug') {
      await message.delete().catch(() => {});
      this.debugManager.setCurrentChannel(message.channel);
      this.debugManager.setDebugEnabled(true);
      console.log('Debug Enabled');
      message.channel.send('**Debug Enabled** - Bot events will be shown').catch(() => {});
    } else if (content === '.off debug') {
      await message.delete().catch(() => {});
      this.debugManager.setCurrentChannel(message.channel);
      this.debugManager.setDebugEnabled(false);
      console.log('Debug Disabled');
      message.channel.send('**Debug Disabled** - Bot events will be hidden').catch(() => {});
    }
  }
}

module.exports = { MessageHandler };