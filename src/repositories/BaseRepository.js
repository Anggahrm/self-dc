/**
 * Base Repository
 * Generic repository pattern for database operations
 * Provides common CRUD operations and connection management
 */

const { Logger } = require('../utils/logger');

/**
 * Base repository class for database operations
 * @abstract
 */
class BaseRepository {
  /**
   * Create a new repository instance
   * @param {Object} pool - PostgreSQL pool instance
   * @param {string} tableName - Database table name
   * @param {string} primaryKey - Primary key column name
   */
  constructor(pool, tableName, primaryKey = 'id') {
    if (this.constructor === BaseRepository) {
      throw new Error('Cannot instantiate abstract BaseRepository directly');
    }

    this.pool = pool;
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.logger = Logger.create(`${this.constructor.name}`);
  }

  /**
   * Check if database is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.pool !== null;
  }

  /**
   * Execute a raw query with error handling
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Query result or null on error
   */
  async query(sql, params = []) {
    if (!this.isConnected()) {
      this.logger.warn('Database not connected, query skipped');
      return null;
    }

    try {
      const result = await this.pool.query(sql, params);
      return result;
    } catch (error) {
      this.logger.error(`Query failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a single record by primary key
   * @param {string|number} id - Primary key value
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );

    return result?.rows[0] || null;
  }

  /**
   * Find records by conditions
   * @param {Object} conditions - Key-value conditions
   * @param {Object} options - Query options (limit, offset, orderBy)
   * @returns {Promise<Array>}
   */
  async findWhere(conditions = {}, options = {}) {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);

    let sql = `SELECT * FROM ${this.tableName}`;

    if (keys.length > 0) {
      const whereClause = keys
        .map((key, index) => `${this.toSnakeCase(key)} = $${index + 1}`)
        .join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${this.toSnakeCase(options.orderBy)} ${options.order || 'ASC'}`;
    }

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await this.query(sql, values);
    return result?.rows || [];
  }

  /**
   * Find all records
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async findAll(options = {}) {
    return this.findWhere({}, options);
  }

  /**
   * Create a new record
   * @param {Object} data - Record data
   * @returns {Promise<Object|null>} Created record
   */
  async create(data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const columns = keys.map(k => this.toSnakeCase(k));

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.query(sql, values);
    return result?.rows[0] || null;
  }

  /**
   * Update a record by primary key
   * @param {string|number} id - Primary key value
   * @param {Object} data - Update data
   * @returns {Promise<Object|null>} Updated record
   */
  async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
      return null;
    }

    const setClause = keys
      .map((key, index) => `${this.toSnakeCase(key)} = $${index + 1}`)
      .join(', ');

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE ${this.primaryKey} = $${keys.length + 1}
      RETURNING *
    `;

    const result = await this.query(sql, [...values, id]);
    return result?.rows[0] || null;
  }

  /**
   * Upsert (insert or update) a record
   * @param {Object} data - Record data (must include primary key)
   * @param {Array} conflictColumns - Columns for conflict resolution
   * @returns {Promise<Object|null>} Upserted record
   */
  async upsert(data, conflictColumns) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const columns = keys.map(k => this.toSnakeCase(k));

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const updateColumns = keys
      .filter(k => !conflictColumns.includes(k))
      .map(k => `${this.toSnakeCase(k)} = EXCLUDED.${this.toSnakeCase(k)}`)
      .join(', ');

    const conflictFields = conflictColumns.map(c => this.toSnakeCase(c)).join(', ');

    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (${conflictFields})
      DO UPDATE SET ${updateColumns}, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await this.query(sql, values);
    return result?.rows[0] || null;
  }

  /**
   * Delete a record by primary key
   * @param {string|number} id - Primary key value
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    );

    return (result?.rowCount || 0) > 0;
  }

  /**
   * Delete records by conditions
   * @param {Object} conditions - Key-value conditions
   * @returns {Promise<number>} Number of deleted records
   */
  async deleteWhere(conditions) {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);

    if (keys.length === 0) {
      throw new Error('Delete conditions cannot be empty');
    }

    const whereClause = keys
      .map((key, index) => `${this.toSnakeCase(key)} = $${index + 1}`)
      .join(' AND ');

    const result = await this.query(
      `DELETE FROM ${this.tableName} WHERE ${whereClause}`,
      values
    );

    return result?.rowCount || 0;
  }

  /**
   * Count records
   * @param {Object} conditions - Optional filter conditions
   * @returns {Promise<number>}
   */
  async count(conditions = {}) {
    const keys = Object.keys(conditions);
    const values = Object.values(conditions);

    let sql = `SELECT COUNT(*) FROM ${this.tableName}`;

    if (keys.length > 0) {
      const whereClause = keys
        .map((key, index) => `${this.toSnakeCase(key)} = $${index + 1}`)
        .join(' AND ');
      sql += ` WHERE ${whereClause}`;
    }

    const result = await this.query(sql, values);
    return parseInt(result?.rows[0]?.count || '0', 10);
  }

  /**
   * Check if record exists
   * @param {Object} conditions - Filter conditions
   * @returns {Promise<boolean>}
   */
  async exists(conditions) {
    const count = await this.count(conditions);
    return count > 0;
  }

  /**
   * Execute within a transaction
   * @param {Function} callback - Async callback receiving client
   * @returns {Promise<any>}
   */
  async transaction(callback) {
    if (!this.isConnected()) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Transaction failed: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Convert camelCase to snake_case
   * @param {string} str - Input string
   * @returns {string}
   */
  toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase
   * @param {string} str - Input string
   * @returns {string}
   */
  toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Transform database row to camelCase object
   * @param {Object} row - Database row
   * @returns {Object}
   */
  rowToObject(row) {
    if (!row) return null;

    const result = {};
    for (const [key, value] of Object.entries(row)) {
      result[this.toCamelCase(key)] = value;
    }
    return result;
  }
}

module.exports = { BaseRepository };
