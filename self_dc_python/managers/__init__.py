"""
Manager modules for the Discord self-bot.
"""

from .base_manager import BaseManager
from .event_handler import EventHandler
from .debug_manager import DebugManager
from .farm_manager import FarmManager
from .auto_enchant_manager import AutoEnchantManager

__all__ = ["BaseManager", "EventHandler", "DebugManager", "FarmManager", "AutoEnchantManager"]
