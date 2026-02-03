/**
 * Database Configuration
 * Centralized database connection and repository management
 */

const { Pool } = require('pg');
const { Logger } = require('../utils/logger');
const { RepositoryFactory } = require('../repositories');

const logger = Logger.create('Database');

// Database pool instance
let pool = null;
let repositoryFactory = null;

/**
 * Initialize database connection and repositories
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
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
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

    // Initialize repository factory
    repositoryFactory = new RepositoryFactory(pool);

    return true;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    pool = null;
    repositoryFactory = null;
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
 * Get the PostgreSQL pool instance
 * @returns {Object|null}
 */
function getPool() {
  return pool;
}

/**
 * Get repository factory
 * @returns {RepositoryFactory|null}
 */
function getRepositories() {
  return repositoryFactory;
}

/**
 * Get a specific repository
 * @param {string} name - Repository name
 * @returns {Object|null}
 */
function getRepository(name) {
  return repositoryFactory?.get(name) || null;
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    repositoryFactory = null;
    logger.info('Database connection closed');
  }
}

// Legacy compatibility exports - delegates to repositories
/**
 * @deprecated Use repositories.settings.get() instead
 */
async function getSetting(key, defaultValue = null) {
  return repositoryFactory?.settings?.get(key, defaultValue) ?? defaultValue;
}

/**
 * @deprecated Use repositories.settings.set() instead
 */
async function setSetting(key, value) {
  return repositoryFactory?.settings?.set(key, value) ?? false;
}

/**
 * @deprecated Use repositories.cooldowns.getCooldown() instead
 */
async function getCooldown(userId, command) {
  return repositoryFactory?.cooldowns?.getCooldown(userId, command) ?? null;
}

/**
 * @deprecated Use repositories.cooldowns.setCooldown() instead
 */
async function setCooldown(userId, command, durationMs) {
  return repositoryFactory?.cooldowns?.setCooldown(userId, command, durationMs) ?? false;
}

/**
 * @deprecated Use repositories.cooldowns.clearExpired() instead
 */
async function clearExpiredCooldowns() {
  return repositoryFactory?.cooldowns?.clearExpired() ?? 0;
}

/**
 * @deprecated Use repositories.voice.getByGuildId() instead
 */
async function getVoiceSettings(guildId) {
  return repositoryFactory?.voice?.getByGuildId(guildId) ?? null;
}

/**
 * @deprecated Use repositories.voice.saveSettings() instead
 */
async function setVoiceSettings(guildId, channelId, enabled = true, selfMute = true, selfDeaf = true) {
  const result = await repositoryFactory?.voice?.saveSettings(guildId, channelId, enabled, selfMute, selfDeaf);
  return result !== null;
}

/**
 * @deprecated Use repositories.voice.deleteByGuildId() instead
 */
async function deleteVoiceSettings(guildId) {
  return repositoryFactory?.voice?.deleteByGuildId(guildId) ?? false;
}

/**
 * @deprecated Use repositories.voice.getAllEnabled() instead
 */
async function getAllEnabledVoiceSettings() {
  return repositoryFactory?.voice?.getAllEnabled() ?? [];
}

module.exports = {
  // New repository-based exports
  initDatabase,
  isConnected,
  getPool,
  getRepositories,
  getRepository,
  closeDatabase,

  // Legacy compatibility exports
  getSetting,
  setSetting,
  getCooldown,
  setCooldown,
  clearExpiredCooldowns,
  getVoiceSettings,
  setVoiceSettings,
  deleteVoiceSettings,
  getAllEnabledVoiceSettings,
};
