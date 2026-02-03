/**
 * Repositories Index
 * Centralized repository exports and factory
 */

const { BaseRepository } = require('./BaseRepository');
const { VoiceRepository } = require('./VoiceRepository');
const { SettingsRepository } = require('./SettingsRepository');
const { CooldownRepository } = require('./CooldownRepository');

/**
 * Repository factory - creates all repositories with shared pool
 */
class RepositoryFactory {
  /**
   * Create repository factory
   * @param {Object} pool - PostgreSQL pool
   */
  constructor(pool) {
    this.pool = pool;
    this._repositories = new Map();
  }

  /**
   * Get or create repository instance
   * @param {string} name - Repository name
   * @returns {BaseRepository}
   */
  get(name) {
    if (!this._repositories.has(name)) {
      const RepositoryClass = this.getRepositoryClass(name);
      if (!RepositoryClass) {
        throw new Error(`Unknown repository: ${name}`);
      }
      this._repositories.set(name, new RepositoryClass(this.pool));
    }
    return this._repositories.get(name);
  }

  /**
   * Get repository class by name
   * @param {string} name - Repository name
   * @returns {Class|null}
   */
  getRepositoryClass(name) {
    const classes = {
      voice: VoiceRepository,
      settings: SettingsRepository,
      cooldowns: CooldownRepository,
    };
    return classes[name] || null;
  }

  /**
   * Get voice repository
   * @returns {VoiceRepository}
   */
  get voice() {
    return this.get('voice');
  }

  /**
   * Get settings repository
   * @returns {SettingsRepository}
   */
  get settings() {
    return this.get('settings');
  }

  /**
   * Get cooldowns repository
   * @returns {CooldownRepository}
   */
  get cooldowns() {
    return this.get('cooldowns');
  }

  /**
   * Check if database is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.pool !== null;
  }
}

module.exports = {
  BaseRepository,
  VoiceRepository,
  SettingsRepository,
  CooldownRepository,
  RepositoryFactory,
};
