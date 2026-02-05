"""
Discord Utilities
Helper functions for Discord interactions
"""

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

# Pre-compiled regex patterns for performance
REGEX = {
    "HP": re.compile(r"remaining HP is (\d+)/(\d+)", re.IGNORECASE),
    "COOLDOWN_HMS": re.compile(r"wait at least \*{0,2}(\d+)h (\d+)m (\d+)s\*{0,2}", re.IGNORECASE),
    "COOLDOWN_MS": re.compile(r"wait at least \*{0,2}(\d+)m (\d+)s\*{0,2}", re.IGNORECASE),
    "COOLDOWN_S": re.compile(r"wait at least \*{0,2}(\d+)s\*{0,2}", re.IGNORECASE),
    "COOLDOWN_FALLBACK": re.compile(r"wait.*?(\d+)h.*?(\d+)m.*?(\d+)s", re.IGNORECASE),
    "NUMBER_FORMAT": re.compile(r"\B(?=(\d{3})+(?!\d))"),
}

# EPIC Guard detection phrases
EPIC_GUARD_PHRASES = [
    "EPIC GUARD: stop there",
    "We have to check you are actually playing",
    "EPIC GUARD",
]


class DiscordUtils:
    """Utility class for Discord-related helper functions."""

    @staticmethod
    async def sleep(ms: float) -> None:
        """
        Wait for a specified number of milliseconds.

        Args:
            ms: Milliseconds to wait
        """
        await asyncio.sleep(ms / 1000)

    @staticmethod
    async def safe_delete(message: Any) -> bool:
        """
        Safely delete a message (suppress errors).

        Args:
            message: Discord message

        Returns:
            True if deleted successfully, False otherwise
        """
        if not message or not hasattr(message, "delete"):
            return False
        try:
            await message.delete()
            return True
        except Exception:
            return False

    @staticmethod
    async def safe_send(channel: Any, content: str) -> Optional[Any]:
        """
        Safely send a message to a channel (suppress errors).

        Args:
            channel: Discord channel
            content: Message content

        Returns:
            Sent message or None if failed
        """
        if not channel or not hasattr(channel, "send"):
            return None
        try:
            return await channel.send(content)
        except Exception:
            return None

    @staticmethod
    def format_duration(seconds: int) -> str:
        """
        Format duration in human readable format.

        Args:
            seconds: Duration in seconds

        Returns:
            Formatted duration string
        """
        if seconds < 60:
            return f"{seconds}s"
        if seconds < 3600:
            mins = seconds // 60
            secs = seconds % 60
            return f"{mins}m {secs}s"
        hours = seconds // 3600
        mins = (seconds % 3600) // 60
        return f"{hours}h {mins}m"

    @staticmethod
    def format_number(num: Any) -> str:
        """
        Format number with commas.

        Args:
            num: Number to format

        Returns:
            Formatted number string
        """
        if not isinstance(num, (int, float)):
            return str(num)
        return REGEX["NUMBER_FORMAT"].sub(",", str(num))

    @staticmethod
    async def send_slash_and_wait(
        channel: Any,
        bot_id: str,
        command: str,
        options: Optional[Dict[str, Any]] = None,
        timeout_ms: int = 15 * 60 * 1000,
        client: Any = None,
    ) -> Any:
        """
        Send slash command and wait for bot response.

        Args:
            channel: Discord channel
            bot_id: Target bot ID (application_id)
            command: Slash command name
            options: Command options as keyword arguments
            timeout_ms: Timeout in milliseconds
            client: Discord client (Bot instance) for event listening

        Returns:
            Bot response message

        Raises:
            Exception: If failed to send or timeout
        """
        import discord

        options = options or {}
        bot_id_int = int(bot_id)

        # Get all application commands from the channel
        commands = await channel.application_commands()

        # Find the slash command by name and application_id
        slash_cmd = None
        for cmd in commands:
            if (
                cmd.name == command
                and cmd.application_id == bot_id_int
                and isinstance(cmd, discord.SlashCommand)
            ):
                slash_cmd = cmd
                break

        if not slash_cmd:
            raise Exception(f"Slash command '{command}' not found for bot {bot_id}")

        # Use provided client, or try to get from channel's guild
        if not client:
            if hasattr(channel, 'guild') and channel.guild:
                client = getattr(channel.guild, '_state', None)
                if hasattr(client, '_get_client'):
                    client = client._get_client()
            if not client:
                client = getattr(channel, '_state', None)
                if hasattr(client, '_get_client'):
                    client = client._get_client()

        future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()

        async def on_message(message: Any) -> None:
            if (
                str(message.author.id) == bot_id
                and message.channel.id == channel.id
                and not future.done()
            ):
                if client:
                    client.remove_listener(on_message, "on_message")
                future.set_result(message)

        # Set up timeout
        async def timeout_handler() -> None:
            await asyncio.sleep(timeout_ms / 1000)
            if not future.done():
                if client:
                    client.remove_listener(on_message, "on_message")
                future.set_exception(Exception("Timeout waiting for bot response"))

        if client:
            client.add_listener(on_message, "on_message")

        asyncio.create_task(timeout_handler())

        # Invoke the slash command
        await slash_cmd(channel, **options)

        return await future

    @staticmethod
    async def wait_for_bot_response(
        original_message: Any,
        bot_id: str,
        timeout_ms: int = 30000,
    ) -> Any:
        """
        Wait for bot response to a message.

        Args:
            original_message: Original message
            bot_id: Target bot ID
            timeout_ms: Timeout in milliseconds

        Returns:
            Bot response message

        Raises:
            Exception: If timeout waiting for response
        """
        future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()

        # Get client from message - in discord.py-self, _state is the client
        client = getattr(original_message, '_state', None)
        if not client and hasattr(original_message, 'channel'):
            client = getattr(original_message.channel, '_state', None)

        if not client:
            raise Exception("Could not get client from message")

        async def on_message(message: Any) -> None:
            if (
                str(message.author.id) == bot_id
                and message.channel.id == original_message.channel.id
                and not future.done()
            ):
                client.remove_listener(on_message, "on_message")
                future.set_result(message)

        # Set up timeout
        async def timeout_handler() -> None:
            await asyncio.sleep(timeout_ms / 1000)
            if not future.done():
                client.remove_listener(on_message, "on_message")
                future.set_exception(Exception("Timeout waiting for bot response"))

        client.add_listener(on_message, "on_message")
        asyncio.create_task(timeout_handler())

        return await future

    @staticmethod
    def parse_hp(content: str) -> Optional[Dict[str, int]]:
        """
        Parse HP from bot response content.

        Args:
            content: Message content

        Returns:
            HP data {current, max} or None
        """
        match = REGEX["HP"].search(content)
        if not match:
            return None

        current = int(match.group(1))
        max_hp = int(match.group(2))

        # Validate parsed numbers
        if current < 0 or max_hp <= 0:
            return None

        return {"current": current, "max": max_hp}

    @staticmethod
    def parse_cooldown(title: str) -> Optional[int]:
        """
        Parse cooldown duration from title.

        Args:
            title: Embed title

        Returns:
            Cooldown in milliseconds or None
        """
        # Match: "wait at least **1h 2m 3s**" or "wait at least 1h 2m 3s"
        match = REGEX["COOLDOWN_HMS"].search(title)
        if match:
            return (int(match.group(1)) * 3600 + int(match.group(2)) * 60 + int(match.group(3))) * 1000

        # Match: "wait at least **2m 3s**" or "wait at least 2m 3s"
        match = REGEX["COOLDOWN_MS"].search(title)
        if match:
            return (int(match.group(1)) * 60 + int(match.group(2))) * 1000

        # Match: "wait at least **3s**" or "wait at least 3s"
        match = REGEX["COOLDOWN_S"].search(title)
        if match:
            return int(match.group(1)) * 1000

        # Fallback pattern
        match = REGEX["COOLDOWN_FALLBACK"].search(title)
        if match:
            return (int(match.group(1)) * 3600 + int(match.group(2)) * 60 + int(match.group(3))) * 1000

        return None

    @staticmethod
    def check_for_cooldown(bot_response: Any) -> int:
        """
        Check if bot response contains a cooldown message.

        Args:
            bot_response: Bot response message

        Returns:
            Cooldown in milliseconds or 0
        """
        embeds = getattr(bot_response, "embeds", None)
        if embeds:
            for embed in embeds:
                title = getattr(embed, "title", "")
                if title and "wait at least" in title:
                    cooldown_ms = DiscordUtils.parse_cooldown(title)
                    if cooldown_ms and cooldown_ms > 0:
                        return cooldown_ms
        return 0

    @staticmethod
    def check_for_epic_guard(bot_response: Any) -> bool:
        """
        Check if bot response is an EPIC Guard captcha.

        Args:
            bot_response: Bot response message

        Returns:
            True if EPIC Guard detected
        """
        # Check content
        content = getattr(bot_response, "content", "")
        if content:
            for phrase in EPIC_GUARD_PHRASES:
                if phrase in content:
                    return True

        # Check embeds
        embeds = getattr(bot_response, "embeds", None)
        if embeds:
            for embed in embeds:
                fields_to_check = [
                    getattr(embed, "title", ""),
                    getattr(embed, "description", ""),
                ]
                for field in getattr(embed, "fields", []) or []:
                    fields_to_check.append(getattr(field, "name", ""))
                    fields_to_check.append(getattr(field, "value", ""))

                for field in fields_to_check:
                    if field:
                        for phrase in EPIC_GUARD_PHRASES:
                            if phrase in field:
                                return True

        return False

    @staticmethod
    async def click_button_and_wait(
        message: Any,
        custom_id: str,
        bot_id: str,
        timeout_ms: int = 15000,
    ) -> Any:
        """
        Click a button and wait for the bot's updated response.

        Args:
            message: Message containing the button
            custom_id: Custom ID of the button to click
            bot_id: Target bot ID
            timeout_ms: Timeout in milliseconds

        Returns:
            Bot response message

        Raises:
            Exception: If timeout or click fails
        """
        future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()

        # Get client from message - in discord.py-self, _state is the client
        client = getattr(message, '_state', None)
        if not client and hasattr(message, 'channel'):
            client = getattr(message.channel, '_state', None)

        if not client:
            raise Exception("Could not get client from message")

        # Find and click the button
        button = None
        if message.components:
            for row in message.components:
                children = getattr(row, "children", []) or getattr(row, "components", [])
                for component in children:
                    if getattr(component, "custom_id", "") == custom_id:
                        button = component
                        break
                if button:
                    break

        if not button:
            raise Exception(f"Button with custom_id '{custom_id}' not found")

        async def on_message_edit(before: Any, after: Any) -> None:
            # Check if this is the same message being updated
            if after.id == message.id and str(after.author.id) == bot_id:
                if not future.done():
                    client.remove_listener(on_message_edit, "on_message_edit")
                    future.set_result(after)

        # Set up timeout
        async def timeout_handler() -> None:
            await asyncio.sleep(timeout_ms / 1000)
            if not future.done():
                client.remove_listener(on_message_edit, "on_message_edit")
                future.set_exception(Exception("Timeout waiting for button response"))

        client.add_listener(on_message_edit, "on_message_edit")
        asyncio.create_task(timeout_handler())

        # Click the button
        try:
            await button.click()
        except Exception as e:
            if not future.done():
                client.remove_listener(on_message_edit, "on_message_edit")
                future.set_exception(e)

        return await future
