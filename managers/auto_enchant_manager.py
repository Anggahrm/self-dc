"""
Auto Enchant Manager
Handles automatic enchanting until target enchant is achieved
Supports: enchant, refine, transmute, transcend
"""

import re
from typing import Any, Dict, List, Optional

from managers.base_manager import BaseManager
from utils.discord import DiscordUtils


# Epic RPG Bot ID
EPIC_RPG_BOT_ID = "555955826880413696"

# Enchant configuration
ENCHANT_CONFIG = {
    "TYPES": {
        "enchant": {"area": 1, "price_multiplier": 1},
        "refine": {"area": 7, "price_multiplier": 10},
        "transmute": {"area": 13, "price_multiplier": 100},
        "transcend": {"area": 15, "price_multiplier": 1000},
    },
    "TIERS": [
        {"name": "NORMIE", "bonus": 5, "time_travel": 0},
        {"name": "GOOD", "bonus": 15, "time_travel": 0},
        {"name": "GREAT", "bonus": 25, "time_travel": 0},
        {"name": "MEGA", "bonus": 40, "time_travel": 0},
        {"name": "EPIC", "bonus": 60, "time_travel": 0},
        {"name": "HYPER", "bonus": 70, "time_travel": 0},
        {"name": "ULTIMATE", "bonus": 80, "time_travel": 0},
        {"name": "PERFECT", "bonus": 90, "time_travel": 0},
        {"name": "EDGY", "bonus": 95, "time_travel": 0},
        {"name": "ULTRA-EDGY", "bonus": 100, "time_travel": 0},
        {"name": "OMEGA", "bonus": 125, "time_travel": 1},
        {"name": "ULTRA-OMEGA", "bonus": 150, "time_travel": 3},
        {"name": "GODLY", "bonus": 200, "time_travel": 5},
        {"name": "VOID", "bonus": 300, "time_travel": 15},
        {"name": "ETERNAL", "bonus": 305, "time_travel": 150},
    ],
    "EQUIPMENT": ["sword", "armor"],
    "RETRY_DELAY": 1000,
    "RESPONSE_TIMEOUT": 15000,
    "BUTTON_ID": "enchant_again",
}

# Pre-process tier names for efficient lookup
TIER_LOOKUP: Dict[str, Dict[str, Any]] = {}
TIER_NAMES_UPPER: List[str] = []
for index, tier in enumerate(ENCHANT_CONFIG["TIERS"]):
    normalized_name = tier["name"].lower().replace("-", "").replace("_", "").replace(" ", "")
    TIER_LOOKUP[normalized_name] = {**tier, "index": index}
    TIER_NAMES_UPPER.append(tier["name"])

# Regex pattern for parsing enchant result from bot response
ENCHANT_RESULT_PATTERN = re.compile(r"~-~>\s*\*{0,2}(\w+(?:-\w+)?)\*{0,2}\s*<~-~", re.IGNORECASE)


