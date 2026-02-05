"""
Command Registry
Centralized command registration and management
"""

from typing import Any, Callable, Dict, List, Optional

from utils.logger import get_logger

# Command handler type alias
CommandHandler = Callable[[Any, List[str], Any], Any]


class CommandDefinition:
    """Definition of a command."""

    def __init__(
        self,
        name: str,
        description: str = "",
        category: str = "General",
        aliases: Optional[List[str]] = None,
        args: Optional[List[Dict[str, Any]]] = None,
        examples: Optional[List[str]] = None,
        guild_only: bool = False,
    ):
        self.name = name
        self.description = description
        self.category = category
        self.aliases = aliases or []
        self.args = args or []
        self.examples = examples or []
        self.guild_only = guild_only


class Command:
    """Registered command with definition and handler."""

    def __init__(self, definition: CommandDefinition, handler: CommandHandler):
        self.definition = definition
        self.handler = handler

    @property
    def name(self) -> str:
        return self.definition.name

    @property
    def description(self) -> str:
        return self.definition.description

    @property
    def category(self) -> str:
        return self.definition.category

    @property
    def aliases(self) -> List[str]:
        return self.definition.aliases

    @property
    def args(self) -> List[Dict[str, Any]]:
        return self.definition.args

    @property
    def examples(self) -> List[str]:
        return self.definition.examples

    @property
    def guild_only(self) -> bool:
        return self.definition.guild_only


class CommandRegistry:
    """Centralized command registration and management."""

    def __init__(self):
        self.logger = get_logger("CommandRegistry")
        self.commands: Dict[str, Command] = {}
        self.aliases: Dict[str, str] = {}
        self.categories: Dict[str, List[Command]] = {}

    def register(
        self,
        config: Dict[str, Any],
        handler: CommandHandler,
    ) -> "CommandRegistry":
        """
        Register a command.

        Args:
            config: Command configuration dict with keys:
                - name: Command name (required)
                - description: Command description
                - category: Command category
                - aliases: List of aliases
                - args: List of argument definitions
                - examples: List of example usages
                - guild_only: Whether command requires guild
            handler: Async function to handle the command

        Returns:
            Self for chaining
        """
        definition = CommandDefinition(
            name=config["name"],
            description=config.get("description", ""),
            category=config.get("category", "General"),
            aliases=config.get("aliases", []),
            args=config.get("args", []),
            examples=config.get("examples", []),
            guild_only=config.get("guild_only", False),
        )

        command = Command(definition, handler)

        # Register main command
        self.commands[definition.name.lower()] = command

        # Register aliases
        for alias in definition.aliases:
            self.aliases[alias.lower()] = definition.name.lower()

        # Add to category
        if definition.category not in self.categories:
            self.categories[definition.category] = []
        self.categories[definition.category].append(command)

        self.logger.debug(f"Registered command: {definition.name}")
        return self

    def get(self, name: str) -> Optional[Command]:
        """
        Get a command by name or alias.

        Args:
            name: Command name or alias

        Returns:
            Command or None if not found
        """
        normalized = name.lower()

        # Check direct command
        if normalized in self.commands:
            return self.commands[normalized]

        # Check alias
        alias_target = self.aliases.get(normalized)
        if alias_target:
            return self.commands.get(alias_target)

        return None

    def has(self, name: str) -> bool:
        """
        Check if command exists.

        Args:
            name: Command name

        Returns:
            True if command exists
        """
        normalized = name.lower()
        return normalized in self.commands or normalized in self.aliases

    def find_by_alias(self, alias: str) -> Optional[Command]:
        """
        Find a command by its alias.

        Args:
            alias: Alias to look up

        Returns:
            Command or None if not found
        """
        normalized = alias.lower()
        target = self.aliases.get(normalized)
        if target:
            return self.commands.get(target)
        return None

    def get_by_category(self, category: str) -> List[Command]:
        """
        Get all commands in a category.

        Args:
            category: Category name

        Returns:
            List of commands in the category
        """
        return self.categories.get(category, [])

    def get_categories(self) -> List[str]:
        """
        Get all category names.

        Returns:
            List of category names
        """
        return list(self.categories.keys())

    def get_all(self) -> List[Command]:
        """
        Get all registered commands.

        Returns:
            List of all commands
        """
        return list(self.commands.values())

    def generate_help(self) -> str:
        """
        Generate help text for all commands.

        Returns:
            Formatted help string
        """
        lines = [
            "📖 **Self Bot Commands**",
            "",
        ]

        for category, commands in self.categories.items():
            icon = self._get_category_icon(category)
            lines.append(f"**{icon} {category}:**")

            for cmd in commands:
                aliases_str = f" ({', '.join(cmd.aliases)})" if cmd.aliases else ""
                lines.append(f"• `{cmd.name}`{aliases_str} - {cmd.description}")

            lines.append("")

        return "\n".join(lines)

    def generate_command_help(self, name: str) -> Optional[str]:
        """
        Generate detailed help for a specific command.

        Args:
            name: Command name

        Returns:
            Formatted help string or None if command not found
        """
        cmd = self.get(name)
        if not cmd:
            return None

        lines = [
            f"📖 **Command:** `{cmd.name}`",
            "",
            f"**Description:** {cmd.description}",
        ]

        if cmd.aliases:
            aliases_formatted = ", ".join(f"`{a}`" for a in cmd.aliases)
            lines.append(f"**Aliases:** {aliases_formatted}")

        if cmd.args:
            lines.append("**Arguments:**")
            for arg in cmd.args:
                required = "*" if arg.get("required") else ""
                lines.append(f"  • `{arg['name']}`{required} - {arg.get('description', '')}")

        if cmd.examples:
            lines.append("**Examples:**")
            for example in cmd.examples:
                lines.append(f"  • `{example}`")

        return "\n".join(lines)

    def _get_category_icon(self, category: str) -> str:
        """
        Get icon for a category.

        Args:
            category: Category name

        Returns:
            Icon emoji or bullet
        """
        icons = {
            "Farm": "🌾",
            "Events": "🎯",
            "Voice": "🎤",
            "Debug": "🔍",
            "Enchant": "✨",
            "General": "📋",
        }
        return icons.get(category, "•")


# Singleton instance
registry = CommandRegistry()
