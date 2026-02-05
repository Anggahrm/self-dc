"""
Discord self-bot client setup using discord.py-self.
"""

import asyncio
import signal
import sys
from typing import Optional

import discord
from discord.ext import commands

from bot.config import config
from bot.database import close_database, init_database
from bot.keep_alive import run_server, update_bot_status
from utils.logger import get_logger

logger = get_logger("Client")


class SelfBot(commands.Bot):
    """Discord self-bot client."""

    def __init__(self):
        # discord.py-self uses self-bot features
        super().__init__(
            command_prefix=".",
            self_bot=True,
            help_command=None,  # We'll implement custom help
            intents=discord.Intents.all(),
        )

        # Track uptime
        self.start_time: Optional[float] = None

        # Managers (will be initialized in setup_hook)
        self.farm_manager = None
        self.voice_manager = None
        self.auto_enchant_manager = None
        self.event_handler = None
        self.debug_manager = None

    async def setup_hook(self):
        """Called when bot is starting up."""
        logger.info("Setting up bot...")

        # Initialize database
        await init_database()

        # Load extensions (cogs)
        await self.load_extension("commands.command_handler")

        # Initialize managers
        from managers.farm_manager import FarmManager
        from managers.voice_manager import VoiceManager
        from managers.auto_enchant_manager import AutoEnchantManager
        from managers.event_handler import EventHandler
        from managers.debug_manager import DebugManager

        self.farm_manager = FarmManager(self)
        self.voice_manager = VoiceManager(self)
        self.auto_enchant_manager = AutoEnchantManager(self)
        self.event_handler = EventHandler(self)
        self.debug_manager = DebugManager(self)

        logger.success("Bot setup complete")

    async def on_ready(self):
        """Called when bot is ready."""
        self.start_time = asyncio.get_event_loop().time()
        update_bot_status(
            status="ready",
            discord_connected=True,
        )

        logger.success(f"Logged in as: {self.user}")
        logger.info("Use .help to see available commands")

        # Initialize voice connections from database
        if self.voice_manager:
            await self.voice_manager.initialize()

    async def on_message(self, message: discord.Message):
        """Handle incoming messages."""
        # Ignore other users' messages (self-bot only responds to owner)
        if message.author.id != self.user.id:
            # Pass to event handler for monitoring
            if self.event_handler:
                await self.event_handler.handle_message(message)
            return

        # Process commands
        await self.process_commands(message)

    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ):
        """Handle voice state updates."""
        # Only care about our own voice state
        if member.id != self.user.id:
            return

        if self.voice_manager:
            await self.voice_manager.handle_voice_state_update(before, after)

    async def close(self, preserve_voice: bool = False):
        """
        Clean shutdown.

        Args:
            preserve_voice: If True, don't disconnect voice (for Heroku SIGTERM)
        """
        logger.info("Shutting down bot...")

        # Cleanup managers
        if self.voice_manager:
            await self.voice_manager.cleanup(disconnect=not preserve_voice)
        if self.farm_manager:
            await self.farm_manager.cleanup()
        if self.auto_enchant_manager:
            await self.auto_enchant_manager.cleanup()

        # Close database
        await close_database()

        update_bot_status(status="offline", discord_connected=False)
        await super().close()


# Global bot instance
bot: Optional[SelfBot] = None


def create_bot() -> SelfBot:
    """Create and return bot instance."""
    global bot
    bot = SelfBot()
    return bot


async def run_bot():
    """Run the bot."""
    global bot

    # Validate config
    config.validate()

    # Create bot
    bot = create_bot()

    # Setup signal handlers for graceful shutdown
    def sigint_handler(sig, frame):
        """Handle SIGINT (Ctrl+C) - disconnect voice normally."""
        logger.info(f"Received SIGINT, shutting down...")
        asyncio.create_task(bot.close(preserve_voice=False))

    def sigterm_handler(sig, frame):
        """Handle SIGTERM (Heroku dyno cycling) - preserve voice state."""
        logger.info(f"Received SIGTERM (Heroku), preserving voice state...")
        asyncio.create_task(bot.close(preserve_voice=True))

    signal.signal(signal.SIGINT, sigint_handler)
    signal.signal(signal.SIGTERM, sigterm_handler)

    try:
        # Start keep-alive server (for Heroku)
        await run_server()

        # Start bot
        await bot.start(config.DISCORD_TOKEN)
    except Exception as e:
        logger.error(f"Bot error: {e}")
        raise
