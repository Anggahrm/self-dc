const os = require('node:os');
const Discord = require('discord.js-selfbot-v13');
const { RPC, FILE_NAMES } = require('../config/config');
const { Utils } = require('../utils/utils');

class RPCManager {
  constructor(client) {
    this.client = client;
    this.startTimestamp = null;
    this.extendURL = null;
    this.presenceTimer = null;
    this.rpcEnabled = false;
    this.currentChannel = null;
  }

  async initialize() {
    this.extendURL = await Discord.RichPresence.getExternal(
      this.client,
      RPC.APPLICATION_ID,
      RPC.LARGE_IMAGE_URL
    );
  }

  async updatePresence() {
    const currentFile = Utils.getRandomFile(FILE_NAMES);
    console.log(`Now editing: ${currentFile}`);

    const presence = new Discord.RichPresence(this.client)
      .setApplicationId(RPC.APPLICATION_ID)
      .setType('PLAYING')
      .setState(`Workspace: ${RPC.WORKSPACE_NAME}`)
      .setName(RPC.APP_NAME)
      .setDetails(`Editing ${currentFile}`)
      .setStartTimestamp(this.startTimestamp)
      .setAssetsLargeImage(this.extendURL[0].external_asset_path)
      .setAssetsLargeText('JavaScript')
      .setAssetsSmallImage(RPC.SMALL_IMAGE_URL)
      .setAssetsSmallText(RPC.APP_NAME)
      .setPlatform(RPC.PLATFORM)
      .addButton('Community', RPC.COMMUNITY_LINK);

    this.client.user.setPresence({ 
      activities: [presence], 
      status: RPC.STATUS 
    });

    const nextInterval = Utils.getRandomInterval();
    console.log(`Next update in ${nextInterval / 60000} minutes`);

    if (this.presenceTimer) {
      clearTimeout(this.presenceTimer);
    }
    this.presenceTimer = setTimeout(() => this.updatePresence(), nextInterval);
  }

  start(channel = null) {
    if (this.rpcEnabled) return;

    this.rpcEnabled = true;
    this.currentChannel = channel;
    this.startTimestamp = Date.now() - (os.uptime() * 1000);
    
    console.log('🟢 RPC Started');
    if (this.currentChannel) {
      this.currentChannel.send('🟢 **RPC Started**').catch(() => {});
    }
    
    this.updatePresence();
  }

  stop() {
    if (!this.rpcEnabled) return;

    this.rpcEnabled = false;
    if (this.presenceTimer) {
      clearTimeout(this.presenceTimer);
      this.presenceTimer = null;
    }

    this.client.user.setPresence({ activities: [], status: "online" });
    console.log('🔴 RPC Stopped');
    if (this.currentChannel) {
      this.currentChannel.send('🔴 **RPC Stopped**').catch(() => {});
    }
  }

  cleanup() {
    if (this.presenceTimer) {
      clearTimeout(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  setCurrentChannel(channel) {
    this.currentChannel = channel;
  }
}

module.exports = { RPCManager };