/**
 * Cooldown Repository
 * Handles command cooldown tracking
 */

const { BaseRepository } = require('./BaseRepository');

/**
 * Repository for cooldowns table
 */
class CooldownRepository extends BaseRepository {
  /**
   * Create CooldownRepository instance
   * @param {Object} pool - PostgreSQL pool
   */
  constructor(pool) {
    super(pool, 'cooldowns', 'id');
  }

  /**
   * Get active cooldown for user and command
   * @param {string} userId - User ID
   * @param {string} command - Command name
   * @returns {Promise<Date|null>} Expiration time or null
   */
  async getCooldown(userId, command) {
    const rows = await this.findWhere(
      { userId, command },
      { orderBy: 'expires_at', order: 'DESC', limit: 1 }
    );

    if (rows.length === 0) {
      return null;
    }

    const expiresAt = new Date(rows[0].expires_at);

    // Check if expired
    if (expiresAt <= new Date()) {
      return null;
    }

    return expiresAt;
  }

  /**
   * Set cooldown for user and command
   * @param {string} userId - User ID
   * @param {string} command - Command name
   * @param {number} durationMs - Duration in milliseconds
   * @returns {Promise<boolean>}
   */
  async setCooldown(userId, command, durationMs) {
    const expiresAt = new Date(Date.now() + durationMs);

    try {
      await this.query(
        `
          INSERT INTO ${this.tableName} (user_id, command, expires_at, created_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, command)
          DO UPDATE SET expires_at = $3, created_at = CURRENT_TIMESTAMP
        `,
        [userId, command, expiresAt]
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to set cooldown: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if user is on cooldown
   * @param {string} userId - User ID
   * @param {string} command - Command name
   * @returns {Promise<boolean>}
   */
  async isOnCooldown(userId, command) {
    const expiresAt = await this.getCooldown(userId, command);
    return expiresAt !== null;
  }

  /**
   * Get remaining cooldown time in milliseconds
   * @param {string} userId - User ID
   * @param {string} command - Command name
   * @returns {Promise<number>} Remaining ms (0 if not on cooldown)
   */
  async getRemainingTime(userId, command) {
    const expiresAt = await this.getCooldown(userId, command);

    if (!expiresAt) {
      return 0;
    }

    const remaining = expiresAt.getTime() - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Clear cooldown for user and command
   * @param {string} userId - User ID
   * @param {string} command - Command name
   * @returns {Promise<boolean>}
   */
  async clearCooldown(userId, command) {
    const deleted = await this.deleteWhere({ userId, command });
    return deleted > 0;
  }

  /**
   * Clear all expired cooldowns
   * @returns {Promise<number>} Number of cleared cooldowns
   */
  async clearExpired() {
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE expires_at < NOW()`
    );

    return result?.rowCount || 0;
  }

  /**
   * Clear all cooldowns for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of cleared cooldowns
   */
  async clearUserCooldowns(userId) {
    return this.deleteWhere({ userId });
  }
}

module.exports = { CooldownRepository };
