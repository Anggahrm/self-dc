"""
Logging utilities for the Discord self-bot.
Uses Rich for colored console output.
"""

import logging
import sys
from typing import Optional

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme

# Custom theme for logging
CUSTOM_THEME = Theme({
    "logging.level.success": "green",
    "logging.level.command": "cyan",
    "logging.level.debug": "dim cyan",
})

console = Console(theme=CUSTOM_THEME)


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for different log levels."""

    COLORS = {
        "DEBUG": "dim cyan",
        "INFO": "blue",
        "WARNING": "yellow",
        "ERROR": "red",
        "SUCCESS": "green",
        "CRITICAL": "bold red",
    }

    def format(self, record: logging.LogRecord) -> str:
        # Add color to level name
        level_color = self.COLORS.get(record.levelname, "white")
        record.levelname_colored = f"[{level_color}]{record.levelname}[/{level_color}]"
        return super().format(record)


def setup_logging(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    Set up a logger with RichHandler.

    Args:
        name: Logger name
        level: Logging level (default: INFO)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    if level is None:
        level = logging.INFO

    logger.setLevel(level)

    # Remove existing handlers
    logger.handlers = []

    # Create RichHandler
    handler = RichHandler(
        console=console,
        show_time=True,
        show_path=False,
        rich_tracebacks=True,
    )
    handler.setLevel(level)

    # Set formatter
    formatter = logging.Formatter(
        fmt="[%(asctime)s] [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    return logger


class CustomLogger:
    """Custom logger wrapper with success method."""

    def __init__(self, name: str):
        self._logger = setup_logging(name)

    def debug(self, message: str, **kwargs) -> None:
        """Log debug message."""
        self._logger.debug(message, extra=kwargs)

    def info(self, message: str, **kwargs) -> None:
        """Log info message."""
        self._logger.info(message, extra=kwargs)

    def warning(self, message: str, **kwargs) -> None:
        """Log warning message."""
        self._logger.warning(message, extra=kwargs)

    def error(self, message: str, **kwargs) -> None:
        """Log error message."""
        self._logger.error(message, extra=kwargs)

    def success(self, message: str, **kwargs) -> None:
        """Log success message (custom level)."""
        self._logger.info(f"[SUCCESS] {message}", extra=kwargs)

    def exception(self, message: str, **kwargs) -> None:
        """Log exception with traceback."""
        self._logger.exception(message, extra=kwargs)


# Convenience function
def get_logger(name: str) -> CustomLogger:
    """Get a logger instance with success method."""
    return CustomLogger(name)
