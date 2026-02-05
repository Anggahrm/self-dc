"""
Debug Commands
Handles debug and debugstatus commands
"""

from typing import Any, List


async def debug_command(message: Any, args: List[str]) -> None:
    """
    Debug slash command or replied message.

    Args:
        message: Discord message object
        args: Command arguments (optional command name)
    """
    client = message.client
    debug_manager = client.debug_manager

    if not debug_manager:
        await message.reply("❌ Debug manager not initialized")
        return

    # Handle replied message
    if message.reference and message.reference.message_id:
        await debug_manager.handle_debug_command(message)
        return

    # Handle slash command debug
    if args:
        await debug_manager.handle_debug_command(message)
        return

    # Show usage
    await message.reply(
        "📖 **Debug Usage:**\n"
        "• `.debug <command>` - Debug a slash command response\n"
        "• Reply to a bot message with `.debug` - Debug that message"
    )


async def debugstatus_command(message: Any, args: List[str]) -> None:
    """
    Show debug status.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    debug_manager = client.debug_manager

    if not debug_manager:
        await message.reply("❌ Debug manager not initialized")
        return

    stats = debug_manager.get_stats()

    status = "🟢 Enabled" if stats["debug_mode"] else "🔴 Disabled"
    enabled = "🟢 Yes" if stats["enabled"] else "🔴 No"

    await message.reply(
        "🔍 **Debug Status**\n\n"
        f"**Debug Mode:** {status}\n"
        f"**Logging Enabled:** {enabled}\n"
        f"**Logged Messages:** {stats['logged_messages_count']}\n"
        f"**Max Log Size:** {stats['max_log_size']}"
    )
