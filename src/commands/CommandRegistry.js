/**
 * Command Registry
 * Centralized command registration and management
 */

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.categories = new Map();
  }

  /**
   * Register a command
   * @param {Object} config - Command configuration
   * @param {Function} handler - Command handler function
   */
  register(config, handler) {
    const command = {
      name: config.name,
      description: config.description || '',
      category: config.category || 'General',
      aliases: config.aliases || [],
      args: config.args || [],
      examples: config.examples || [],
      guildOnly: config.guildOnly || false,
      handler,
    };

    // Register main command
    this.commands.set(config.name, command);

    // Register aliases
    for (const alias of command.aliases) {
      this.aliases.set(alias, config.name);
    }

    // Add to category
    if (!this.categories.has(command.category)) {
      this.categories.set(command.category, []);
    }
    this.categories.get(command.category).push(command);

    return this;
  }

  /**
   * Get a command by name or alias
   * @param {string} name - Command name or alias
   * @returns {Object|null}
   */
  get(name) {
    const normalized = name.toLowerCase();

    // Check direct command
    if (this.commands.has(normalized)) {
      return this.commands.get(normalized);
    }

    // Check alias
    const aliasTarget = this.aliases.get(normalized);
    if (aliasTarget) {
      return this.commands.get(aliasTarget);
    }

    return null;
  }

  /**
   * Check if command exists
   * @param {string} name - Command name
   * @returns {boolean}
   */
  has(name) {
    return this.commands.has(name.toLowerCase()) || this.aliases.has(name.toLowerCase());
  }

  /**
   * Get all commands in a category
   * @param {string} category - Category name
   * @returns {Array}
   */
  getByCategory(category) {
    return this.categories.get(category) || [];
  }

  /**
   * Get all categories
   * @returns {Array}
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * Get all commands
   * @returns {Array}
   */
  getAll() {
    return Array.from(this.commands.values());
  }

  /**
   * Generate help text
   * @returns {string}
   */
  generateHelp() {
    const lines = [
      '📖 **Self Bot Commands**',
      '',
    ];

    for (const [category, commands] of this.categories) {
      const icon = this.getCategoryIcon(category);
      lines.push(`**${icon} ${category}:**`);

      for (const cmd of commands) {
        const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        lines.push(`• \`${cmd.name}\`${aliases} - ${cmd.description}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate detailed help for a specific command
   * @param {string} name - Command name
   * @returns {string|null}
   */
  generateCommandHelp(name) {
    const cmd = this.get(name);
    if (!cmd) return null;

    const lines = [
      `📖 **Command:** \`${cmd.name}\``,
      '',
      `**Description:** ${cmd.description}`,
    ];

    if (cmd.aliases.length > 0) {
      lines.push(`**Aliases:** ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`);
    }

    if (cmd.args.length > 0) {
      lines.push(`**Arguments:**`);
      for (const arg of cmd.args) {
        const required = arg.required ? '*' : '';
        lines.push(`  • \`${arg.name}\`${required} - ${arg.description}`);
      }
    }

    if (cmd.examples.length > 0) {
      lines.push(`**Examples:**`);
      for (const example of cmd.examples) {
        lines.push(`  • \`${example}\``);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get category icon
   * @param {string} category
   * @returns {string}
   */
  getCategoryIcon(category) {
    const icons = {
      'Farm': '🌾',
      'Events': '🎯',
      'Voice': '🎤',
      'Debug': '🔍',
      'Enchant': '✨',
      'General': '📋',
    };
    return icons[category] || '•';
  }
}

// Singleton instance
const registry = new CommandRegistry();

module.exports = { CommandRegistry, registry };
