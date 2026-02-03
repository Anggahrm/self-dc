/**
 * Settings Repository
 * Handles application settings storage and retrieval
 */

const { BaseRepository } = require('./BaseRepository');

/**
 * Repository for settings table
 */
class SettingsRepository extends BaseRepository {
  /**
   * Create SettingsRepository instance
   * @param {Object} pool - PostgreSQL pool
   */
  constructor(pool) {
    super(pool, 'settings', 'key');
  }

  /**
   * Get a setting value by key
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>}
   */
  async get(key, defaultValue = null) {
    const row = await this.findById(key);

    if (!row) {
      return defaultValue;
    }

    try {
      return JSON.parse(row.value);
    } catch {
      // Value is not JSON, return as string
      return row.value;
    }
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {*} value - Value to store
   * @returns {Promise<boolean>}
   */
  async set(key, value) {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    const result = await this.query(
      `
        INSERT INTO ${this.tableName} (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `,
      [key, valueStr]
    );

    return result !== null;
  }

  /**
   * Delete a setting
   * @param {string} key - Setting key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    return super.delete(key);
  }

  /**
   * Get all settings as an object
   * @returns {Promise<Object>}
   */
  async getAll() {
    const rows = await this.findAll();
    const settings = {};

    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    return settings;
  }
}

module.exports = { SettingsRepository };
