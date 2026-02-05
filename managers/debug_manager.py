"""
Debug Manager
Handles debug commands and bot message inspection
"""

import re
from typing import Any, Dict, List, Optional

from managers.base_manager import BaseManager
from utils.discord import DiscordUtils

# Epic RPG Bot ID
EPIC_RPG_BOT_ID = "555955826880413696"

# Timeouts (in milliseconds)
TIMEOUTS = {
    "FARM_COMMAND": 15000,
    "EVENT_RESPONSE": 10000,
    "DEBUG_COMMAND": 15000,
    "DEFERRED_RESPONSE": 900000,  # 15 minutes
    "THINKING_CLEANUP": 900000,
}


class DebugManager(BaseManager):
    """Handles debug commands and bot message inspection."""

    def __init__(self, client: Any):
        super().__init__(client, "Debug")
        self._debug_mode: bool = False
        self._logged_messages: List[Dict[str, Any]] = []
        self._max_log_size: int = 1000

    @property
    def debug_mode(self) -> bool:
        """Get current debug mode status."""
        return self._debug_mode

    def toggle_debug(self, enabled: Optional[bool] = None) -> bool:
        """
        Toggle debug mode on/off.

        Args:
            enabled: Optional explicit state, toggles if not provided

        Returns:
            New debug mode state
        """
        if enabled is None:
            self._debug_mode = not self._debug_mode
        else:
            self._debug_mode = enabled

        self.logger.info(f"Debug mode {'enabled' if self._debug_mode else 'disabled'}")
        return self._debug_mode

    async def handle_debug_command(self, message: Any) -> bool:
        """
        Handle debug command from user.

        Args:
            message: Discord message object

        Returns:
            True if command was handled
        """
        await self._safe_delete(message)

        content = message.content.lower().strip()

        # Debug a replied message
        if message.reference and message.reference.message_id:
            return await self._debug_replied_message(message)

        # Debug a slash command
        if content.startswith(".debug "):
            command = content[7:].strip()
            if command:
                return await self._debug_slash_command(message, command)

        # Show usage
        await self._send_usage(message.channel)
        return True

    async def _debug_replied_message(self, message: Any) -> bool:
        """
        Debug a replied message.

        Args:
            message: Discord message object with reference

        Returns:
            True if handled successfully
        """
        try:
            replied_message = await message.channel.fetch_message(
                message.reference.message_id
            )

            if str(replied_message.author.id) != EPIC_RPG_BOT_ID:
                await self._safe_send(
                    message.channel,
                    "❌ Can only debug messages from EPIC RPG bot"
                )
                return True

            await self._safe_send(message.channel, "🔍 **Debugging replied message...**")
            await self.format_bot_message(message.channel, replied_message)
            return True

        except Exception as e:
            await self._safe_send(message.channel, f"❌ Error: {e}")
            return True

    async def _debug_slash_command(self, message: Any, command: str) -> bool:
        """
        Debug a slash command.

        Args:
            message: Discord message object
            command: Command to debug

        Returns:
            True if handled successfully
        """
        try:
            await self._safe_send(
                message.channel,
                f"🔍 **Executing debug command:** `{command}`"
            )

            # Send slash command and wait for response
            response = await DiscordUtils.send_slash_and_wait(
                message.channel,
                EPIC_RPG_BOT_ID,
                command,
                {},
                TIMEOUTS["DEBUG_COMMAND"],
                client=self.client,
            )

            if response:
                await self._safe_send(
                    message.channel,
                    "✅ **Bot responded! Debugging...**"
                )
                await self.format_bot_message(message.channel, response)
            else:
                await self._safe_send(message.channel, "❌ No response from bot")

        except Exception as e:
            if "timeout" in str(e).lower():
                await self._safe_send(
                    message.channel,
                    "⏱️ Bot response timeout (15s)"
                )
            else:
                await self._safe_send(message.channel, f"❌ Error: {e}")

        return True

    async def _send_usage(self, channel: Any) -> None:
        """
        Send debug usage information.

        Args:
            channel: Discord channel object
        """
        usage = (
            "📖 **Debug Usage:**\n"
            "• `.debug <command>` - Debug a slash command response\n"
            "• Reply to a bot message with `.debug` - Debug that message"
        )
        await self._safe_send(channel, usage)

    async def log_message(self, message: Any) -> None:
        """
        Log a message for debugging purposes.

        Args:
            message: Discord message object to log
        """
        if not self._debug_mode:
            return

        log_entry = {
            "id": str(message.id),
            "author_id": str(message.author.id) if message.author else None,
            "author_name": message.author.name if message.author else None,
            "content": message.content,
            "channel_id": str(message.channel.id) if message.channel else None,
            "embeds_count": len(message.embeds) if message.embeds else 0,
            "components_count": len(message.components) if message.components else 0,
        }

        self._logged_messages.append(log_entry)

        # Trim log if it gets too large
        if len(self._logged_messages) > self._max_log_size:
            self._logged_messages = self._logged_messages[-self._max_log_size:]

        self.logger.debug(f"Logged message {message.id} from {log_entry['author_name']}")

    async def log_bot_debug_info(self, message: Any) -> None:
        """
        Log bot debug info when debug mode is enabled.

        Args:
            message: Discord message object
        """
        if not self.enabled:
            return

        # Handle "thinking" messages (deferral in discord.py)
        if message.flags and message.flags.ephemeral:
            await self._safe_send(
                message.channel,
                "🔄 **[DEBUG]** Bot is thinking..."
            )

            # Use BaseManager's registerPendingMessage for proper cleanup
            resolver = self.register_pending_message(
                str(message.id),
                message,
                lambda new_msg: self._on_debug_thinking_resolved(message.channel, new_msg),
                TIMEOUTS["THINKING_CLEANUP"]
            )

            # Set up the event listener
            async def on_update(old_msg, new_msg):
                if str(old_msg.id) == str(message.id):
                    resolver(new_msg)

            self.client.add_listener(on_update, "on_message_edit")

            # Clean up listener when resolved
            entry = self.pending_messages.get(str(message.id))
            if entry:
                original_cleanup = entry.get("cleanup")

                def cleanup_wrapper():
                    self.client.remove_listener(on_update, "on_message_edit")
                    if original_cleanup:
                        original_cleanup()

                entry["cleanup"] = cleanup_wrapper

            return

        await self.format_bot_message(message.channel, message)

    def _on_debug_thinking_resolved(self, channel: Any, new_msg: Any) -> None:
        """Callback when a thinking message is resolved in debug mode."""
        import asyncio
        asyncio.create_task(self._send_debug_thinking_complete(channel, new_msg))

    async def _send_debug_thinking_complete(self, channel: Any, new_msg: Any) -> None:
        """Send debug info after thinking is complete."""
        await self._safe_send(
            channel,
            "✅ **[DEBUG]** Bot finished thinking:"
        )
        await self.format_bot_message(channel, new_msg)

    async def format_bot_message(self, channel: Any, message: Any) -> None:
        """
        Format and send bot message debug info.

        Args:
            channel: Discord channel to send to
            message: Discord message object to format
        """
        try:
            # Content
            if message.content and message.content.strip():
                await self._safe_send(
                    channel,
                    f"**[DEBUG]** Content:\n```\n{message.content}\n```"
                )

            # Embeds
            if message.embeds:
                for i, embed in enumerate(message.embeds, 1):
                    info = self._format_embed(embed, i)
                    await self._send_chunked(channel, info)

            # Components (buttons)
            if message.components:
                for i, component in enumerate(message.components, 1):
                    info = self._format_components(component, i)
                    await self._send_chunked(channel, info)

            # Metadata
            metadata = self._format_metadata(message)
            await self._safe_send(channel, metadata)

            # Empty message warning
            if (
                not message.content or not message.content.strip()
            ) and not message.embeds and not message.components:
                await self._safe_send(
                    channel,
                    "⚠️ **[DEBUG]** Message has no content/embeds/components"
                )

        except Exception as e:
            self.logger.error(f"Format error: {e}")

    def _format_embed(self, embed: Any, index: int) -> str:
        """
        Format embed for display.

        Args:
            embed: Discord embed object
            index: Embed index

        Returns:
            Formatted string
        """
        info = f"**[DEBUG]** Embed {index}:\n"

        if getattr(embed, "title", None):
            info += f"**Title:** {embed.title}\n"
        if getattr(embed, "description", None):
            info += f"**Description:** {embed.description}\n"
        if getattr(embed, "color", None):
            info += f"**Color:** {embed.color}\n"
        if getattr(embed, "author", None):
            author_name = getattr(embed.author, "name", "N/A") or "N/A"
            info += f"**Author:** {author_name}\n"
        if getattr(embed, "footer", None):
            footer_text = getattr(embed.footer, "text", "N/A") or "N/A"
            info += f"**Footer:** {footer_text}\n"
        if getattr(embed, "timestamp", None):
            info += f"**Timestamp:** {embed.timestamp}\n"

        fields = getattr(embed, "fields", None)
        if fields:
            info += f"**Fields ({len(fields)}):**\n"
            for idx, field in enumerate(fields, 1):
                field_name = getattr(field, "name", "")
                field_value = getattr(field, "value", "")
                info += f"  {idx}. **{field_name}:** {field_value}\n"

        return info

    def _format_components(self, row: Any, row_index: int) -> str:
        """
        Format components for display.

        Args:
            row: Component row object
            row_index: Row index

        Returns:
            Formatted string
        """
        info = f"**[DEBUG]** Button Row {row_index}:\n"

        components = getattr(row, "children", []) or getattr(row, "components", [])
        if components:
            info += f"**Total Buttons:** {len(components)}\n"

            for idx, comp in enumerate(components, 1):
                info += f"**Button {idx}:**\n"
                info += f"  - Type: {getattr(comp, 'type', 'Unknown')}\n"
                info += f"  - Style: {getattr(comp, 'style', 'Unknown')}\n"
                info += f"  - Label: {getattr(comp, 'label', 'No Label') or 'No Label'}\n"
                info += f"  - Custom ID: {getattr(comp, 'custom_id', 'No Custom ID') or 'No Custom ID'}\n"
                info += f"  - Disabled: {getattr(comp, 'disabled', False)}\n"

                emoji = getattr(comp, "emoji", None)
                if emoji:
                    emoji_name = getattr(emoji, "name", None)
                    emoji_id = getattr(emoji, "id", None)
                    info += f"  - Emoji: {emoji_name or emoji_id or 'Unknown'}\n"

                if getattr(comp, "url", None):
                    info += f"  - URL: {comp.url}\n"

                info += "\n"

        return info

    def _format_metadata(self, message: Any) -> str:
        """
        Format message metadata.

        Args:
            message: Discord message object

        Returns:
            Formatted string
        """
        info = "**[DEBUG]** Metadata:\n"
        info += f"**Message ID:** {message.id}\n"

        if message.author:
            info += f"**Author:** {message.author.name} ({message.author.id})\n"

        if message.channel:
            channel_name = getattr(message.channel, "name", None) or str(message.channel.id)
            info += f"**Channel:** {channel_name}\n"

        info += f"**Timestamp:** {message.created_at}\n"
        info += f"**Has Content:** {bool(message.content)}\n"
        info += f"**Has Embeds:** {bool(message.embeds)}\n"
        info += f"**Has Components:** {bool(message.components)}"

        if message.flags:
            flags_value = int(message.flags) if hasattr(message.flags, "value") else 0
            info += f"\n**Flags:** {flags_value}"

        return info

    async def _send_chunked(self, channel: Any, text: str) -> None:
        """
        Send message in chunks if too long.

        Args:
            channel: Discord channel to send to
            text: Text to send
        """
        if len(text) <= 1900:
            await self._safe_send(channel, text)
            return

        # Split into chunks
        chunks = []
        while text:
            if len(text) <= 1900:
                chunks.append(text)
                break
            # Find a good break point
            chunk = text[:1900]
            last_newline = chunk.rfind("\n")
            if last_newline > 0:
                chunk = chunk[:last_newline]
            chunks.append(chunk)
            text = text[len(chunk):]

        for chunk in chunks:
            await self._safe_send(channel, chunk)

    async def _safe_send(self, channel: Any, content: str) -> Optional[Any]:
        """
        Safely send a message to a channel.

        Args:
            channel: Discord channel object
            content: Message content

        Returns:
            Sent message or None
        """
        try:
            return await channel.send(content)
        except Exception as e:
            self.logger.error(f"Failed to send message: {e}")
            return None

    async def _safe_delete(self, message: Any) -> bool:
        """
        Safely delete a message.

        Args:
            message: Discord message to delete

        Returns:
            True if deleted successfully
        """
        try:
            await message.delete()
            return True
        except Exception:
            return False

    def get_stats(self) -> Dict[str, Any]:
        """
        Get debug manager statistics.

        Returns:
            Dict with debug statistics
        """
        return {
            "debug_mode": self._debug_mode,
            "enabled": self.enabled,
            "logged_messages_count": len(self._logged_messages),
            "max_log_size": self._max_log_size,
        }

    def clear_logs(self) -> None:
        """Clear all logged messages."""
        self._logged_messages.clear()
        self.logger.debug("Message logs cleared")

    def get_logged_messages(
        self,
        limit: Optional[int] = None,
        author_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get logged messages with optional filtering.

        Args:
            limit: Maximum number of messages to return
            author_id: Filter by author ID

        Returns:
            List of logged message entries
        """
        messages = self._logged_messages

        if author_id:
            messages = [m for m in messages if m.get("author_id") == author_id]

        if limit:
            messages = messages[-limit:]

        return messages
