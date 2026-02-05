"""
Event Handler
Handles automatic event detection and response (catching events)
"""

import asyncio
from typing import Any, Dict, Optional

from managers.base_manager import BaseManager
from bot.config import config

# Epic RPG Bot ID
EPIC_RPG_BOT_ID = "555955826880413696"

# Event configuration
EVENTS = {
    "EPIC_COIN": {
        "FIELD_NAME": "God accidentally dropped an EPIC coin",
        "FIELD_VALUE": "I wonder who will be the lucky player to get it??",
        "RESPONSE": "CATCH",
    },
    "COIN_RAIN": {
        "FIELD_NAME": "IT'S RAINING COINS",
        "FIELD_VALUE": "Type **CATCH**",
        "RESPONSE": "CATCH",
    },
    "EPIC_TREE": {
        "FIELD_NAME": "AN EPIC TREE HAS JUST GROWN",
        "FIELD_VALUE": "Type **CUT**",
        "RESPONSE": "CUT",
        "BUTTON_ID": "epictree_join",
    },
    "MEGALODON": {
        "FIELD_NAME": "A MEGALODON HAS SPAWNED",
        "FIELD_VALUE": "Type **LURE**",
        "RESPONSE": "LURE",
    },
    "ARENA": {
        "PATTERNS": [
            {
                "FIELD_NAME": "Type `join` to join the arena!",
                "FIELD_VALUE": "arena cookies",
                "RESPONSE": "JOIN",
            },
            {
                "DESCRIPTION": "started an arena event!",
                "FIELD_NAME": "join the arena",
                "FIELD_VALUE": "arena cookies",
                "RESPONSE": "JOIN",
                "BUTTON_ID": "arena_join",
            },
        ],
    },
    "MINIBOSS": {
        "PATTERNS": [
            {
                "FIELD_NAME": "Type `fight` to help and get a reward!",
                "FIELD_VALUE": "CHANCE TO WIN",
                "RESPONSE": "FIGHT",
            },
            {
                "DESCRIPTION": "Help",
                "AUTHOR": "miniboss",
                "FIELD_NAME": "help and boost!",
                "FIELD_VALUE": "CHANCE TO WIN",
                "RESPONSE": "JOIN",
                "BUTTON_ID": "miniboss_join",
            },
        ],
    },
    "LOOTBOX_SUMMONING": {
        "FIELD_NAME": "A LOOTBOX SUMMONING HAS STARTED",
        "FIELD_VALUE": "Type **SUMMON**",
        "RESPONSE": "SUMMON",
        "BUTTON_ID": "lootboxsummoning_join",
    },
    "LEGENDARY_BOSS": {
        "FIELD_NAME": "A LEGENDARY BOSS JUST SPAWNED",
        "FIELD_VALUE": "Type **TIME TO FIGHT**",
        "RESPONSE": "TIME TO FIGHT",
        "BUTTON_ID": "legendaryboss_join",
    },
}


