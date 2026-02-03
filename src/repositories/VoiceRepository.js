/**
 * Voice Repository
 * Handles voice settings database operations
 */

const { BaseRepository } = require('./BaseRepository');

/**
 * Repository for voice_settings table
 */
class VoiceRepository extends BaseRepository {
  /**
   * Create VoiceRepository instance
   * @param {Object} pool - PostgreSQL pool
   */
  constructor(pool) {
    super(pool, 'voice_settings', 'guild_id');
  }

  /**
   * Get voice settings by guild ID
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object|null>} Voice settings or null
   */
  async getByGuildId(guildId) {
    const row = await this.findById(guildId);
    return this.formatSettings(row);
  }

  /**
   * Save voice settings for a guild
   * @param {string} guildId - Guild ID
   * @param {string} channelId - Voice channel ID
   * @param {boolean} enabled - Auto-join enabled
   * @param {boolean} selfMute - Self mute
   * @param {boolean} selfDeaf - Self deaf
   * @returns {Promise<Object|null>} Saved settings
   */
  async saveSettings(guildId, channelId, enabled = true, selfMute = true, selfDeaf = true) {
    const data = {
      guildId,
      channelId,
      enabled,
      selfMute,
      selfDeaf,
    };

    const row = await this.upsert(data, ['guildId']);
    return this.formatSettings(row);
  }

  /**
   * Delete voice settings for a guild
   * @param {string} guildId - Guild ID
   * @returns {Promise<boolean>}
   */
  async deleteByGuildId(guildId) {
    return this.delete(guildId);
  }

  /**
   * Get all enabled voice settings
   * @returns {Promise<Array>} Array of voice settings
   */
  async getAllEnabled() {
    const rows = await this.findWhere({ enabled: true });
    return rows.map(row => this.formatSettings(row));
  }

  /**
   * Enable/disable voice auto-join for a guild
   * @param {string} guildId - Guild ID
   * @param {boolean} enabled - Enabled state
   * @returns {Promise<Object|null>} Updated settings
   */
  async setEnabled(guildId, enabled) {
    const row = await this.update(guildId, { enabled });
    return this.formatSettings(row);
  }

  /**
   * Format database row to consistent object
   * @param {Object} row - Database row
   * @returns {Object|null}
   */
  formatSettings(row) {
    if (!row) return null;

    return {
      guildId: row.guild_id,
      channelId: row.channel_id,
      enabled: row.enabled,
      selfMute: row.self_mute,
      selfDeaf: row.self_deaf,
      updatedAt: row.updated_at,
    };
  }
}

module.exports = { VoiceRepository };
