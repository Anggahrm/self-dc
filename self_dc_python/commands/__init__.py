"""
Command system for the Discord self-bot.
"""

from self_dc_python.commands.command_registry import CommandRegistry, registry, Command, CommandDefinition
from self_dc_python.commands.command_handler import CommandHandler

__all__ = [
    "CommandRegistry",
    "registry",
    "Command",
    "CommandDefinition",
    "CommandHandler",
]
