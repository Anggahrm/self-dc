"""
Configuration management for the Discord self-bot.
Loads environment variables and provides configuration settings.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


@dataclass(frozen=True)
class Config:
    """Bot configuration settings."""

    # Discord
    DISCORD_TOKEN: str

    # Database
    DATABASE_URL: str

    # Web Server (for Heroku keep-alive)
    PORT: int = 11186
    HOST: str = "0.0.0.0"

    # Debug
    DEBUG: bool = False

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        return cls(
            DISCORD_TOKEN=os.getenv("DISCORD_TOKEN", ""),
            DATABASE_URL=os.getenv("DATABASE_URL", ""),
            PORT=int(os.getenv("PORT", "11186")),
            HOST=os.getenv("HOST", "0.0.0.0"),
            DEBUG=os.getenv("DEBUG", "false").lower() == "true",
        )

    def validate(self) -> None:
        """Validate required configuration."""
        if not self.DISCORD_TOKEN:
            raise ValueError("DISCORD_TOKEN is required")


# Global config instance
config = Config.from_env()
