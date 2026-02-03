/**
 * Event Handler
 * Handles automatic event detection and response (catching events)
 */

const { BaseManager } = require('./BaseManager');
const { EPIC_RPG_BOT_ID, EVENTS } = require('../config');

class EventHandler extends BaseManager {
  constructor(client) {
    super(client, 'Event');
  }

  /**
   * Handle incoming message for event detection
   */
  async handleMessage(message) {
    if (!this.enabled) return;
    if (message.author.id !== EPIC_RPG_BOT_ID) return;

    // Handle "thinking" messages
    if (message.flags?.has('LOADING')) {
      this.logger.debug('Bot thinking, waiting for content...');

      // Use BaseManager's registerPendingMessage for proper cleanup
      const resolver = this.registerPendingMessage(
        message.id,
        message,
        (newMsg) => {
          this.logger.debug('Bot finished thinking, checking for events');
          this.processEventDetection(newMsg);
        },
        900000 // 15 minutes timeout
      );

      // Set up the event listener
      const onUpdate = (oldMsg, newMsg) => {
        if (oldMsg.id === message.id) {
          resolver(newMsg);
        }
      };

      message.client.on('messageUpdate', onUpdate);

      // Clean up listener when resolved
      const originalCleanup = this.pendingMessages.get(message.id)?.cleanup;
      this.pendingMessages.get(message.id).cleanup = () => {
        message.client.off('messageUpdate', onUpdate);
        originalCleanup?.();
      };

      return;
    }

    this.processEventDetection(message);
  }

  /**
   * Process message for event detection
   */
  async processEventDetection(message) {
    if (!message.embeds?.length) return;

    for (const embed of message.embeds) {
      for (const [eventName, eventConfig] of Object.entries(EVENTS)) {
        const detectedEvent = this.detectEvent(embed, eventConfig);

        if (detectedEvent) {
          this.logger.success(`${eventName} detected! Auto-responding...`);
          await this.respondToEvent(message, detectedEvent, eventName);
          return; // Only respond to first detected event
        }
      }
    }
  }

  /**
   * Detect if embed matches an event pattern
   */
  detectEvent(embed, eventConfig) {
    // Handle events with multiple patterns
    if (eventConfig.PATTERNS) {
      for (const pattern of eventConfig.PATTERNS) {
        if (this.matchesPattern(embed, pattern)) {
          return pattern;
        }
      }
      return null;
    }

    // Handle single pattern events
    if (this.matchesPattern(embed, eventConfig)) {
      return eventConfig;
    }

    return null;
  }

  /**
   * Check if embed matches a pattern
   */
  matchesPattern(embed, pattern) {
    // Check description
    if (pattern.DESCRIPTION && !embed.description?.includes(pattern.DESCRIPTION)) {
      return false;
    }

    // Check author
    if (pattern.AUTHOR && !embed.author?.name?.includes(pattern.AUTHOR)) {
      return false;
    }

    // Check fields
    if (pattern.FIELD_NAME || pattern.FIELD_VALUE) {
      if (!embed.fields?.length) return false;

      const fieldMatches = embed.fields.some(field => {
        const nameMatches = !pattern.FIELD_NAME || field.name?.includes(pattern.FIELD_NAME);
        const valueMatches = !pattern.FIELD_VALUE || field.value?.includes(pattern.FIELD_VALUE);
        return nameMatches && valueMatches;
      });

      if (!fieldMatches) return false;
    }

    return true;
  }

  /**
   * Respond to detected event
   */
  async respondToEvent(message, event, eventName) {
    // Small delay before responding
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      // Try button click first
      if (event.BUTTON_ID && message.components?.length) {
        await message.clickButton(event.BUTTON_ID);
        this.logger.success(`${eventName}: Button clicked (${event.BUTTON_ID})`);
        return;
      }

      // Try to find appropriate button
      if (message.components?.length) {
        const buttonId = this.findEventButton(message, event.RESPONSE);
        if (buttonId) {
          await message.clickButton(buttonId);
          this.logger.success(`${eventName}: Button clicked (${buttonId})`);
          return;
        }
      }

      // Fall back to typing response
      await message.channel.send(event.RESPONSE);
      this.logger.success(`${eventName}: Response typed (${event.RESPONSE})`);

    } catch (error) {
      this.logger.error(`${eventName} response failed: ${error.message}`);

      // Fallback: try typing response
      try {
        await message.channel.send(event.RESPONSE);
        this.logger.success(`${eventName}: Fallback response typed`);
      } catch (fallbackError) {
        this.logger.error(`${eventName} fallback failed: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Find button for event response
   */
  findEventButton(message, response) {
    const responsePattern = response.toLowerCase();
    const buttonPatterns = ['catch', 'lure', 'join', 'fight', 'summon', 'legendaryboss', 'arena', 'miniboss'];

    for (const row of message.components) {
      for (const comp of row.components || []) {
        // Check by label
        if (comp.label === response) {
          return comp.customId;
        }

        // Check by custom ID patterns
        if (comp.customId) {
          if (comp.customId.includes(responsePattern) ||
              buttonPatterns.some(p => comp.customId.includes(p))) {
            return comp.customId;
          }
        }
      }
    }

    return null;
  }
}

module.exports = { EventHandler };
