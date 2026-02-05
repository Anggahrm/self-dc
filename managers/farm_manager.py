"""
Farm Manager
Handles automatic farming commands (adventure, hunt, heal)
"""

import asyncio
from typing import Any, Dict, Optional

from managers.base_manager import BaseManager
from utils.discord import DiscordUtils


# Epic RPG Bot ID
EPIC_RPG_BOT_ID = "555955826880413696"

# Farm configuration
FARM_CONFIG = {
    "COOLDOWNS": {
        "adventure": 3600000,  # 1 hour
        "axe": 300000,         # 5 minutes
        "hunt": 60000,         # 1 minute
    },
    "HEAL_HP_PERCENT": 60,   # Heal when HP below this percentage
    "HEAL_HP_MIN": 60,       # Also heal when HP below this absolute value
    "RESPONSE_TIMEOUT": 15000,
    "HEAL_DELAY": 2000,
    "START_DELAY": 3000,
}


class FarmManager(BaseManager):
    """Manager for auto farming commands."""

    def __init__(self, client: Any):
        super().__init__(client, "Farm")
        self.channel: Optional[Any] = None

        # State tracking for each command
        self.states: Dict[str, Dict[str, Any]] = {
            "adventure": {"enabled": False, "executing": False, "on_cooldown": False},
            "axe": {"enabled": False, "executing": False, "on_cooldown": False},
            "hunt": {"enabled": False, "executing": False, "on_cooldown": False},
            "heal": {"executing": False},
        }

    async def check_and_heal(self, bot_response: Any) -> None:
        """
        Check HP and heal if necessary.

        Args:
            bot_response: Bot response message
        """
        content = getattr(bot_response, "content", None)
        if not content:
            return

        hp_data = DiscordUtils.parse_hp(content)
        if not hp_data:
            return

        hp_percentage = (hp_data["current"] / hp_data["max"]) * 100

        # Heal if HP percentage is low OR absolute HP is low
        if hp_percentage < FARM_CONFIG["HEAL_HP_PERCENT"] or hp_data["current"] < FARM_CONFIG["HEAL_HP_MIN"]:
            self.logger.warning(f"HP low ({hp_data['current']}/{hp_data['max']} - {round(hp_percentage)}%), healing...")
            await self.trigger_heal()
            await DiscordUtils.sleep(FARM_CONFIG["HEAL_DELAY"])
        else:
            self.logger.debug(f"HP healthy ({hp_data['current']}/{hp_data['max']} - {round(hp_percentage)}%)")

    async def trigger_heal(self) -> None:
        """Execute heal command."""
        if self.states["heal"]["executing"]:
            self.logger.debug("Heal already in progress, skipping")
            return

        self.states["heal"]["executing"] = True
        self.logger.info("[COMMAND] heal - Emergency heal triggered")

        try:
            response = await DiscordUtils.send_slash_and_wait(
                self.channel,
                EPIC_RPG_BOT_ID,
                "heal",
                [],
                FARM_CONFIG["RESPONSE_TIMEOUT"]
            )

            if response:
                if DiscordUtils.check_for_epic_guard(response):
                    await self.handle_epic_guard()
                    return

                content = getattr(response, "content", "") or ""
                import re
                heal_match = re.search(r"healed.*?(\d+).*?hp", content, re.IGNORECASE)
                if heal_match:
                    self.logger.success(f"Healed {heal_match.group(1)} HP")
                else:
                    self.logger.success("Heal completed")
        except Exception as error:
            self._handle_error("heal", error)
        finally:
            self.states["heal"]["executing"] = False

    async def execute_command(self, command: str) -> None:
        """
        Execute a farm command.

        Args:
            command: Command name (adventure, axe, hunt, heal)
        """
        if command == "heal":
            await self.trigger_heal()
            return

        # Check if command can be executed
        if (self.states[command]["executing"] or
            not self.enabled or
            not self.channel or
            self.states[command]["on_cooldown"]):
            return

        self.states[command]["executing"] = True
        self.logger.info(f"[COMMAND] {command} - Executing")

        try:
            response = await DiscordUtils.send_slash_and_wait(
                self.channel,
                EPIC_RPG_BOT_ID,
                command,
                [],
                FARM_CONFIG["RESPONSE_TIMEOUT"]
            )

            if response:
                # Check for EPIC Guard
                if DiscordUtils.check_for_epic_guard(response):
                    await self.handle_epic_guard()
                    return

                # Check for cooldown
                cooldown_ms = DiscordUtils.check_for_cooldown(response)
                if cooldown_ms > 0:
                    self.logger.warning(f"{command} on cooldown: {int(cooldown_ms / 1000)}s")
                    await self._handle_cooldown(command, cooldown_ms)
                    return

                # Check HP after combat commands
                if command in ("adventure", "hunt"):
                    await self.check_and_heal(response)

                self.logger.success(f"{command} completed")
        except Exception as error:
            self._handle_error(command, error)
        finally:
            self.states[command]["executing"] = False

    async def _handle_cooldown(self, command: str, cooldown_ms: int) -> None:
        """
        Handle cooldown for a command.

        Args:
            command: Command name
            cooldown_ms: Cooldown duration in milliseconds
        """
        self.states[command]["on_cooldown"] = True

        # Clear existing timer
        self._clear_command_timer(command)

        # Schedule next execution after cooldown using managed timer
        timer_name = f"cooldown_{command}"

        async def cooldown_callback() -> None:
            self.states[command]["on_cooldown"] = False
            if self.states[command]["enabled"] and self.enabled:
                try:
                    await self.execute_command(command)
                    if self.states[command]["enabled"] and self.enabled:
                        self._schedule_next(command)
                except Exception as error:
                    self.logger.error(f"Cooldown execution error for {command}: {error}")

        self.set_managed_timer(timer_name, cooldown_callback, cooldown_ms + 2000)

    def _clear_command_timer(self, command: str) -> None:
        """
        Clear a command timer.

        Args:
            command: Command name
        """
        timer_name = f"cooldown_{command}"
        self.clear_managed_timer(timer_name)

    async def handle_epic_guard(self) -> None:
        """Handle EPIC Guard detection."""
        self.logger.error("EPIC GUARD DETECTED! Auto-stopping farm for safety")
        if self.channel:
            await DiscordUtils.safe_send(self.channel, "⚠️ **EPIC GUARD DETECTED!** Farm stopped automatically for safety.")
        self.stop()

    def _handle_error(self, command: str, error: Exception) -> None:
        """
        Handle command error.

        Args:
            command: Command name
            error: Exception that occurred
        """
        error_msg = str(error)
        if "Timeout waiting for deferred bot response" in error_msg:
            self.logger.warning(f"{command}: Bot response timeout")
        else:
            self.logger.error(f"{command} failed: {error_msg}")

    def _schedule_next(self, command: str) -> None:
        """
        Schedule next command execution.

        Args:
            command: Command name
        """
        if command == "heal":
            return
        if not self.states[command]["enabled"] or not self.enabled or self.states[command]["on_cooldown"]:
            return

        cooldown = FARM_CONFIG["COOLDOWNS"].get(command)
        if not cooldown:
            return

        timer_name = f"schedule_{command}"
        self.clear_managed_timer(timer_name)

        async def schedule_callback() -> None:
            if self.states[command]["enabled"] and self.enabled:
                try:
                    await self.execute_command(command)
                    if self.states[command]["enabled"] and self.enabled:
                        self._schedule_next(command)
                except Exception as error:
                    self.logger.error(f"Schedule execution error for {command}: {error}")

        self.set_managed_timer(timer_name, schedule_callback, cooldown)

    def _start_command_timer(self, command: str) -> None:
        """
        Start a specific command timer.

        Args:
            command: Command name
        """
        if command == "heal":
            return
        if self.states[command]["enabled"] or not FARM_CONFIG["COOLDOWNS"].get(command):
            return

        self.states[command]["enabled"] = True
        self.states[command]["on_cooldown"] = False
        self.logger.info(f"{command} timer started")

        async def start_callback() -> None:
            try:
                await self.execute_command(command)
                if self.states[command]["enabled"] and self.enabled:
                    self._schedule_next(command)
            except Exception as error:
                self.logger.error(f"Start command error for {command}: {error}")

        # Execute immediately (don't wait for timer)
        asyncio.create_task(start_callback())

    def _stop_command_timer(self, command: str) -> None:
        """
        Stop a specific command timer.

        Args:
            command: Command name
        """
        if command == "heal":
            return

        self.states[command]["enabled"] = False
        self.states[command]["on_cooldown"] = False

        self._clear_command_timer(command)
        self.clear_managed_timer(f"schedule_{command}")

        self.logger.info(f"{command} timer stopped")

    async def start_farm(self, channel: Any) -> None:
        """
        Start auto farm.

        Args:
            channel: Discord channel
        """
        if self.enabled:
            self.logger.warning("Farm already running")
            return

        self.enabled = True
        self.channel = channel
        self.logger.success("Auto Farm Started")

        await DiscordUtils.safe_send(channel, "🌾 **Auto Farm Started**\nRunning: adventure, axe, hunt with auto-heal")

        # Initial heal
        await self.trigger_heal()

        # Start all command timers after delay
        async def start_timers() -> None:
            await asyncio.sleep(FARM_CONFIG["START_DELAY"] / 1000)
            self._start_command_timer("adventure")
            self._start_command_timer("axe")
            self._start_command_timer("hunt")
            self.logger.info("All farm timers running")

        asyncio.create_task(start_timers())

    def stop_farm(self) -> None:
        """Stop auto farm."""
        if not self.enabled:
            self.logger.warning("Farm not running")
            return

        self.enabled = False
        self._stop_command_timer("adventure")
        self._stop_command_timer("axe")
        self._stop_command_timer("hunt")
        self.states["heal"]["executing"] = False

        self.logger.success("Auto Farm Stopped")

        if self.channel:
            asyncio.create_task(DiscordUtils.safe_send(self.channel, "🛑 **Auto Farm Stopped**"))

    def get_status(self) -> str:
        """
        Get farm status.

        Returns:
            Status message string
        """
        if not self.enabled:
            return "🛑 **Farm Status:** Stopped"

        def get_command_status(cmd: str) -> str:
            if cmd == "heal":
                return "🔄 Healing..." if self.states["heal"]["executing"] else "✅ Ready"
            if not self.states[cmd]["enabled"]:
                return "⏹️ Stopped"
            if self.states[cmd]["executing"]:
                return "🔄 Executing..."
            if self.states[cmd]["on_cooldown"]:
                return "⏳ Cooldown"
            return "✅ Active"

        return "\n".join([
            "🌾 **Farm Status:** Running",
            "",
            f"⚔️ Adventure: {get_command_status('adventure')}",
            f"🪓 Axe: {get_command_status('axe')}",
            f"🏹 Hunt: {get_command_status('hunt')}",
            f"❤️ Heal: {get_command_status('heal')}",
            "",
            "🛡️ EPIC Guard: Auto-stop enabled",
        ])

    def cleanup(self) -> None:
        """Cleanup timers."""
        self.clear_all_timers()
        super().cleanup()

    def set_channel(self, channel: Any) -> None:
        """
        Set current channel.

        Args:
            channel: Discord channel
        """
        self.channel = channel
