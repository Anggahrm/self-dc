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
        options: Optional[List[str]] = None,
        timeout_ms: int = 15 * 60 * 1000,
    ) -> Any:
        """
        Send slash command and wait for bot response.

        Args:
            channel: Discord channel
            bot_id: Target bot ID
            command: Slash command name
            options: Command options
            timeout_ms: Timeout in milliseconds

        Returns:
            Bot response message

        Raises:
            Exception: If failed to send or timeout
        """
        options = options or []

        # Note: discord.py-self uses different API for slash commands
        # This is a placeholder that should be adapted based on the library's API
        slash_response = await channel.send_slash(bot_id, command, *options)

        if not slash_response:
            raise Exception("Failed to send slash command")

        # Check if bot is "thinking" (deferred response)
        if hasattr(slash_response, "flags") and "LOADING" in (slash_response.flags or []):
            future: asyncio.Future[Any] = asyncio.get_event_loop().create_future()

            def on_update(old_msg: Any, new_msg: Any) -> None:
                if old_msg.id == slash_response.id and not future.done():
                    channel.client.off("messageUpdate", on_update)
                    future.set_result(new_msg)

            # Set up timeout
            async def timeout_handler() -> None:
                await asyncio.sleep(timeout_ms / 1000)
                if not future.done():
                    channel.client.off("messageUpdate", on_update)
                    future.set_exception(Exception("Timeout waiting for deferred bot response"))

            asyncio.create_task(timeout_handler())
            channel.client.on("messageUpdate", on_update)

            return await future

        return slash_response

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
        client = original_message.client

        def on_message(message: Any) -> None:
            if message.author.id == bot_id and message.channel.id == original_message.channel.id:
                # Skip "thinking" messages
                if hasattr(message, "flags") and "LOADING" in (message.flags or []):
                    return

                if not future.done():
                    cleanup()
                    future.set_result(message)

        def on_update(old_msg: Any, new_msg: Any) -> None:
            if new_msg.author.id == bot_id and new_msg.channel.id == original_message.channel.id:
                # Handle transition from "thinking" to actual response
                old_flags = getattr(old_msg, "flags", []) or []
                new_flags = getattr(new_msg, "flags", []) or []
                if "LOADING" in old_flags and "LOADING" not in new_flags:
                    if not future.done():
                        cleanup()
                        future.set_result(new_msg)

        def cleanup() -> None:
            client.off("messageCreate", on_message)
            client.off("messageUpdate", on_update)

        # Set up timeout
        async def timeout_handler() -> None:
            await asyncio.sleep(timeout_ms / 1000)
            if not future.done():
                cleanup()
                future.set_exception(Exception("Timeout waiting for bot response"))

        asyncio.create_task(timeout_handler())
        client.on("messageCreate", on_message)
        client.on("messageUpdate", on_update)

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

        def on_update(old_msg: Any, new_msg: Any) -> None:
            # Check if this is the same message being updated by the bot
            if new_msg.id == message.id and new_msg.author.id == bot_id:
                if not future.done():
                    message.client.off("messageUpdate", on_update)
                    future.set_result(new_msg)

        # Set up timeout
        async def timeout_handler() -> None:
            await asyncio.sleep(timeout_ms / 1000)
            if not future.done():
                message.client.off("messageUpdate", on_update)
                future.set_exception(Exception("Timeout waiting for button response"))

        asyncio.create_task(timeout_handler())
        message.client.on("messageUpdate", on_update)

        # Click the button after setting up the listener
        try:
            await message.click_button(custom_id)
        except Exception as e:
            if not future.done():
                message.client.off("messageUpdate", on_update)
                future.set_exception(e)

        return await future
