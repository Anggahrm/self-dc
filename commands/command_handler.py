"""
Command Handler
Handles user command parsing and execution using Command Registry
"""

from typing import Any, Dict, List, Optional, Tuple

try:
    import discord
    DISCORD_AVAILABLE = True
except ImportError:
    DISCORD_AVAILABLE = False
    discord = None

from commands.command_registry import registry, Command
from utils.logger import get_logger
from utils.discord import DiscordUtils
from utils.validation import ValidationUtils

# Epic RPG Bot ID
EPIC_RPG_BOT_ID = "555955826880413696"

# Command prefix
PREFIX = "."


class CommandHandler:
    """Handles command parsing and execution."""

    def __init__(self, client: Any, managers: Dict[str, Any]):
        self.logger = get_logger("Command")
        self.client = client
        self.managers = managers

        # Extract managers
        self.farm_manager = managers.get("farm_manager")
        self.event_handler = managers.get("event_handler")
        self.debug_manager = managers.get("debug_manager")
        self.auto_enchant_manager = managers.get("auto_enchant_manager")
        self.voice_manager = managers.get("voice_manager")

        # Register all commands
        self._register_commands()

    def _register_commands(self) -> None:
        """Register all commands to the registry."""
        # Farm Commands
        registry.register(
            {
                "name": ".on farm",
                "description": "Start auto farm (adventure, axe, hunt with auto-heal)",
                "category": "Farm",
                "aliases": [".farm on"],
            },
            self._cmd_on_farm,
        )

        registry.register(
            {
                "name": ".off farm",
                "description": "Stop auto farm",
                "category": "Farm",
                "aliases": [".farm off"],
            },
            self._cmd_off_farm,
        )

        registry.register(
            {
                "name": ".farm status",
                "description": "Check farm status",
                "category": "Farm",
            },
            self._cmd_farm_status,
        )

        # Event Commands
        registry.register(
            {
                "name": ".on event",
                "description": "Enable auto event catch",
                "category": "Events",
                "aliases": [".event on"],
            },
            self._cmd_on_event,
        )

        registry.register(
            {
                "name": ".off event",
                "description": "Disable auto event catch",
                "category": "Events",
                "aliases": [".event off"],
            },
            self._cmd_off_event,
        )

        # Voice Commands
        registry.register(
            {
                "name": ".on vc",
                "description": "Join voice channel & stay",
                "category": "Voice",
                "aliases": [".vc on", ".voice on"],
                "args": [
                    {"name": "channel_id", "description": "Voice channel ID (optional)", "required": False},
                ],
                "examples": [".on vc", ".on vc 123456789012345678"],
                "guild_only": True,
            },
            self._cmd_on_vc,
        )

        registry.register(
            {
                "name": ".off vc",
                "description": "Leave voice channel",
                "category": "Voice",
                "aliases": [".vc off", ".voice off"],
                "guild_only": True,
            },
            self._cmd_off_vc,
        )

        registry.register(
            {
                "name": ".vc status",
                "description": "Check voice status",
                "category": "Voice",
                "guild_only": True,
            },
            self._cmd_vc_status,
        )

        # Debug Commands
        registry.register(
            {
                "name": ".on debug",
                "description": "Enable debug logging",
                "category": "Debug",
            },
            self._cmd_on_debug,
        )

        registry.register(
            {
                "name": ".off debug",
                "description": "Disable debug logging",
                "category": "Debug",
            },
            self._cmd_off_debug,
        )

        # Health/Status command
        registry.register(
            {
                "name": ".status",
                "description": "Show bot health status and metrics",
                "category": "Debug",
                "aliases": [".health", ".stats"],
            },
            self._cmd_status,
        )

        # Debug command (special - handles replies and subcommands)
        registry.register(
            {
                "name": ".debug",
                "description": "Debug slash command or replied message",
                "category": "Debug",
                "args": [
                    {"name": "command", "description": "Slash command to debug", "required": False},
                ],
                "examples": [".debug", ".debug hunt", ".debug (reply to message)"],
            },
            self._cmd_debug,
        )

        # Enchant Commands
        enchant_types = ["enchant", "refine", "transmute", "transcend"]
        for enchant_type in enchant_types:
            registry.register(
                {
                    "name": f".on {enchant_type}",
                    "description": f"Start auto {enchant_type} until target is achieved",
                    "category": "Enchant",
                    "args": [
                        {"name": "equipment", "description": "sword or armor", "required": True},
                        {"name": "target", "description": "Target enchant tier", "required": True},
                    ],
                    "examples": [f".on {enchant_type} sword epic", f".on {enchant_type} armor godly"],
                },
                self._make_enchant_on_handler(enchant_type),
            )

            registry.register(
                {
                    "name": f".off {enchant_type}",
                    "description": f"Stop auto {enchant_type}",
                    "category": "Enchant",
                },
                self._make_enchant_off_handler(enchant_type),
            )

        # Enchant status commands
        for enchant_type in enchant_types:
            registry.register(
                {
                    "name": f".{enchant_type} status",
                    "description": f"Check {enchant_type} status",
                    "category": "Enchant",
                },
                self._make_enchant_status_handler(enchant_type),
            )

        # Help Command
        registry.register(
            {
                "name": ".help",
                "description": "Show this help message",
                "category": "General",
                "args": [
                    {"name": "command", "description": "Specific command to get help for", "required": False},
                ],
                "examples": [".help", ".help .on farm"],
            },
            self._cmd_help,
        )

        self.logger.info(f"Registered {len(registry.get_all())} commands")

    # Command Handlers

    async def _cmd_on_farm(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .on farm command."""
        if handler.farm_manager:
            await handler.farm_manager.start_farm(message.channel)

    async def _cmd_off_farm(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .off farm command."""
        if handler.farm_manager:
            handler.farm_manager.set_channel(message.channel)
            handler.farm_manager.stop_farm()

    async def _cmd_farm_status(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .farm status command."""
        if handler.farm_manager:
            status = handler.farm_manager.get_status()
            await DiscordUtils.safe_send(message.channel, status)

    async def _cmd_on_event(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .on event command."""
        if handler.event_handler:
            handler.event_handler.set_channel(message.channel)
            handler.event_handler.set_enabled(True)
            await DiscordUtils.safe_send(message.channel, "🎯 **Auto Event Enabled**")

    async def _cmd_off_event(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .off event command."""
        if handler.event_handler:
            handler.event_handler.set_channel(message.channel)
            handler.event_handler.set_enabled(False)
            await DiscordUtils.safe_send(message.channel, "🛑 **Auto Event Disabled**")

    async def _cmd_on_vc(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .on vc command."""
        channel_id = args[0] if args else None
        await handler.handle_voice_join(message, channel_id)

    async def _cmd_off_vc(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .off vc command."""
        await handler.handle_voice_leave(message)

    async def _cmd_vc_status(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .vc status command."""
        if handler.voice_manager:
            guild_id = str(message.guild.id) if message.guild else None
            status = handler.voice_manager.get_status(guild_id)
            await DiscordUtils.safe_send(message.channel, status)

    async def _cmd_on_debug(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .on debug command."""
        if handler.debug_manager:
            handler.debug_manager.set_channel(message.channel)
            handler.debug_manager.set_enabled(True)
            await DiscordUtils.safe_send(
                message.channel,
                "🔍 **Debug Mode Enabled** - Bot messages will be logged"
            )

    async def _cmd_off_debug(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .off debug command."""
        if handler.debug_manager:
            handler.debug_manager.set_channel(message.channel)
            handler.debug_manager.set_enabled(False)
            await DiscordUtils.safe_send(message.channel, "🔍 **Debug Mode Disabled**")

    async def _cmd_status(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .status command."""
        if hasattr(handler.client, "monitoring") and handler.client.monitoring:
            status = handler.client.monitoring.format_health_status()
            await DiscordUtils.safe_send(message.channel, status)
        else:
            await DiscordUtils.safe_send(message.channel, "❌ Monitoring not available")

    async def _cmd_debug(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .debug command."""
        if handler.debug_manager:
            await handler.debug_manager.handle_debug_command(message)

    async def _cmd_help(self, message: Any, args: List[str], handler: "CommandHandler") -> None:
        """Handle .help command."""
        if args:
            cmd_name = args[0].lower()
            help_text = registry.generate_command_help(cmd_name)
            if help_text:
                await DiscordUtils.safe_send(message.channel, help_text)
            else:
                await DiscordUtils.safe_send(
                    message.channel,
                    f"❌ Unknown command: `{cmd_name}`"
                )
        else:
            help_text = registry.generate_help()
            await DiscordUtils.safe_send(message.channel, help_text)

    def _make_enchant_on_handler(self, enchant_type: str):
        """Create handler for .on <enchant_type> commands."""
        async def handler(message: Any, args: List[str], handler: "CommandHandler") -> None:
            equipment = args[0] if args else None
            target = " ".join(args[1:]) if len(args) > 1 else None

            if not equipment or not target:
                await DiscordUtils.safe_send(
                    message.channel,
                    f"❌ Usage: `.on {enchant_type} <sword/armor> <target>`"
                )
                return

            validation = ValidationUtils.validate_enchant_input(enchant_type, equipment, target)
            if not validation:
                await DiscordUtils.safe_send(
                    message.channel,
                    f"❌ {validation.error}"
                )
                return

            if handler.auto_enchant_manager:
                await handler.auto_enchant_manager.start_enchant(
                    message.channel,
                    enchant_type,
                    equipment,
                    validation.sanitized or target
                )

        return handler

    def _make_enchant_off_handler(self, enchant_type: str):
        """Create handler for .off <enchant_type> commands."""
        async def handler(message: Any, args: List[str], handler: "CommandHandler") -> None:
            if handler.auto_enchant_manager:
                await handler.auto_enchant_manager.stop_enchant(message.channel)

        return handler

    def _make_enchant_status_handler(self, enchant_type: str):
        """Create handler for .<enchant_type> status commands."""
        async def handler(message: Any, args: List[str], handler: "CommandHandler") -> None:
            if handler.auto_enchant_manager:
                status = handler.auto_enchant_manager.get_status(message.channel)
                await DiscordUtils.safe_send(message.channel, status)

        return handler

    async def handle(self, message: Any) -> None:
        """
        Handle incoming message.

        Args:
            message: Discord message object
        """
        # Handle EPIC RPG bot messages
        if message.author.id == EPIC_RPG_BOT_ID:
            if self.event_handler:
                await self.event_handler.handle_message(message)
            if self.debug_manager:
                await self.debug_manager.log_bot_debug_info(message)
            return

        # Only process self messages
        if message.author.id != self.client.user.id:
            return

        content = message.content.strip()

        # Check for command prefix
        if not content.startswith(PREFIX):
            return

        # Sanitize input
        lower_content = ValidationUtils.sanitize_input(content.lower())

        # Parse command and arguments
        command_name, args = self.parse_command(lower_content)

        # Look up command
        command = registry.get(command_name)
        if not command:
            return

        # Check guild requirement
        if command.guild_only and not message.guild:
            await DiscordUtils.safe_send(message.channel, "❌ This command must be used in a server")
            return

        # Delete command message
        await DiscordUtils.safe_delete(message)

        # Execute command
        try:
            self.logger.debug(f"Executing: {command.name}")
            if hasattr(self.client, "monitoring") and self.client.monitoring:
                self.client.monitoring.record_command()
            await command.handler(message, args, self)
        except Exception as error:
            self.logger.error(f"Command error ({command.name}): {error}")
            if hasattr(self.client, "monitoring") and self.client.monitoring:
                self.client.monitoring.record_error()

    def parse_command(self, content: str) -> Tuple[str, List[str]]:
        """
        Parse command name and arguments from message.

        Args:
            content: Message content (lowercase)

        Returns:
            Tuple of (command_name, args)
        """
        parts = content.split()

        # Find the longest matching registered command
        # Try matching up to 3 words (e.g., ".on enchant sword")
        command_name = parts[0]
        args = parts[1:]

        # Check for 3-word commands first (e.g., ".on enchant sword")
        if len(parts) >= 3:
            three_word = f"{parts[0]} {parts[1]} {parts[2]}"
            if registry.get(three_word):
                return three_word, parts[3:]

        # Check for 2-word commands (e.g., ".on farm", ".farm status")
        if len(parts) >= 2:
            two_word = f"{parts[0]} {parts[1]}"
            if registry.get(two_word):
                return two_word, parts[2:]

        # Fall back to 1-word command
        cmd = registry.get(parts[0])
        if cmd:
            return parts[0], parts[1:]

        # Check aliases
        for i in range(min(len(parts), 3), 0, -1):
            candidate = " ".join(parts[:i])
            alias_cmd = registry.find_by_alias(candidate)
            if alias_cmd:
                return alias_cmd.name, parts[i:]

        return parts[0], parts[1:]

    async def handle_voice_join(self, message: Any, channel_id_arg: Optional[str]) -> None:
        """
        Handle voice join command.

        Args:
            message: Discord message
            channel_id_arg: Optional channel ID from args
        """
        if not self.voice_manager:
            await DiscordUtils.safe_send(message.channel, "❌ Voice manager not available")
            return

        target_channel = None

        if channel_id_arg:
            # Channel ID provided as argument
            validation = ValidationUtils.validate_channel_id(channel_id_arg)
            if not validation:
                await DiscordUtils.safe_send(
                    message.channel,
                    f"❌ {validation.error}"
                )
                return

            target_channel = self.client.get_channel(int(validation.sanitized))

            if not target_channel or (DISCORD_AVAILABLE and not isinstance(target_channel, discord.VoiceChannel)):
                await DiscordUtils.safe_send(
                    message.channel,
                    f"❌ Voice channel not found: `{channel_id_arg}`"
                )
                return
        else:
            # No channel ID provided
            guild_id = str(message.guild.id) if message.guild else None
            current_connection = self.voice_manager.get_connection_status(guild_id) if guild_id else None

            if current_connection:
                await DiscordUtils.safe_send(
                    message.channel,
                    "\n".join([
                        "⚠️ **Already connected to a voice channel**",
                        "",
                        f"📍 **Channel:** {current_connection['channel_name']}",
                        "Use `.off vc` to disconnect first, or provide a different channel ID.",
                    ])
                )
                return

            await DiscordUtils.safe_send(
                message.channel,
                "\n".join([
                    "❌ **No voice channel specified**",
                    "",
                    "Please provide a channel ID:",
                    "• `.on vc <channel_id>` - Join a specific voice channel",
                    "",
                    'You can get a channel ID by right-clicking a voice channel and selecting "Copy ID".',
                ])
            )
            return

        # Send processing message
        processing_msg = await DiscordUtils.safe_send(message.channel, "🔄 **Joining voice channel...**")

        result = await self.voice_manager.join_channel(target_channel, True, True)

        if processing_msg:
            await DiscordUtils.safe_delete(processing_msg)

        # Check connection status
        guild_id = str(message.guild.id) if message.guild else None
        connection_status = self.voice_manager.get_connection_status(guild_id) if guild_id else None

        if result or connection_status:
            status = result or connection_status
            await DiscordUtils.safe_send(
                message.channel,
                "\n".join([
                    "🎤 **Auto Voice Enabled**",
                    "",
                    f"📍 **Channel:** {status['channel_name']}",
                    f"🏠 **Server:** {status['guild_name']}",
                    "🔇 **Self Mute:** Yes",
                    "🔈 **Self Deaf:** Yes",
                    "",
                    "*Will auto-reconnect if disconnected*",
                    "Use `.off vc` to leave",
                ])
            )
        else:
            await DiscordUtils.safe_send(message.channel, "❌ **Failed to join voice channel**")

    async def handle_voice_leave(self, message: Any) -> None:
        """
        Handle voice leave command.

        Args:
            message: Discord message
        """
        if not self.voice_manager:
            await DiscordUtils.safe_send(message.channel, "❌ Voice manager not available")
            return

        guild_id = str(message.guild.id) if message.guild else None

        if not guild_id:
            await DiscordUtils.safe_send(message.channel, "❌ **This command must be used in a server**")
            return

        was_connected = self.voice_manager.is_connected(guild_id)

        if not was_connected:
            await DiscordUtils.safe_send(
                message.channel,
                "❌ **Not connected to any voice channel in this server**"
            )
            return

        await self.voice_manager.disconnect(guild_id)

        await DiscordUtils.safe_send(
            message.channel,
            "🔇 **Auto Voice Disabled** - Left voice channel"
        )

    def show_help(self, command_name: Optional[str] = None) -> str:
        """
        Show help for a command or all commands.

        Args:
            command_name: Optional specific command name

        Returns:
            Help text
        """
        if command_name:
            help_text = registry.generate_command_help(command_name)
            return help_text or f"❌ Unknown command: `{command_name}`"
        return registry.generate_help()


async def setup(bot):
    """Setup function for discord.py extension loading."""
    # The CommandHandler is initialized directly in client.py through managers
    # This setup function is required for load_extension but we handle initialization elsewhere
    pass
