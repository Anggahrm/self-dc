"""
Validation Utilities
Helper functions for validating Discord IDs and user input
"""

import re
from typing import Any, Dict, List, Optional, Union

# Discord snowflake ID pattern: 17-20 digits
SNOWFLAKE_REGEX = re.compile(r"^[0-9]{17,20}$")

# Common dangerous patterns for injection prevention
DANGEROUS_PATTERNS = [
    re.compile(r"<script", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+=", re.IGNORECASE),
    re.compile(r"data:text/html", re.IGNORECASE),
]

# Valid command names
VALID_COMMANDS = [
    "adventure", "axe", "hunt", "heal",
    "enchant", "refine", "transmute", "transcend",
]

# Valid equipment types
VALID_EQUIPMENT = ["sword", "armor"]


class ValidationResult:
    """Result of a validation operation."""

    def __init__(
        self,
        valid: bool,
        error: Optional[str] = None,
        sanitized: Optional[str] = None,
        value: Optional[Any] = None,
    ):
        self.valid = valid
        self.error = error
        self.sanitized = sanitized
        self.value = value

    def __bool__(self) -> bool:
        return self.valid


class ValidationUtils:
    """Utility class for input validation."""

    @staticmethod
    def is_valid_snowflake(id_value: Union[str, int]) -> bool:
        """
        Check if value is a valid Discord snowflake ID.

        Args:
            id_value: ID to validate

        Returns:
            True if valid snowflake
        """
        if not isinstance(id_value, (str, int)):
            return False
        str_id = str(id_value)
        return bool(SNOWFLAKE_REGEX.match(str_id))

    @staticmethod
    def validate_channel_id(channel_id: Optional[Union[str, int]]) -> ValidationResult:
        """
        Validate and sanitize a Discord channel ID.

        Args:
            channel_id: Channel ID to validate

        Returns:
            ValidationResult with valid status and sanitized value
        """
        if not channel_id:
            return ValidationResult(valid=False, error="Channel ID is required")

        sanitized = ValidationUtils.sanitize_input(str(channel_id))

        if not ValidationUtils.is_valid_snowflake(sanitized):
            return ValidationResult(valid=False, error="Invalid channel ID format")

        return ValidationResult(valid=True, sanitized=sanitized)

    @staticmethod
    def validate_guild_id(guild_id: Optional[Union[str, int]]) -> ValidationResult:
        """
        Validate and sanitize a guild/server ID.

        Args:
            guild_id: Guild ID to validate

        Returns:
            ValidationResult with valid status and sanitized value
        """
        if not guild_id:
            return ValidationResult(valid=False, error="Guild ID is required")

        sanitized = ValidationUtils.sanitize_input(str(guild_id))

        if not ValidationUtils.is_valid_snowflake(sanitized):
            return ValidationResult(valid=False, error="Invalid guild ID format")

        return ValidationResult(valid=True, sanitized=sanitized)

    @staticmethod
    def validate_user_id(user_id: Optional[Union[str, int]]) -> ValidationResult:
        """
        Validate and sanitize a user ID.

        Args:
            user_id: User ID to validate

        Returns:
            ValidationResult with valid status and sanitized value
        """
        if not user_id:
            return ValidationResult(valid=False, error="User ID is required")

        sanitized = ValidationUtils.sanitize_input(str(user_id))

        if not ValidationUtils.is_valid_snowflake(sanitized):
            return ValidationResult(valid=False, error="Invalid user ID format")

        return ValidationResult(valid=True, sanitized=sanitized)

    @staticmethod
    def validate_enchant_input(
        enchant_type: str,
        equipment: str,
        target: str,
    ) -> ValidationResult:
        """
        Validate enchant command input.

        Args:
            enchant_type: Enchant type
            equipment: Equipment type
            target: Target enchant name

        Returns:
            ValidationResult with valid status
        """
        if not enchant_type or enchant_type.lower() not in VALID_COMMANDS:
            return ValidationResult(
                valid=False,
                error=f"Invalid enchant type. Valid: {', '.join(VALID_COMMANDS)}"
            )

        if not equipment or equipment.lower() not in VALID_EQUIPMENT:
            return ValidationResult(
                valid=False,
                error=f"Invalid equipment. Valid: {', '.join(VALID_EQUIPMENT)}"
            )

        if not target or not isinstance(target, str):
            return ValidationResult(valid=False, error="Target enchant is required")

        sanitized_target = ValidationUtils.sanitize_input(target)
        if len(sanitized_target) > 50:
            return ValidationResult(
                valid=False,
                error="Target enchant name too long (max 50 chars)"
            )

        return ValidationResult(valid=True, sanitized=sanitized_target)

    @staticmethod
    def sanitize_input(input_value: str) -> str:
        """
        Sanitize user input to prevent injection.

        Args:
            input_value: Input to sanitize

        Returns:
            Sanitized input string
        """
        if not isinstance(input_value, str):
            return ""

        # Trim whitespace
        sanitized = input_value.strip()

        # Remove zero-width characters
        sanitized = re.sub(r"[\u200B-\u200D\uFEFF]", "", sanitized)

        # Remove control characters
        sanitized = re.sub(r"[\x00-\x1F\x7F-\x9F]", "", sanitized)

        return sanitized

    @staticmethod
    def is_safe_input(input_value: str) -> Dict[str, Any]:
        """
        Check if input contains potentially dangerous content.

        Args:
            input_value: Input to check

        Returns:
            Dict with 'safe' boolean and optional 'reason' string
        """
        if not isinstance(input_value, str):
            return {"safe": True}

        for pattern in DANGEROUS_PATTERNS:
            if pattern.search(input_value):
                return {"safe": False, "reason": "Potentially dangerous content detected"}

        return {"safe": True}

    @staticmethod
    def validate_args_length(
        args: Optional[List[Any]],
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
    ) -> ValidationResult:
        """
        Validate command arguments length.

        Args:
            args: Command arguments
            min_length: Minimum required
            max_length: Maximum allowed

        Returns:
            ValidationResult with valid status
        """
        length = len(args) if args else 0

        if min_length is not None and length < min_length:
            return ValidationResult(
                valid=False,
                error=f"Too few arguments. Minimum: {min_length}"
            )

        if max_length is not None and length > max_length:
            return ValidationResult(
                valid=False,
                error=f"Too many arguments. Maximum: {max_length}"
            )

        return ValidationResult(valid=True)

    @staticmethod
    def validate_message_length(
        content: Optional[str],
        max_length: int = 2000,
) -> ValidationResult:
        """
        Validate message content length.

        Args:
            content: Message content
            max_length: Maximum length (default: 2000 for Discord)

        Returns:
            ValidationResult with valid status and optional truncated content
        """
        if not content:
            return ValidationResult(valid=True)

        if len(content) > max_length:
            truncated = content[: max_length - 3] + "..."
            return ValidationResult(
                valid=False,
                error=f"Message too long ({len(content)}/{max_length})",
                value=truncated,
            )

        return ValidationResult(valid=True)

    @staticmethod
    def validate_timeout(
        timeout: Union[int, float, str],
        min_ms: int = 1000,
        max_ms: int = 300000,
    ) -> ValidationResult:
        """
        Validate timeout value.

        Args:
            timeout: Timeout in milliseconds
            min_ms: Minimum allowed (default: 1000)
            max_ms: Maximum allowed (default: 300000 = 5min)

        Returns:
            ValidationResult with valid status and value
        """
        try:
            num = float(timeout)
        except (ValueError, TypeError):
            return ValidationResult(valid=False, error="Timeout must be a number")

        if num < min_ms:
            return ValidationResult(
                valid=False,
                error=f"Timeout too short. Minimum: {min_ms}ms",
                value=min_ms,
            )

        if num > max_ms:
            return ValidationResult(
                valid=False,
                error=f"Timeout too long. Maximum: {max_ms}ms",
                value=max_ms,
            )

        return ValidationResult(valid=True, value=int(num))

    @staticmethod
    def validate_url(url: Optional[str]) -> ValidationResult:
        """
        Validate URL for safety.

        Args:
            url: URL to validate

        Returns:
            ValidationResult with valid status
        """
        if not url:
            return ValidationResult(valid=False, error="URL is required")

        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)

            # Only allow http and https protocols
            if parsed.scheme not in ("http", "https"):
                return ValidationResult(
                    valid=False,
                    error="Invalid protocol. Only HTTP/HTTPS allowed"
                )

            return ValidationResult(valid=True)
        except Exception:
            return ValidationResult(valid=False, error="Invalid URL format")
