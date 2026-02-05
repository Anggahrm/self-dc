"""
Error Handler
Global error handling and reporting
"""

import asyncio
import signal
import sys
import traceback
from typing import Any, Callable, Dict, Optional

from utils.logger import get_logger

logger = get_logger("ErrorHandler")


class ErrorHandler:
    """Global error handler for the bot."""

    def __init__(self):
        self.logger = get_logger("ErrorHandler")
        self.error_counts: Dict[str, int] = {}
        self.circuit_breakers: Dict[str, float] = {}
        self.max_errors_per_minute = 10
        self._cleanup_task: Optional[asyncio.Task] = None

    def initialize(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Initialize global error handlers."""
        if loop is None:
            loop = asyncio.get_event_loop()

        # Set up exception handlers
        loop.set_exception_handler(self._async_exception_handler)

        # Handle signals
        try:
            loop.add_signal_handler(signal.SIGINT, self._signal_handler, signal.SIGINT)
            loop.add_signal_handler(signal.SIGTERM, self._signal_handler, signal.SIGTERM)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

        # Start periodic cleanup
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

        self.logger.info("Error handlers initialized")

    def _signal_handler(self, sig: signal.Signals) -> None:
        """Handle shutdown signals."""
        self.logger.info(f"Received signal {sig.name}, shutting down...")
        asyncio.create_task(self.shutdown())

    def _async_exception_handler(self, loop: asyncio.AbstractEventLoop, context: Dict[str, Any]) -> None:
        """Handle async exceptions."""
        exception = context.get("exception")
        if exception:
            self.handle_exception(exception)
        else:
            message = context.get("message", "Unknown async error")
            self.logger.error(f"Async error: {message}")

    def handle_exception(self, error: Exception, context: str = "") -> bool:
        """
        Handle an exception.

        Args:
            error: The exception that occurred
            context: Optional context string

        Returns:
            True if error count exceeded threshold (circuit broken)
        """
        error_key = f"{context}:{type(error).__name__}"

        # Log the error
        if context:
            self.logger.error(f"[{context}] {error}")
        else:
            self.logger.error(f"{error}")

        # Log traceback for debugging
        self.logger.debug(f"Traceback:\n{traceback.format_exc()}")

        # Update error count
        count = self.error_counts.get(error_key, 0) + 1
        self.error_counts[error_key] = count

        # Check if we should circuit break
        if count >= self.max_errors_per_minute:
            self.logger.warning(f"Circuit breaker triggered for: {error_key}")
            self.circuit_breakers[error_key] = asyncio.get_event_loop().time() + 60  # Block for 1 minute
            return True

        return False

    def is_circuit_broken(self, context: str) -> bool:
        """Check if a context is circuit broken."""
        break_until = self.circuit_breakers.get(context)
        if not break_until:
            return False

        if asyncio.get_event_loop().time() > break_until:
            # Circuit breaker expired
            del self.circuit_breakers[context]
            self.error_counts.pop(context, None)
            return False

        return True

    async def _periodic_cleanup(self) -> None:
        """Periodically clean up error counts."""
        while True:
            try:
                await asyncio.sleep(60)  # Clean up every minute
                self._cleanup_error_counts()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.debug(f"Cleanup error: {e}")

    def _cleanup_error_counts(self) -> None:
        """Clean up old error counts."""
        if self.error_counts:
            self.logger.debug("Error counts cleaned up")
        self.error_counts.clear()

    def wrap(self, context: str):
        """Decorator to wrap a function with error handling."""
        def decorator(func: Callable) -> Callable:
            async def wrapper(*args, **kwargs):
                if self.is_circuit_broken(context):
                    raise RuntimeError(f"Circuit breaker active for: {context}")

                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    self.handle_exception(e, context)
                    raise
            return wrapper
        return decorator

    async def shutdown(self) -> None:
        """Clean shutdown."""
        self.logger.info("Shutting down error handler...")

        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Clear error counts
        self.error_counts.clear()
        self.circuit_breakers.clear()

    def log_system_state(self) -> None:
        """Log current system state."""
        import psutil

        process = psutil.Process()
        memory = process.memory_info()

        self.logger.info(
            "System state: "
            f"memory={memory.rss / 1024 / 1024:.1f}MB, "
            f"errors={len(self.error_counts)}, "
            f"circuits={len(self.circuit_breakers)}"
        )


# Global error handler instance
_error_handler: Optional[ErrorHandler] = None


def get_error_handler() -> ErrorHandler:
    """Get the global error handler instance."""
    global _error_handler
    if _error_handler is None:
        _error_handler = ErrorHandler()
    return _error_handler


def setup_error_handler(loop: Optional[asyncio.AbstractEventLoop] = None) -> ErrorHandler:
    """Set up the global error handler."""
    handler = get_error_handler()
    handler.initialize(loop)
    return handler
