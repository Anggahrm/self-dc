module.exports = {
  // Bot IDs
  EPIC_RPG_BOT_ID: '555955826880413696',
  
  // RPC Configuration
  RPC: {
    APPLICATION_ID: '1380551344515055667',
    WORKSPACE_NAME: 'ZumyNext',
    APP_NAME: 'Visual Studio Code',
    PLATFORM: 'desktop',
    STATUS: 'idle',
    COMMUNITY_LINK: 'https://discord.gg/W9qD2mYXxf',
    LARGE_IMAGE_URL: 'https://files.catbox.moe/nawqku.png',
    SMALL_IMAGE_URL: 'https://cdn.discordapp.com/emojis/1410862047998246942.webp'
  },

  // File names for RPC presence
  FILE_NAMES: [
    'main.js',
    'server.js',
    'index.js',
    'config.js',
    'test.js',
    'lib/baileys.js',
    'lib/converter.js',
    'lib/functions.js',
    'lib/print.js',
    'lib/simple.js'
  ],

  // Farm cooldowns (in milliseconds)
  FARM_COOLDOWNS: {
    adventure: 3600000, // 1 hour
    axe: 300000,      // 5 minutes
    hunt: 60000        // 1 minute
    // heal removed - no cooldown, only HP-based
  },

  // Farm settings
  FARM: {
    HEAL_HP_THRESHOLD: 60, // Heal when HP is below 60% or < 60 HP
    RESPONSE_TIMEOUT: 15000, // 15 seconds
    HEAL_DELAY: 2000, // 2 seconds delay after heal
    FARM_START_DELAY: 3000 // 3 seconds delay before starting timers
  },

  // Timeout configurations
  TIMEOUTS: {
    FARM_COMMAND: 15000,        // 15 seconds for farm commands
    EVENT_RESPONSE: 10000,      // 10 seconds for event responses
    DEBUG_COMMAND: 15000,       // 15 seconds for debug commands
    DEFERRED_RESPONSE: 900000,  // 15 minutes for deferred/thinking responses
    THINKING_CLEANUP: 900000    // 15 minutes to cleanup pending thinking messages
  },

  // Event detection patterns
  EVENTS: {
    EPIC_COIN: {
      FIELD_NAME: 'God accidentally dropped an EPIC coin',
      FIELD_VALUE: 'I wonder who will be the lucky player to get it??',
      RESPONSE: 'CATCH'
    },
    COIN_RAIN: {
      FIELD_NAME: "IT'S RAINING COINS",
      FIELD_VALUE: 'Type **CATCH**',
      RESPONSE: 'CATCH'
    },
    EPIC_TREE: {
      FIELD_NAME: 'AN EPIC TREE HAS JUST GROWN',
      FIELD_VALUE: 'Type **CUT**',
      RESPONSE: 'CUT',
      BUTTON_ID: 'epictree_join'
    },
    MEGALODON: {
      FIELD_NAME: 'A MEGALODON HAS SPAWNED',
      FIELD_VALUE: 'Type **LURE**',
      RESPONSE: 'LURE'
    },
    ARENA: {
      // Support both prefix and slash command formats
      PATTERNS: [
        {
          // Prefix command format
          FIELD_NAME: 'Type `join` to join the arena!',
          FIELD_VALUE: 'arena cookies',
          RESPONSE: 'JOIN'
        },
        {
          // Slash command format
          DESCRIPTION: 'started an arena event!',
          FIELD_NAME: 'join the arena',
          FIELD_VALUE: 'arena cookies',
          RESPONSE: 'JOIN',
          BUTTON_ID: 'arena_join'
        }
      ]
    },
    MINIBOSS: {
      // Support both prefix and slash command formats
      PATTERNS: [
        {
          // Prefix command format
          FIELD_NAME: 'Type `fight` to help and get a reward!',
          FIELD_VALUE: 'CHANCE TO WIN',
          RESPONSE: 'FIGHT'
        },
        {
          // Slash command format
          DESCRIPTION: 'Help',
          AUTHOR: 'miniboss',
          FIELD_NAME: 'help and boost!',
          FIELD_VALUE: 'CHANCE TO WIN',
          RESPONSE: 'JOIN',
          BUTTON_ID: 'miniboss_join'
        }
      ]
    },
    LOOTBOX_SUMMONING: {
      FIELD_NAME: 'A LOOTBOX SUMMONING HAS STARTED',
      FIELD_VALUE: 'Type **SUMMON**',
      RESPONSE: 'SUMMON',
      BUTTON_ID: 'lootboxsummoning_join'
    },
    LEGENDARY_BOSS: {
      FIELD_NAME: 'A LEGENDARY BOSS JUST SPAWNED',
      FIELD_VALUE: 'Type **TIME TO FIGHT**',
      RESPONSE: 'TIME TO FIGHT',
      BUTTON_ID: 'legendaryboss_join'
    }
  }
};
