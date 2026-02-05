"""
Status Commands
Handles status and health commands
"""

from typing import Any, List


async def status_command(message: Any, args: List[str]) -> None:
    """
    Show bot health status and metrics.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client

    # Get monitoring from client
    monitoring = getattr(client, "monitoring", None)

    if not monitoring:
        # Fallback basic status
        await message.reply(
            "🤖 **Bot Status**\n\n"
            f"**User:** {client.user}\n"
            f"**Status:** Ready\n"
            f"**Guilds:** {len(client.guilds)}\n"
        )
        return

    status_text = monitoring.format_health_status()
    await message.reply(status_text)


async def health_command(message: Any, args: List[str]) -> None:
    """
    Alias for status command - show bot health.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    await status_command(message, args)
