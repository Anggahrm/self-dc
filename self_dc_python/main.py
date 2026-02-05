"""
Entry point for the Discord self-bot.
"""

import asyncio
import sys

from bot.client import run_bot
from utils.logger import get_logger

logger = get_logger("Main")


def main():
    """Main entry point."""
    try:
        logger.info("Starting Self-DC Bot (Python version)...")
        asyncio.run(run_bot())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
