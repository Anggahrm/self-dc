"""
Farm Commands
Handles farm start, stop, and status commands
"""

from typing import Any, List


async def farm_on_command(message: Any, args: List[str]) -> None:
    """
    Start auto farm (adventure, axe, hunt with auto-heal).

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    farm_manager = client.farm_manager

    if not farm_manager:
        await message.reply("❌ Farm manager not initialized")
        return

    await farm_manager.start_farm(message.channel)


async def farm_off_command(message: Any, args: List[str]) -> None:
    """
    Stop auto farm.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    farm_manager = client.farm_manager

    if not farm_manager:
        await message.reply("❌ Farm manager not initialized")
        return

    farm_manager.set_channel(message.channel)
    farm_manager.stop_farm()


async def farmstatus_command(message: Any, args: List[str]) -> None:
    """
    Check farm status.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    farm_manager = client.farm_manager

    if not farm_manager:
        await message.reply("❌ Farm manager not initialized")
        return

    status = farm_manager.get_status()
    await message.reply(status)
