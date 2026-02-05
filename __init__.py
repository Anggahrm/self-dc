"""
Discord self-bot Python migration package.
"""

__version__ = "2.0.0"
__author__ = "Claude Code"
__description__ = "Discord self-bot using discord.py-self"

from .bot.client import SelfBot, create_bot, run_bot

__all__ = ["SelfBot", "create_bot", "run_bot", "__version__"]