class AutoEnchantManager(BaseManager):
    """Manager for auto enchanting items."""

    def __init__(self, client: Any):
        super().__init__(client, "Enchant")

        # Active enchant sessions per channel
        self.sessions: Dict[str, Dict[str, Any]] = {}

    async def start_enchant(self, channel: Any, enchant_type: str, equipment: str, target_enchant: str) -> None:
        """
        Start auto enchant session.

        Args:
            channel: Discord channel
            enchant_type: enchant/refine/transmute/transcend
            equipment: sword/armor
            target_enchant: Target enchant tier name
        """
        session_key = str(channel.id)

        # Check if session already active
        if session_key in self.sessions:
            await DiscordUtils.safe_send(
                channel,
                "⚠️ Auto enchant already running in this channel. Use `.off enchant` to stop."
            )
            return

        # Validate type
        if enchant_type not in ENCHANT_CONFIG["TYPES"]:
            valid_types = ", ".join(ENCHANT_CONFIG["TYPES"].keys())
            await DiscordUtils.safe_send(channel, f"❌ Invalid type: {enchant_type}. Valid types: {valid_types}")
            return

        # Validate equipment
        if equipment not in ENCHANT_CONFIG["EQUIPMENT"]:
            valid_equipment = ", ".join(ENCHANT_CONFIG["EQUIPMENT"])
            await DiscordUtils.safe_send(channel, f"❌ Invalid equipment: {equipment}. Valid options: {valid_equipment}")
            return

        # Validate target enchant
        target_tier = self._find_tier(target_enchant)
        if not target_tier:
            valid_tiers = ", ".join(t["name"].lower() for t in ENCHANT_CONFIG["TIERS"])
            await DiscordUtils.safe_send(channel, f"❌ Invalid enchant: {target_enchant}. Valid enchants: {valid_tiers}")
            return

        # Create session
        session = {
            "channel": channel,
            "type": enchant_type,
            "equipment": equipment,
            "target_tier": target_tier,
            "target_enchant": target_enchant.upper(),
            "running": True,
            "attempts": 0,
            "start_time": __import__("time").time(),
        }

        self.sessions[session_key] = session

        self.logger.success(f"Auto {enchant_type} started for {equipment} targeting {target_enchant.upper()}")

        await DiscordUtils.safe_send(channel, "\n".join([
            f"✨ **Auto {enchant_type.capitalize()} Started**",
            "",
            f"🎯 **Target:** {target_enchant.upper()} (+{target_tier['bonus']}% {'AT' if equipment == 'sword' else 'DEF'})",
            f"⚔️ **Equipment:** {equipment}",
            f"🔮 **Type:** {enchant_type}",
            "",
            "Use `.off enchant` to stop",
        ]))

        # Start enchanting loop
        await self._run_enchant_loop(session, session_key)

    async def stop_enchant(self, channel: Any) -> None:
        """
        Stop auto enchant session.

        Args:
            channel: Discord channel
        """
        session_key = str(channel.id)
        session = self.sessions.get(session_key)

        if not session:
            await DiscordUtils.safe_send(channel, "⚠️ No auto enchant session running in this channel.")
            return

        session["running"] = False
        self.sessions.pop(session_key, None)

        duration = round((__import__("time").time() - session["start_time"]))

        self.logger.info(f"Auto {session['type']} stopped after {session['attempts']} attempts ({duration}s)")

        await DiscordUtils.safe_send(channel, "\n".join([
            f"🛑 **Auto {session['type'].capitalize()} Stopped**",
            "",
            "📊 **Stats:**",
            f"• Attempts: {session['attempts']}",
            f"• Duration: {self._format_duration(duration)}",
            f"• Target: {session['target_enchant']} (not reached)",
        ]))

    async def _run_enchant_loop(self, session: Dict[str, Any], session_key: str) -> None:
        """
        Main enchant loop.
        Uses slash command only for the first attempt, then uses "ENCHANT AGAIN" button for subsequent attempts.

        Args:
            session: Enchant session data
            session_key: Session key (channel ID)
        """
        # Store the last response message to use for button clicks
        last_response = None

        while session["running"] and session_key in self.sessions:
            try:
                session["attempts"] += 1

                self.logger.info(f"[COMMAND] {session['type']} - Attempt #{session['attempts']} for {session['equipment']}")

                response = None

                # First attempt: use slash command
                # Subsequent attempts: use "ENCHANT AGAIN" button if available
                if session["attempts"] == 1 or not last_response or not self._has_enchant_again_button(last_response):
                    # Send slash command
                    self.logger.debug("Using slash command")
                    response = await DiscordUtils.send_slash_and_wait(
                        session["channel"],
                        EPIC_RPG_BOT_ID,
                        session["type"],
                        {"item": session["equipment"]},
                        ENCHANT_CONFIG["RESPONSE_TIMEOUT"]
                    )
                else:
                    # Click "ENCHANT AGAIN" button
                    self.logger.debug("Using ENCHANT AGAIN button")
                    response = await DiscordUtils.click_button_and_wait(
                        last_response,
                        ENCHANT_CONFIG["BUTTON_ID"],
                        EPIC_RPG_BOT_ID,
                        ENCHANT_CONFIG["RESPONSE_TIMEOUT"]
                    )

                if not response:
                    self.logger.warning("No response from bot, retrying with slash command...")
                    last_response = None  # Reset to use slash command next time
                    await DiscordUtils.sleep(ENCHANT_CONFIG["RETRY_DELAY"])
                    continue

                # Store response for next button click
                last_response = response

                # Check for EPIC Guard
                if DiscordUtils.check_for_epic_guard(response):
                    self.logger.error("EPIC GUARD DETECTED! Stopping auto enchant for safety")
                    await DiscordUtils.safe_send(
                        session["channel"],
                        "⚠️ **EPIC GUARD DETECTED!** Auto enchant stopped for safety."
                    )
                    session["running"] = False
                    self.sessions.pop(session_key, None)
                    return

                # Check for cooldown
                cooldown_ms = DiscordUtils.check_for_cooldown(response)
                if cooldown_ms > 0:
                    self.logger.warning(f"Cooldown detected: {int(cooldown_ms / 1000)}s")
                    await DiscordUtils.safe_send(
                        session["channel"],
                        f"⏳ Cooldown: {int(cooldown_ms / 1000)}s - waiting..."
                    )
                    await DiscordUtils.sleep(cooldown_ms + 2000)
                    last_response = None  # Reset to use slash command after cooldown
                    continue

                # Check for insufficient coins
                if self._check_insufficient_coins(response):
                    self.logger.error("Insufficient coins! Stopping auto enchant")
                    await DiscordUtils.safe_send(
                        session["channel"],
                        "💰 **Insufficient coins!** Auto enchant stopped."
                    )
                    session["running"] = False
                    self.sessions.pop(session_key, None)
                    return

                # Parse enchant result
                result = self._parse_enchant_result(response)

                if result:
                    self.logger.info(f"Got: {result['enchant']} (+{result['bonus']}%)")

                    # Check if target reached
                    if self._is_target_reached(result["enchant"], session["target_enchant"]):
                        duration = round((__import__("time").time() - session["start_time"]))

                        self.logger.success(f"Target {session['target_enchant']} reached!")

                        await DiscordUtils.safe_send(session["channel"], "\n".join([
                            "🎉 **Target Enchant Achieved!**",
                            "",
                            f"✨ **Result:** {result['enchant']} (+{result['bonus']}% {'AT' if session['equipment'] == 'sword' else 'DEF'})",
                            "",
                            "📊 **Stats:**",
                            f"• Total Attempts: {session['attempts']}",
                            f"• Duration: {self._format_duration(duration)}",
                        ]))

                        session["running"] = False
                        self.sessions.pop(session_key, None)
                        return

                # Delay before next attempt
                await DiscordUtils.sleep(ENCHANT_CONFIG["RETRY_DELAY"])

            except Exception as error:
                self.logger.error(f"Enchant error: {error}")

                if "Timeout" in str(error):
                    self.logger.warning("Bot response timeout, retrying with slash command...")
                    last_response = None  # Reset to use slash command on error
                else:
                    # Stop on unexpected errors
                    await DiscordUtils.safe_send(session["channel"], f"❌ Error: {error}")
                    session["running"] = False
                    self.sessions.pop(session_key, None)
                    return

                await DiscordUtils.sleep(ENCHANT_CONFIG["RETRY_DELAY"])

    def _has_enchant_again_button(self, message: Any) -> bool:
        """
        Check if message has the "ENCHANT AGAIN" button.

        Args:
            message: Discord message

        Returns:
            True if button exists and is not disabled
        """
        components = getattr(message, "components", None)
        if not components:
            return False

        for row in components:
            row_components = getattr(row, "components", None) or getattr(row, "children", [])
            for comp in row_components:
                custom_id = getattr(comp, "custom_id", None)
                disabled = getattr(comp, "disabled", False)
                if custom_id == ENCHANT_CONFIG["BUTTON_ID"] and not disabled:
                    return True
        return False

    def _find_tier(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Find tier by name using optimized lookup.

        Args:
            name: Tier name

        Returns:
            Tier data or None
        """
        normalized_name = name.lower().replace("-", "").replace("_", "").replace(" ", "")
        return TIER_LOOKUP.get(normalized_name)

    def _parse_enchant_result(self, response: Any) -> Optional[Dict[str, Any]]:
        """
        Parse enchant result from bot response.

        Args:
            response: Bot response message

        Returns:
            Enchant result data or None
        """
        embeds = getattr(response, "embeds", None)
        if not embeds:
            return None

        for embed in embeds:
            # Check author for enchant type confirmation
            author = getattr(embed, "author", None)
            if author and getattr(author, "name", None):
                author_match = re.search(r"enchant|refine|transmute|transcend", author.name, re.IGNORECASE)
                if not author_match:
                    continue

            # Check fields for enchant result
            fields = getattr(embed, "fields", None)
            if fields:
                for field in fields:
                    field_name = getattr(field, "name", "") or ""
                    field_value = getattr(field, "value", "") or ""

                    # Look for the sparkles pattern with enchant name
                    enchant_match = ENCHANT_RESULT_PATTERN.search(field_name)
                    if enchant_match:
                        enchant_name = enchant_match.group(1).upper()
                        tier = self._find_tier(enchant_name)
                        if tier:
                            return {
                                "enchant": enchant_name,
                                "bonus": tier["bonus"],
                            }

                    # Alternative pattern: check for tier name in field
                    field_upper = (field_name + " " + field_value).upper()
                    for tier_name in TIER_NAMES_UPPER:
                        if tier_name in field_upper:
                            tier = self._find_tier(tier_name)
                            return {
                                "enchant": tier["name"],
                                "bonus": tier["bonus"],
                            }

            # Check description
            description = getattr(embed, "description", None)
            if description:
                desc_upper = description.upper()
                for tier_name in TIER_NAMES_UPPER:
                    if tier_name in desc_upper:
                        tier = self._find_tier(tier_name)
                        return {
                            "enchant": tier["name"],
                            "bonus": tier["bonus"],
                        }

        return None

    def _is_target_reached(self, current_enchant: str, target_enchant: str) -> bool:
        """
        Check if target enchant is reached (or better).

        Args:
            current_enchant: Current enchant name
            target_enchant: Target enchant name

        Returns:
            True if target reached or exceeded
        """
        current_tier = self._find_tier(current_enchant)
        target_tier = self._find_tier(target_enchant)

        if not current_tier or not target_tier:
            return False

        # Current enchant index >= target index means equal or better
        return current_tier["index"] >= target_tier["index"]

    def _check_insufficient_coins(self, response: Any) -> bool:
        """
        Check if response indicates insufficient coins.

        Args:
            response: Bot response message

        Returns:
            True if insufficient coins detected
        """
        keywords = ["not enough coins", "insufficient", "you don't have enough"]

        content = getattr(response, "content", None)
        if content:
            lower_content = content.lower()
            if any(kw in lower_content for kw in keywords):
                return True

        embeds = getattr(response, "embeds", None)
        if embeds:
            for embed in embeds:
                texts = [
                    getattr(embed, "title", "") or "",
                    getattr(embed, "description", "") or "",
                ]
                for field in getattr(embed, "fields", []) or []:
                    texts.append(getattr(field, "name", "") or "")
                    texts.append(getattr(field, "value", "") or "")

                text = " ".join(texts).lower()
                if any(kw in text for kw in keywords):
                    return True

        return False

    def _format_duration(self, seconds: int) -> str:
        """
        Format duration in human readable format.

        Args:
            seconds: Duration in seconds

        Returns:
            Formatted duration string
        """
        return DiscordUtils.format_duration(seconds)

    def get_status(self, channel: Any) -> str:
        """
        Get session status for a channel.

        Args:
            channel: Discord channel

        Returns:
            Status message string
        """
        session = self.sessions.get(str(channel.id))

        if not session:
            return "🔮 **Auto Enchant:** Not running"

        duration = round((__import__("time").time() - session["start_time"]))

        return "\n".join([
            "🔮 **Auto Enchant Status:**",
            "",
            f"🎯 Target: {session['target_enchant']}",
            f"⚔️ Equipment: {session['equipment']}",
            f"🔮 Type: {session['type']}",
            f"📊 Attempts: {session['attempts']}",
            f"⏱️ Duration: {self._format_duration(duration)}",
        ])

    def is_active(self, channel_id: str) -> bool:
        """
        Check if session is active for channel.

        Args:
            channel_id: Channel ID

        Returns:
            True if session is active
        """
        return channel_id in self.sessions

    def cleanup(self) -> None:
        """Cleanup all sessions."""
        for session in self.sessions.values():
            session["running"] = False
        self.sessions.clear()

        # Call parent cleanup
        super().cleanup()
