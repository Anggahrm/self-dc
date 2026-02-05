"""
On/Off Commands
Master toggle commands for enabling/disabling features
"""

from typing import Any, List

from utils.discord import DiscordUtils


async def on_command(message: Any, args: List[str]) -> None:
    """
    Master on command - routes to appropriate feature.

    Args:
        message: Discord message object
        args: Command arguments (feature name)
    """
    if not args:
        await message.reply(
            "❌ **Usage:** `.on <feature>`\n\n"
            "Available features:\n"
            "• `.on farm` - Start auto farm\n"
            "• `.on event` - Enable auto event catch\n"
            "• `.on vc` - Join voice channel\n"
            "• `.on enchant` - Start auto enchant\n"
            "• `.on refine` - Start auto refine\n"
            "• `.on transmute` - Start auto transmute\n"
            "• `.on transcend` - Start auto transcend\n"
            "• `.on debug` - Enable debug logging"
        )
        return

    feature = args[0].lower()
    remaining_args = args[1:]

    client = message.client

    if feature == "farm":
        if client.farm_manager:
            await client.farm_manager.start_farm(message.channel)
        else:
            await message.reply("❌ Farm manager not initialized")

    elif feature == "event":
        if client.event_handler:
            client.event_handler.set_channel(message.channel)
            client.event_handler.enabled = True
            await message.reply("🎯 **Auto Event Enabled**")
        else:
            await message.reply("❌ Event handler not initialized")

    elif feature in ("vc", "voice"):
        # Import here to avoid circular imports
        from commands.voice_commands import voicejoin_command
        await voicejoin_command(message, remaining_args)

    elif feature == "enchant":
        from commands.enchant_commands import enchant_on_handler
        await enchant_on_handler(message, remaining_args)

    elif feature == "refine":
        from commands.enchant_commands import refine_on_handler
        await refine_on_handler(message, remaining_args)

    elif feature == "transmute":
        from commands.enchant_commands import transmute_on_handler
        await transmute_on_handler(message, remaining_args)

    elif feature == "transcend":
        from commands.enchant_commands import transcend_on_handler
        await transcend_on_handler(message, remaining_args)

    elif feature == "debug":
        if client.debug_manager:
            client.debug_manager.set_channel(message.channel)
            client.debug_manager.enabled = True
            await message.reply("🔍 **Debug Mode Enabled** - Bot messages will be logged")
        else:
            await message.reply("❌ Debug manager not initialized")

    else:
        await message.reply(f"❌ Unknown feature: `{feature}`. Use `.help` for available commands.")


async def off_command(message: Any, args: List[str]) -> None:
    """
    Master off command - routes to appropriate feature.

    Args:
        message: Discord message object
        args: Command arguments (feature name)
    """
    if not args:
        await message.reply(
            "❌ **Usage:** `.off <feature>`\n\n"
            "Available features:\n"
            "• `.off farm` - Stop auto farm\n"
            "• `.off event` - Disable auto event catch\n"
            "• `.off vc` - Leave voice channel\n"
            "• `.off enchant` - Stop auto enchant\n"
            "• `.off debug` - Disable debug logging"
        )
        return

    feature = args[0].lower()
    remaining_args = args[1:]

    client = message.client

    if feature == "farm":
        if client.farm_manager:
            client.farm_manager.set_channel(message.channel)
            await client.farm_manager.stop_farm()
        else:
            await message.reply("❌ Farm manager not initialized")

    elif feature == "event":
        if client.event_handler:
            client.event_handler.set_channel(message.channel)
            client.event_handler.enabled = False
            await message.reply("🛑 **Auto Event Disabled**")
        else:
            await message.reply("❌ Event handler not initialized")

    elif feature in ("vc", "voice"):
        from commands.voice_commands import voiceleave_command
        await voiceleave_command(message, remaining_args)

    elif feature in ("enchant", "refine", "transmute", "transcend"):
        if client.auto_enchant_manager:
            await client.auto_enchant_manager.stop_enchant(message.channel)
        else:
            await message.reply("❌ Auto enchant manager not initialized")

    elif feature == "debug":
        if client.debug_manager:
            client.debug_manager.set_channel(message.channel)
            client.debug_manager.enabled = False
            await message.reply("🔍 **Debug Mode Disabled**")
        else:
            await message.reply("❌ Debug manager not initialized")

    else:
        await message.reply(f"❌ Unknown feature: `{feature}`. Use `.help` for available commands.")
