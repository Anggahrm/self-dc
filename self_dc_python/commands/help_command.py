"""
Help Command
Shows available commands and command details
"""

from typing import Any, List, Optional


# Command registry for help generation
COMMAND_CATEGORIES = {
    "Farm": {
        "icon": "🌾",
        "commands": [
            (".on farm", "Start auto farm (adventure, axe, hunt with auto-heal)"),
            (".off farm", "Stop auto farm"),
            (".farm status", "Check farm status"),
        ],
    },
    "Events": {
        "icon": "🎯",
        "commands": [
            (".on event", "Enable auto event catch"),
            (".off event", "Disable auto event catch"),
        ],
    },
    "Voice": {
        "icon": "🎤",
        "commands": [
            (".on vc", "Join voice channel & stay"),
            (".off vc", "Leave voice channel"),
            (".vc status", "Check voice status"),
        ],
    },
    "Enchant": {
        "icon": "✨",
        "commands": [
            (".on enchant", "Start auto enchant (equipment, target)"),
            (".on refine", "Start auto refine (equipment, target)"),
            (".on transmute", "Start auto transmute (equipment, target)"),
            (".on transcend", "Start auto transcend (equipment, target)"),
            (".off enchant", "Stop auto enchant"),
            (".enchant status", "Check enchant status"),
            (".refine status", "Check refine status"),
            (".transmute status", "Check transmute status"),
            (".transcend status", "Check transcend status"),
        ],
    },
    "Debug": {
        "icon": "🔍",
        "commands": [
            (".on debug", "Enable debug logging"),
            (".off debug", "Disable debug logging"),
            (".debug", "Debug slash command or replied message"),
            (".status", "Show bot health status and metrics"),
        ],
    },
}

# Command aliases mapping
COMMAND_ALIASES = {
    ".farm on": ".on farm",
    ".farm off": ".off farm",
    ".event on": ".on event",
    ".event off": ".off event",
    ".vc on": ".on vc",
    ".vc off": ".off vc",
    ".voice on": ".on vc",
    ".voice off": ".off vc",
    ".health": ".status",
    ".stats": ".status",
}

# Detailed command help
COMMAND_DETAILS = {
    ".on farm": {
        "description": "Start auto farm (adventure, axe, hunt with auto-heal)",
        "aliases": [".farm on"],
        "examples": [".on farm"],
    },
    ".off farm": {
        "description": "Stop auto farm",
        "aliases": [".farm off"],
        "examples": [".off farm"],
    },
    ".farm status": {
        "description": "Check farm status",
        "examples": [".farm status"],
    },
    ".on event": {
        "description": "Enable auto event catch",
        "aliases": [".event on"],
        "examples": [".on event"],
    },
    ".off event": {
        "description": "Disable auto event catch",
        "aliases": [".event off"],
        "examples": [".off event"],
    },
    ".on vc": {
        "description": "Join voice channel & stay",
        "aliases": [".vc on", ".voice on"],
        "args": [
            {"name": "channel_id", "description": "Voice channel ID (optional)", "required": False},
        ],
        "examples": [".on vc", ".on vc 123456789012345678"],
        "guild_only": True,
    },
    ".off vc": {
        "description": "Leave voice channel",
        "aliases": [".vc off", ".voice off"],
        "examples": [".off vc"],
        "guild_only": True,
    },
    ".vc status": {
        "description": "Check voice status",
        "examples": [".vc status"],
        "guild_only": True,
    },
    ".on enchant": {
        "description": "Start auto enchant until target is achieved",
        "args": [
            {"name": "equipment", "description": "sword or armor", "required": True},
            {"name": "target", "description": "Target enchant tier", "required": True},
        ],
        "examples": [".on enchant sword epic", ".on enchant armor godly"],
    },
    ".on refine": {
        "description": "Start auto refine until target is achieved",
        "args": [
            {"name": "equipment", "description": "sword or armor", "required": True},
            {"name": "target", "description": "Target enchant tier", "required": True},
        ],
        "examples": [".on refine sword epic", ".on refine armor godly"],
    },
    ".on transmute": {
        "description": "Start auto transmute until target is achieved",
        "args": [
            {"name": "equipment", "description": "sword or armor", "required": True},
            {"name": "target", "description": "Target enchant tier", "required": True},
        ],
        "examples": [".on transmute sword epic", ".on transmute armor godly"],
    },
    ".on transcend": {
        "description": "Start auto transcend until target is achieved",
        "args": [
            {"name": "equipment", "description": "sword or armor", "required": True},
            {"name": "target", "description": "Target enchant tier", "required": True},
        ],
        "examples": [".on transcend sword epic", ".on transcend armor godly"],
    },
    ".off enchant": {
        "description": "Stop auto enchant",
        "examples": [".off enchant"],
    },
    ".enchant status": {
        "description": "Check enchant status",
        "examples": [".enchant status"],
    },
    ".refine status": {
        "description": "Check refine status",
        "examples": [".refine status"],
    },
    ".transmute status": {
        "description": "Check transmute status",
        "examples": [".transmute status"],
    },
    ".transcend status": {
        "description": "Check transcend status",
        "examples": [".transcend status"],
    },
    ".on debug": {
        "description": "Enable debug logging",
        "examples": [".on debug"],
    },
    ".off debug": {
        "description": "Disable debug logging",
        "examples": [".off debug"],
    },
    ".debug": {
        "description": "Debug slash command or replied message",
        "args": [
            {"name": "command", "description": "Slash command to debug", "required": False},
        ],
        "examples": [".debug", ".debug hunt", ".debug (reply to message)"],
    },
    ".status": {
        "description": "Show bot health status and metrics",
        "aliases": [".health", ".stats"],
        "examples": [".status", ".health"],
    },
    ".help": {
        "description": "Show this help message",
        "args": [
            {"name": "command", "description": "Specific command to get help for", "required": False},
        ],
        "examples": [".help", ".help .on farm"],
    },
}


