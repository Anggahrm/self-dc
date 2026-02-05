"""
Voice Commands
Handles voice channel join, leave, and status commands
"""

from typing import Any, List, Optional

import discord

from utils.discord import DiscordUtils
from utils.validation import ValidationUtils


async def voicejoin_command(message: Any, args: List[str]) -> None:
    """
    Join a voice channel and stay connected.

    Args:
        message: Discord message object
        args: Command arguments (optional channel_id)
    """
    client = message.client
    voice_manager = client.voice_manager

    if not voice_manager:
        await message.reply("❌ Voice manager not initialized")
        return

    # Check if in guild
    if not message.guild:
        await message.reply("❌ This command must be used in a server")
        return

    guild_id = str(message.guild.id)
    channel_id_arg = args[0] if args else None
    target_channel = None

    if channel_id_arg:
        # Channel ID provided as argument
        validation = ValidationUtils.validate_channel_id(channel_id_arg)
        if not validation.valid:
            await message.reply(f"❌ {validation.error}")
            return

        target_channel = client.get_channel(int(validation.sanitized))

        if not target_channel or not isinstance(target_channel, discord.VoiceChannel):
            await message.reply(f"❌ Voice channel not found: `{channel_id_arg}`")
            return
    else:
        # No channel ID provided - check if already connected
        current_connection = voice_manager.get_connection_status(guild_id)

        if current_connection:
            await message.reply(
                "⚠️ **Already connected to a voice channel**\n\n"
                f"📍 **Channel:** {current_connection['channel_name']}\n"
                "Use `.off vc` to disconnect first, or provide a different channel ID."
            )
            return

        await message.reply(
            "❌ **No voice channel specified**\n\n"
            "Please provide a channel ID:\n"
            "• `.on vc <channel_id>` - Join a specific voice channel\n\n"
            'You can get a channel ID by right-clicking a voice channel and selecting "Copy ID".'
        )
        return

    # Send processing message
    processing_msg = await message.reply("🔄 **Joining voice channel...**")

    # Join the channel
    result = await voice_manager.join_channel(target_channel, True, True)

    # Delete processing message
    if processing_msg:
        await DiscordUtils.safe_delete(processing_msg)

    # Check connection status
    connection_status = voice_manager.get_connection_status(guild_id)

    if result or connection_status:
        status = result or connection_status
        await message.reply(
            "🎤 **Auto Voice Enabled**\n\n"
            f"📍 **Channel:** {status['channel_name']}\n"
            f"🏠 **Server:** {status['guild_name']}\n"
            "🔇 **Self Mute:** Yes\n"
            "🔈 **Self Deaf:** Yes\n\n"
            "*Will auto-reconnect if disconnected*\n"
            "Use `.off vc` to leave"
        )
    else:
        await message.reply("❌ **Failed to join voice channel**")


async def voiceleave_command(message: Any, args: List[str]) -> None:
    """
    Leave the voice channel.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    voice_manager = client.voice_manager

    if not voice_manager:
        await message.reply("❌ Voice manager not initialized")
        return

    # Check if in guild
    if not message.guild:
        await message.reply("❌ This command must be used in a server")
        return

    guild_id = str(message.guild.id)

    was_connected = voice_manager.is_connected(guild_id)

    if not was_connected:
        await message.reply("❌ **Not connected to any voice channel in this server**")
        return

    await voice_manager.disconnect(guild_id)

    await message.reply("🔇 **Auto Voice Disabled** - Left voice channel")


async def voicestatus_command(message: Any, args: List[str]) -> None:
    """
    Check voice channel status.

    Args:
        message: Discord message object
        args: Command arguments (ignored)
    """
    client = message.client
    voice_manager = client.voice_manager

    if not voice_manager:
        await message.reply("❌ Voice manager not initialized")
        return

    guild_id = str(message.guild.id) if message.guild else None
    status = voice_manager.get_status(guild_id)

    await message.reply(status)