class EventHandler(BaseManager):
    """Handles automatic event detection and response."""

    def __init__(self, client: Any):
        super().__init__(client, "Event")
        self._cooldowns: Dict[str, float] = {}
        self._auto_join: bool = True

    @property
    def auto_join(self) -> bool:
        """Get auto-join status."""
        return self._auto_join

    def set_auto_join(self, enabled: bool) -> None:
        """Enable/disable auto-join for events."""
        self._auto_join = enabled
        self.logger.info(f"Auto-join {'enabled' if enabled else 'disabled'}")

    def is_event_message(self, message: Any) -> bool:
        """
        Check if a message is an event message from EPIC RPG bot.

        Args:
            message: Discord message object

        Returns:
            True if message is an event message
        """
        if not message or not message.author:
            return False

        if str(message.author.id) != EPIC_RPG_BOT_ID:
            return False

        if not message.embeds:
            return False

        for embed in message.embeds:
            for event_name, event_config in EVENTS.items():
                if self._detect_event(embed, event_config):
                    return True

        return False

    async def handle_message(self, message: Any) -> None:
        """
        Handle incoming message for event detection.

        Args:
            message: Discord message object
        """
        if not self.enabled:
            return

        if not message or not message.author:
            return

        if str(message.author.id) != EPIC_RPG_BOT_ID:
            return

        # Handle "thinking" messages (deferral in discord.py)
        if message.flags and message.flags.ephemeral:
            self.logger.debug("Bot thinking, waiting for content...")

            # Use BaseManager's registerPendingMessage for proper cleanup
            resolver = self.register_pending_message(
                str(message.id),
                message,
                lambda new_msg: self._on_thinking_resolved(new_msg),
                900000,  # 15 minutes timeout
            )

            # Set up the event listener for message updates
            async def on_update(old_msg, new_msg):
                if str(old_msg.id) == str(message.id):
                    resolver(new_msg)

            self.client.add_listener(on_update, "on_message_edit")

            # Clean up listener when resolved
            entry = self.pending_messages.get(str(message.id))
            if entry:
                original_cleanup = entry.get("cleanup")

                def cleanup_wrapper():
                    self.client.remove_listener(on_update, "on_message_edit")
                    if original_cleanup:
                        original_cleanup()

                entry["cleanup"] = cleanup_wrapper

            return

        await self._process_event_detection(message)

    def _on_thinking_resolved(self, new_msg: Any) -> None:
        """Callback when a thinking message is resolved."""
        self.logger.debug("Bot finished thinking, checking for events")
        asyncio.create_task(self._process_event_detection(new_msg))

    async def _process_event_detection(self, message: Any) -> None:
        """
        Process message for event detection.

        Args:
            message: Discord message object
        """
        if not message.embeds:
            return

        for embed in message.embeds:
            for event_name, event_config in EVENTS.items():
                detected_event = self._detect_event(embed, event_config)

                if detected_event:
                    self.logger.success(f"{event_name} detected! Auto-responding...")
                    await self.join_event(message, detected_event, event_name)
                    return  # Only respond to first detected event

    def _detect_event(self, embed: Any, event_config: Dict) -> Optional[Dict]:
        """
        Detect if embed matches an event pattern.

        Args:
            embed: Discord embed object
            event_config: Event configuration dict

        Returns:
            Matched pattern dict or None
        """
        # Handle events with multiple patterns
        if "PATTERNS" in event_config:
            for pattern in event_config["PATTERNS"]:
                if self._matches_pattern(embed, pattern):
                    return pattern
            return None

        # Handle single pattern events
        if self._matches_pattern(embed, event_config):
            return event_config

        return None

    def _matches_pattern(self, embed: Any, pattern: Dict) -> bool:
        """
        Check if embed matches a pattern.

        Args:
            embed: Discord embed object
            pattern: Pattern dict to match against

        Returns:
            True if embed matches pattern
        """
        # Check description
        if pattern.get("DESCRIPTION"):
            description = getattr(embed, "description", "") or ""
            if pattern["DESCRIPTION"] not in description:
                return False

        # Check author
        if pattern.get("AUTHOR"):
            author = getattr(embed, "author", None)
            author_name = getattr(author, "name", "") or "" if author else ""
            if pattern["AUTHOR"] not in author_name:
                return False

        # Check fields
        if pattern.get("FIELD_NAME") or pattern.get("FIELD_VALUE"):
            fields = getattr(embed, "fields", []) or []
            if not fields:
                return False

            field_matches = False
            for field in fields:
                field_name = getattr(field, "name", "") or ""
                field_value = getattr(field, "value", "") or ""

                name_matches = not pattern.get("FIELD_NAME") or pattern["FIELD_NAME"] in field_name
                value_matches = not pattern.get("FIELD_VALUE") or pattern["FIELD_VALUE"] in field_value

                if name_matches and value_matches:
                    field_matches = True
                    break

            if not field_matches:
                return False

        return True

    async def join_event(
        self,
        message: Any,
        event: Dict,
        event_name: str
    ) -> bool:
        """
        Respond to a detected event by clicking button or sending message.

        Args:
            message: Discord message object
            event: Event pattern dict
            event_name: Name of the event

        Returns:
            True if successfully joined event
        """
        if not self._auto_join:
            self.logger.debug(f"Auto-join disabled, skipping {event_name}")
            return False

        # Check cooldown
        if self._is_on_cooldown(event_name):
            self.logger.debug(f"{event_name} is on cooldown")
            return False

        # Small delay before responding
        await asyncio.sleep(1)

        try:
            # Try button click first
            button_id = event.get("BUTTON_ID")
            if button_id and message.components:
                clicked = await self._click_button(message, button_id)
                if clicked:
                    self.logger.success(f"{event_name}: Button clicked ({button_id})")
                    self._set_cooldown(event_name)
                    return True

            # Try to find appropriate button
            if message.components:
                response = event.get("RESPONSE", "")
                found_button_id = self._find_event_button(message, response)
                if found_button_id:
                    clicked = await self._click_button(message, found_button_id)
                    if clicked:
                        self.logger.success(f"{event_name}: Button clicked ({found_button_id})")
                        self._set_cooldown(event_name)
                        return True

            # Fall back to typing response
            response_text = event.get("RESPONSE", "")
            await message.channel.send(response_text)
            self.logger.success(f"{event_name}: Response typed ({response_text})")
            self._set_cooldown(event_name)
            return True

        except Exception as e:
            self.logger.error(f"{event_name} response failed: {e}")

            # Fallback: try typing response
            try:
                response_text = event.get("RESPONSE", "")
                await message.channel.send(response_text)
                self.logger.success(f"{event_name}: Fallback response typed")
                self._set_cooldown(event_name)
                return True
            except Exception as fallback_error:
                self.logger.error(f"{event_name} fallback failed: {fallback_error}")
                return False

    async def _click_button(self, message: Any, button_id: str) -> bool:
        """
        Click a button on a message.

        Args:
            message: Discord message object
            button_id: Custom ID of the button

        Returns:
            True if button was clicked
        """
        if not message.components:
            return False

        for row in message.components:
            components = getattr(row, "children", []) or getattr(row, "components", [])
            for component in components:
                comp_id = getattr(component, "custom_id", "")
                if comp_id == button_id:
                    try:
                        await component.click()
                        return True
                    except Exception:
                        return False
        return False

    def _find_event_button(self, message: Any, response: str) -> Optional[str]:
        """
        Find button for event response.

        Args:
            message: Discord message object
            response: Expected response text

        Returns:
            Button custom ID or None
        """
        if not message.components:
            return None

        response_pattern = response.lower()
        button_patterns = [
            "catch", "lure", "join", "fight",
            "summon", "legendaryboss", "arena", "miniboss"
        ]

        for row in message.components:
            components = getattr(row, "children", []) or getattr(row, "components", [])
            for component in components:
                label = getattr(component, "label", "") or ""
                custom_id = getattr(component, "custom_id", "") or ""

                # Check by label
                if label == response:
                    return custom_id

                # Check by custom ID patterns
                if custom_id:
                    if response_pattern in custom_id.lower():
                        return custom_id
                    if any(p in custom_id.lower() for p in button_patterns):
                        return custom_id

        return None

    def _is_on_cooldown(self, event_name: str) -> bool:
        """
        Check if an event is on cooldown.

        Args:
            event_name: Name of the event

        Returns:
            True if event is on cooldown
        """
        import time
        if event_name not in self._cooldowns:
            return False

        # Events have a 30-second cooldown
        cooldown_time = 30
        elapsed = time.time() - self._cooldowns[event_name]
        return elapsed < cooldown_time

    def _set_cooldown(self, event_name: str) -> None:
        """
        Set cooldown for an event.

        Args:
            event_name: Name of the event
        """
        import time
        self._cooldowns[event_name] = time.time()

    def get_cooldowns(self) -> Dict[str, float]:
        """
        Get current event cooldowns.

        Returns:
            Dict of event names to cooldown timestamps
        """
        return self._cooldowns.copy()

    def clear_cooldown(self, event_name: str) -> None:
        """
        Clear cooldown for a specific event.

        Args:
            event_name: Name of the event
        """
        self._cooldowns.pop(event_name, None)