async def help_command(message: Any, args: List[str]) -> None:
    """
    Show help information for commands.

    Args:
        message: Discord message object
        args: Command arguments (optional specific command)
    """
    if args:
        # Show help for specific command
        cmd_name = args[0].lower()
        help_text = generate_command_help(cmd_name)
        if help_text:
            await message.reply(help_text)
        else:
            await message.reply(f"❌ Unknown command: `{cmd_name}`")
    else:
        # Show general help
        help_text = generate_general_help()
        await message.reply(help_text)


def generate_general_help() -> str:
    """Generate general help text with all commands."""
    lines = [
        "📖 **Self Bot Commands**",
        "",
    ]

    for category, data in COMMAND_CATEGORIES.items():
        icon = data["icon"]
        lines.append(f"**{icon} {category}:**")

        for cmd_name, description in data["commands"]:
            lines.append(f"• `{cmd_name}` - {description}")

        lines.append("")

    lines.append("Use `.help <command>` for detailed info on a specific command.")

    return "\n".join(lines)


def generate_command_help(cmd_name: str) -> Optional[str]:
    """Generate detailed help for a specific command."""
    # Resolve alias
    if cmd_name in COMMAND_ALIASES:
        cmd_name = COMMAND_ALIASES[cmd_name]

    # Get command details
    details = COMMAND_DETAILS.get(cmd_name)
    if not details:
        return None

    lines = [
        f"📖 **Command:** `{cmd_name}`",
        "",
        f"**Description:** {details['description']}",
    ]

    # Add aliases
    if details.get("aliases"):
        lines.append(f"**Aliases:** {', '.join(f'`{a}`' for a in details['aliases'])}")

    # Add arguments
    if details.get("args"):
        lines.append("**Arguments:**")
        for arg in details["args"]:
            required = "*" if arg.get("required") else ""
            lines.append(f"  • `{arg['name']}`{required} - {arg['description']}")

    # Add examples
    if details.get("examples"):
        lines.append("**Examples:**")
        for example in details["examples"]:
            lines.append(f"  • `{example}`")

    # Add guild only note
    if details.get("guild_only"):
        lines.append("⚠️ **Note:** This command must be used in a server.")

    return "\n".join(lines)
