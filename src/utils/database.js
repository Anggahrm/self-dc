/**
 * Database Utility
 * PostgreSQL connection and query handling
 */

const { Pool } = require('pg');
const { Logger } = require('./logger');

const logger = Logger.create('Database');

// Database pool instance
let pool = null;

/**
 * Initialize database connection
 * @returns {Promise<boolean>} True if connection successful
 */
async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set - running without database persistence');
    return false;
  }

  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') 
        ? false 
        : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== 'false' },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.success('Database connected successfully');
    
    // Initialize tables
    await initTables();
    
    return true;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    pool = null;
    return false;
  }
}

/**
 * Initialize database tables
 */
async function initTables() {
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cooldowns (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        command VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, command)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS voice_settings (
        guild_id VARCHAR(255) PRIMARY KEY,
        channel_id VARCHAR(255) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        self_mute BOOLEAN DEFAULT true,
        self_deaf BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Database tables initialized');
  } catch (error) {
    logger.error(`Failed to initialize tables: ${error.message}`);
  }
}

/**
 * Check if database is connected
 * @returns {boolean}
 */
function isConnected() {
  return pool !== null;
}

/**
 * Get a setting value
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not found
 * @returns {Promise<*>}
 */
async function getSetting(key, defaultValue = null) {
  if (!pool) return defaultValue;

  try {
    const result = await pool.query(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );
    
    if (result.rows.length > 0) {
      try {
        return JSON.parse(result.rows[0].value);
      } catch (parseError) {
        // Value is not JSON, return as string
        return result.rows[0].value;
      }
    }
    return defaultValue;
  } catch (error) {
    logger.error(`Failed to get setting ${key}: ${error.message}`);
    return defaultValue;
  }
}

/**
 * Set a setting value
 * @param {string} key - Setting key
 * @param {*} value - Value to store
 * @returns {Promise<boolean>}
 */
async function setSetting(key, value) {
  if (!pool) return false;

  try {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    
    await pool.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key)
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `, [key, valueStr]);
    
    return true;
  } catch (error) {
    logger.error(`Failed to set setting ${key}: ${error.message}`);
    return false;
  }
}

/**
 * Get cooldown for a command
 * @param {string} userId - User ID
 * @param {string} command - Command name
 * @returns {Promise<Date|null>} Expiration time or null if no cooldown
 */
async function getCooldown(userId, command) {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT expires_at FROM cooldowns WHERE user_id = $1 AND command = $2 AND expires_at > NOW()',
      [userId, command]
    );
    
    if (result.rows.length > 0) {
      return new Date(result.rows[0].expires_at);
    }
    return null;
  } catch (error) {
    logger.error(`Failed to get cooldown: ${error.message}`);
    return null;
  }
}

/**
 * Set cooldown for a command
 * @param {string} userId - User ID
 * @param {string} command - Command name
 * @param {number} durationMs - Cooldown duration in milliseconds
 * @returns {Promise<boolean>}
 */
async function setCooldown(userId, command, durationMs) {
  if (!pool) return false;

  try {
    const expiresAt = new Date(Date.now() + durationMs);
    
    await pool.query(`
      INSERT INTO cooldowns (user_id, command, expires_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, command)
      DO UPDATE SET expires_at = $3, created_at = CURRENT_TIMESTAMP
    `, [userId, command, expiresAt]);
    
    return true;
  } catch (error) {
    logger.error(`Failed to set cooldown: ${error.message}`);
    return false;
  }
}

/**
 * Clear expired cooldowns
 * @returns {Promise<number>} Number of rows deleted
 */
async function clearExpiredCooldowns() {
  if (!pool) return 0;

  try {
    const result = await pool.query(
      'DELETE FROM cooldowns WHERE expires_at < NOW()'
    );
    return result.rowCount;
  } catch (error) {
    logger.error(`Failed to clear cooldowns: ${error.message}`);
    return 0;
  }
}

/**
 * Get voice settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>}
 */
async function getVoiceSettings(guildId) {
  if (!pool) return null;

  try {
    const result = await pool.query(
      'SELECT * FROM voice_settings WHERE guild_id = $1',
      [guildId]
    );
    
    if (result.rows.length > 0) {
      return {
        channelId: result.rows[0].channel_id,
        enabled: result.rows[0].enabled,
        selfMute: result.rows[0].self_mute,
        selfDeaf: result.rows[0].self_deaf,
      };
    }
    return null;
  } catch (error) {
    logger.error(`Failed to get voice settings: ${error.message}`);
    return null;
  }
}

/**
 * Set voice settings for a guild
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Voice channel ID
 * @param {boolean} enabled - Whether auto-join is enabled
 * @param {boolean} selfMute - Self mute setting
 * @param {boolean} selfDeaf - Self deaf setting
 * @returns {Promise<boolean>}
 */
async function setVoiceSettings(guildId, channelId, enabled = true, selfMute = true, selfDeaf = true) {
  if (!pool) return false;

  try {
    await pool.query(`
      INSERT INTO voice_settings (guild_id, channel_id, enabled, self_mute, self_deaf, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (guild_id)
      DO UPDATE SET channel_id = $2, enabled = $3, self_mute = $4, self_deaf = $5, updated_at = CURRENT_TIMESTAMP
    `, [guildId, channelId, enabled, selfMute, selfDeaf]);
    
    return true;
  } catch (error) {
    logger.error(`Failed to set voice settings: ${error.message}`);
    return false;
  }
}

/**
 * Delete voice settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<boolean>}
 */
async function deleteVoiceSettings(guildId) {
  if (!pool) return false;

  try {
    await pool.query(
      'DELETE FROM voice_settings WHERE guild_id = $1',
      [guildId]
    );
    return true;
  } catch (error) {
    logger.error(`Failed to delete voice settings: ${error.message}`);
    return false;
  }
}

/**
 * Get all enabled voice settings
 * @returns {Promise<Array>}
 */
async function getAllEnabledVoiceSettings() {
  if (!pool) return [];

  try {
    const result = await pool.query(
      'SELECT * FROM voice_settings WHERE enabled = true'
    );
    
    return result.rows.map(row => ({
      guildId: row.guild_id,
      channelId: row.channel_id,
      selfMute: row.self_mute,
      selfDeaf: row.self_deaf,
    }));
  } catch (error) {
    logger.error(`Failed to get voice settings: ${error.message}`);
    return [];
  }
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  isConnected,
  getSetting,
  setSetting,
  getCooldown,
  setCooldown,
  clearExpiredCooldowns,
  getVoiceSettings,
  setVoiceSettings,
  deleteVoiceSettings,
  getAllEnabledVoiceSettings,
  closeDatabase,
};
