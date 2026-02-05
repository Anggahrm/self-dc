"""
Enchant Commands
Handles enchant/refine/transmute/transcend commands
"""

from typing import Any, List

from utils.discord import DiscordUtils
from utils.validation import ValidationUtils


async def enchant_on_command(message: Any, args: List[str], enchant_type: str = "enchant") -> None:
    """
    Start auto enchant/refine/transmute/transcend.

    Args:
        message: Discord message object
        args: Command arguments (equipment, target)
        enchant_type: Type of enchant operation
    """
    client = message.client
    auto_enchant_manager = client.auto_enchant_manager

    if not auto_enchant_manager:
        await message.reply("❌ Auto enchant manager not initialized")
        return

    if len(args) < 2:
        await message.reply(f"❌ Usage: `.on {enchant_type} <sword/armor> <target>`")
        return

    equipment = args[0].lower()
    target = " ".join(args[1:])

    validation = ValidationUtils.validate_enchant_input(enchant_type, equipment, target)
    if not validation.valid:
        await message.reply(f"❌ {validation.error}")
        return

    await auto_enchant_manager.start_enchant(
        message.channel,
        enchant_type,
        equipment,
        validation.sanitized or target
    )


async def enchant_off_command(message: Any, args: List[str]) -> None:
    """
    Stop auto enchant.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    auto_enchant_manager = client.auto_enchant_manager

    if not auto_enchant_manager:
        await message.reply("❌ Auto enchant manager not initialized")
        return

    await auto_enchant_manager.stop_enchant(message.channel)


async def enchantstatus_command(message: Any, args: List[str], enchant_type: str = "enchant") -> None:
    """
    Check enchant status.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
        enchant_type: Type of enchant operation
    """
    client = message.client
    auto_enchant_manager = client.auto_enchant_manager

    if not auto_enchant_manager:
        await message.reply("❌ Auto enchant manager not initialized")
        return

    status = auto_enchant_manager.get_status(message.channel)
    await message.reply(status)


# Specific command handlers for each enchant type
async def enchant_on_handler(message: Any, args: List[str]) -> None:
    """Start auto enchant."""
    await enchant_on_command(message, args, "enchant")


async def refine_on_handler(message: Any, args: List[str]) -> None:
    """Start auto refine."""
    await enchant_on_command(message, args, "refine")


async def transmute_on_handler(message: Any, args: List[str]) -> None:
    """Start auto transmute."""
    await enchant_on_command(message, args, "transmute")


async def transcend_on_handler(message: Any, args: List[str]) -> None:
    """Start auto transcend."""
    await enchant_on_command(message, args, "transcend")


async def enchant_status_handler(message: Any, args: List[str]) -> None:
    """Check enchant status."""
    await enchantstatus_command(message, args, "enchant")


async def refine_status_handler(message: Any, args: List[str]) -> None:
    """Check refine status."""
    await enchantstatus_command(message, args, "refine")


async def transmute_status_handler(message: Any, args: List[str]) -> None:
    """Check transmute status."""
    await enchantstatus_command(message, args, "transmute")


async def transcend_status_handler(message: Any, args: List[str]) -> None:
    """Check transcend status."""
    await enchantstatus_command(message, args, "transcend")
