/**
 * Application Configuration
 * Centralized configuration for the selfbot
 */

module.exports = {
  // Epic RPG Bot ID
  EPIC_RPG_BOT_ID: '555955826880413696',

  // Command prefix
  PREFIX: '.',

  // Farm configuration
  FARM: {
    COOLDOWNS: {
      adventure: 3600000,  // 1 hour
      axe: 300000,         // 5 minutes
      hunt: 60000,         // 1 minute
    },
    HEAL_HP_PERCENT: 60,   // Heal when HP below this percentage
    HEAL_HP_MIN: 60,       // Also heal when HP below this absolute value
    RESPONSE_TIMEOUT: 15000,
    HEAL_DELAY: 2000,
    START_DELAY: 3000,
  },

  // Auto Enchant configuration
  ENCHANT: {
    // Enchant types and their unlock areas
    // area: minimum area required to unlock this type
    // priceMultiplier: cost multiplier compared to base enchant
    TYPES: {
      enchant: { area: 1, priceMultiplier: 1 },
      refine: { area: 7, priceMultiplier: 10 },
      transmute: { area: 13, priceMultiplier: 100 },
      transcend: { area: 15, priceMultiplier: 1000 },
    },
    /**
     * Enchant tiers in order of quality (worst to best)
     * - name: Display name of the enchant tier
     * - bonus: AT/DEF bonus percentage (e.g., 40 = +40%)
     * - timeTravel: Minimum time travel count required to unlock
     */
    TIERS: [
      { name: 'NORMIE', bonus: 5, timeTravel: 0 },
      { name: 'GOOD', bonus: 15, timeTravel: 0 },
      { name: 'GREAT', bonus: 25, timeTravel: 0 },
      { name: 'MEGA', bonus: 40, timeTravel: 0 },
      { name: 'EPIC', bonus: 60, timeTravel: 0 },
      { name: 'HYPER', bonus: 70, timeTravel: 0 },
      { name: 'ULTIMATE', bonus: 80, timeTravel: 0 },
      { name: 'PERFECT', bonus: 90, timeTravel: 0 },
      { name: 'EDGY', bonus: 95, timeTravel: 0 },
      { name: 'ULTRA-EDGY', bonus: 100, timeTravel: 0 },
      { name: 'OMEGA', bonus: 125, timeTravel: 1 },
      { name: 'ULTRA-OMEGA', bonus: 150, timeTravel: 3 },
      { name: 'GODLY', bonus: 200, timeTravel: 5 },
      { name: 'VOID', bonus: 300, timeTravel: 15 },
      { name: 'ETERNAL', bonus: 305, timeTravel: 150 },
    ],
    // Equipment types
    EQUIPMENT: ['sword', 'armor'],
    // Delay between enchant attempts (ms)
    RETRY_DELAY: 2000,
    // Response timeout (ms)
    RESPONSE_TIMEOUT: 15000,
  },

  // Event configuration
  EVENTS: {
    EPIC_COIN: {
      FIELD_NAME: 'God accidentally dropped an EPIC coin',
      FIELD_VALUE: 'I wonder who will be the lucky player to get it??',
      RESPONSE: 'CATCH',
    },
    COIN_RAIN: {
      FIELD_NAME: "IT'S RAINING COINS",
      FIELD_VALUE: 'Type **CATCH**',
      RESPONSE: 'CATCH',
    },
    EPIC_TREE: {
      FIELD_NAME: 'AN EPIC TREE HAS JUST GROWN',
      FIELD_VALUE: 'Type **CUT**',
      RESPONSE: 'CUT',
      BUTTON_ID: 'epictree_join',
    },
    MEGALODON: {
      FIELD_NAME: 'A MEGALODON HAS SPAWNED',
      FIELD_VALUE: 'Type **LURE**',
      RESPONSE: 'LURE',
    },
    ARENA: {
      PATTERNS: [
        {
          FIELD_NAME: 'Type `join` to join the arena!',
          FIELD_VALUE: 'arena cookies',
          RESPONSE: 'JOIN',
        },
        {
          DESCRIPTION: 'started an arena event!',
          FIELD_NAME: 'join the arena',
          FIELD_VALUE: 'arena cookies',
          RESPONSE: 'JOIN',
          BUTTON_ID: 'arena_join',
        },
      ],
    },
    MINIBOSS: {
      PATTERNS: [
        {
          FIELD_NAME: 'Type `fight` to help and get a reward!',
          FIELD_VALUE: 'CHANCE TO WIN',
          RESPONSE: 'FIGHT',
        },
        {
          DESCRIPTION: 'Help',
          AUTHOR: 'miniboss',
          FIELD_NAME: 'help and boost!',
          FIELD_VALUE: 'CHANCE TO WIN',
          RESPONSE: 'JOIN',
          BUTTON_ID: 'miniboss_join',
        },
      ],
    },
    LOOTBOX_SUMMONING: {
      FIELD_NAME: 'A LOOTBOX SUMMONING HAS STARTED',
      FIELD_VALUE: 'Type **SUMMON**',
      RESPONSE: 'SUMMON',
      BUTTON_ID: 'lootboxsummoning_join',
    },
    LEGENDARY_BOSS: {
      FIELD_NAME: 'A LEGENDARY BOSS JUST SPAWNED',
      FIELD_VALUE: 'Type **TIME TO FIGHT**',
      RESPONSE: 'TIME TO FIGHT',
      BUTTON_ID: 'legendaryboss_join',
    },
  },

  // Timeouts
  TIMEOUTS: {
    FARM_COMMAND: 15000,
    EVENT_RESPONSE: 10000,
    DEBUG_COMMAND: 15000,
    DEFERRED_RESPONSE: 900000,  // 15 minutes
    THINKING_CLEANUP: 900000,
  },
};
