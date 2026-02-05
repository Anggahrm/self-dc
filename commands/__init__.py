"""
Command system for the Discord self-bot.
"""

from .command_registry import CommandRegistry, registry, Command, CommandDefinition
from .command_handler import CommandHandler

__all__ = [
    "CommandRegistry",
    "registry",
    "Command",
    "CommandDefinition",
    "CommandHandler",
]
