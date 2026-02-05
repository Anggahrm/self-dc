"""
Base Manager
Abstract base class for all managers to ensure consistent patterns
"""

import asyncio
from typing import Any, Callable, Dict, Optional, TypeVar

from self_dc_python.utils.logger import LoggerMixin

T = TypeVar('T')


class BaseManager(LoggerMixin):
    """Base class for all managers with timer management and cleanup."""

    def __init__(self, client: Any, name: str):
        super().__init__(name)
        self.client = client
        self.enabled = False
        self.channel: Optional[Any] = None
        self.pending_messages: Dict[str, Dict[str, Any]] = {}
        self.timers: Dict[str, asyncio.Task] = {}

    def set_enabled(self, enabled: bool) -> None:
        """Enable/disable the manager."""
        self.enabled = enabled
        self.info(f"{self.__class__.__name__} {'Enabled' if enabled else 'Disabled'}")

    def is_enabled(self) -> bool:
        """Check if manager is enabled."""
        return self.enabled

    def set_channel(self, channel: Any) -> None:
        """Set current channel."""
        self.channel = channel

    def register_pending_message(
        self,
        message_id: str,
        message: Any,
        on_resolve: Optional[Callable[[T], None]] = None,
        timeout_ms: int = 900000
    ) -> Callable[[T], None]:
        """
        Register a pending message with automatic cleanup.

        Args:
            message_id: Message ID to track
            message: Message object
            on_resolve: Callback when resolved
            timeout_ms: Timeout in milliseconds

        Returns:
            Resolver function to call when message is resolved
        """
        # Clean up any existing entry for this message
        self.cleanup_pending_message(message_id)

        def cleanup() -> None:
            self.cleanup_pending_message(message_id)

        # Set up the resolver
        def resolver(result: T) -> None:
            cleanup()
            if on_resolve:
                on_resolve(result)

        # Store with cleanup function
        self.pending_messages[message_id] = {
            "message": message,
            "resolver": resolver,
            "cleanup": cleanup,
            "timeout_task": None,
        }

        # Auto-cleanup after timeout
        async def timeout_task() -> None:
            try:
                await asyncio.sleep(timeout_ms / 1000)
                if message_id in self.pending_messages:
                    self.debug(f"Pending message {message_id} timed out")
                    cleanup()
            except asyncio.CancelledError:
                pass

        # Create and store the timeout task
        task = asyncio.create_task(timeout_task())
        self.pending_messages[message_id]["timeout_task"] = task

        return resolver

    def cleanup_pending_message(self, message_id: str) -> None:
        """Clean up a pending message."""
        entry = self.pending_messages.pop(message_id, None)
        if entry and entry.get("timeout_task"):
            task = entry["timeout_task"]
            if not task.done():
                task.cancel()

    def set_managed_timer(
        self,
        name: str,
        callback: Callable[[], Any],
        delay_ms: int
    ) -> asyncio.Task:
        """
        Set a managed timer (auto-cleanup on stop).

        Args:
            name: Timer name
            callback: Async or sync callback to execute
            delay_ms: Delay in milliseconds

        Returns:
            The created task
        """
        # Clear existing timer if any
        self.clear_managed_timer(name)

        async def timer_task() -> None:
            try:
                await asyncio.sleep(delay_ms / 1000)
                self.timers.pop(name, None)
                try:
                    result = callback()
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    self.error(f"Timer {name} error: {e}")
            except asyncio.CancelledError:
                pass

        task = asyncio.create_task(timer_task())
        self.timers[name] = task
        return task

    def clear_managed_timer(self, name: str) -> None:
        """Clear a managed timer."""
        task = self.timers.pop(name, None)
        if task and not task.done():
            task.cancel()

    def clear_all_timers(self) -> None:
        """Clear all managed timers."""
        for name, task in list(self.timers.items()):
            if not task.done():
                task.cancel()
            self.debug(f"Cleared timer: {name}")
        self.timers.clear()

    def cleanup(self) -> None:
        """Clean up all resources."""
        self.info("Cleaning up...")

        # Clear all pending messages
        for message_id, entry in list(self.pending_messages.items()):
            if entry.get("timeout_task") and not entry["timeout_task"].done():
                entry["timeout_task"].cancel()
        self.pending_messages.clear()

        # Clear all timers
        self.clear_all_timers()

        self.enabled = False
