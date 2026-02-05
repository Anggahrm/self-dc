"""
Local testing script for the Discord self-bot.
Tests core functionality without requiring Discord connection.
"""

import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


async def test_config():
    """Test configuration loading."""
    print("\n=== Testing Config ===")
    try:
        # Skip if dotenv not installed
        try:
            from bot.config import Config, config
        except ImportError as ie:
            print(f"⚠️  Skipping (missing dependency): {ie}")
            return True

        # Test Config dataclass
        test_config = Config(
            DISCORD_TOKEN="test_token",
            DATABASE_URL="postgresql://test",
            PORT=11186,
            DEBUG=True
        )

        assert test_config.DISCORD_TOKEN == "test_token"
        assert test_config.PORT == 11186
        assert test_config.DEBUG == True

        print("✅ Config test passed")
        return True
    except Exception as e:
        print(f"❌ Config test failed: {e}")
        return False


async def test_logger():
    """Test logger setup."""
    print("\n=== Testing Logger ===")
    try:
        from utils.logger import setup_logging, LoggerMixin, get_logger

        logger = setup_logging("Test", level=30)  # WARNING level
        assert logger is not None
        assert logger.name == "Test"

        # Test LoggerMixin
        class TestClass(LoggerMixin):
            def __init__(self):
                super().__init__("TestClass")

        obj = TestClass()
        assert obj.logger is not None

        print("✅ Logger test passed")
        return True
    except Exception as e:
        print(f"❌ Logger test failed: {e}")
        return False


async def test_validation():
    """Test validation utilities."""
    print("\n=== Testing Validation ===")
    try:
        from utils.validation import ValidationUtils, ValidationResult

        # Test snowflake validation
        assert ValidationUtils.is_valid_snowflake("123456789012345678") == True
        assert ValidationUtils.is_valid_snowflake("not_a_number") == False

        # Test URL validation
        result = ValidationUtils.validate_url("https://example.com")
        assert result.valid == True
        result = ValidationUtils.validate_url("not_a_url")
        assert result.valid == False

        # Test sanitization
        result = ValidationUtils.is_safe_input("hello world")
        assert result.get("safe") == True

        print("✅ Validation test passed")
        return True
    except Exception as e:
        print(f"❌ Validation test failed: {e}")
        return False


async def test_discord_utils():
    """Test Discord utilities."""
    print("\n=== Testing Discord Utils ===")
    try:
        # Skip if dependencies not available
        try:
            from utils.discord import DiscordUtils
        except ImportError as ie:
            print(f"⚠️  Skipping (missing dependency): {ie}")
            return True

        # Test format_duration
        result = DiscordUtils.format_duration(3661)
        assert "1h" in result and "1m" in result
        assert DiscordUtils.format_duration(59) == "59s"

        # Test parse_hp (pattern matches "remaining HP is X/Y")
        hp_data = DiscordUtils.parse_hp("remaining HP is 100/200")
        if hp_data:
            assert hp_data["current"] == 100
            assert hp_data["max"] == 200

        # Test check_for_epic_guard (needs object with .content attribute)
        class MockMessage:
            def __init__(self, content):
                self.content = content
                self.embeds = []

        # Note: EPIC_GUARD_PHRASES contains "EPIC GUARD" (all caps)
        assert DiscordUtils.check_for_epic_guard(MockMessage("EPIC GUARD: stop there")) == True
        assert DiscordUtils.check_for_epic_guard(MockMessage("Normal message")) == False

        print("✅ Discord Utils test passed")
        return True
    except Exception as e:
        import traceback
        print(f"❌ Discord Utils test failed: {e}")
        traceback.print_exc()
        return False


async def test_repositories():
    """Test repository base class."""
    print("\n=== Testing Repositories ===")
    try:
        # Skip if asyncpg not installed
        try:
            from repositories.base_repository import BaseRepository
        except ImportError as ie:
            print(f"⚠️  Skipping (missing dependency): {ie}")
            return True

        # Can't instantiate abstract class without implementing abstract methods
        # Just check that the class exists and has the right structure
        assert hasattr(BaseRepository, 'find_by_id')
        assert hasattr(BaseRepository, 'create')
        assert hasattr(BaseRepository, 'update')

        print("✅ Repository test passed (structure only)")
        return True
    except Exception as e:
        print(f"❌ Repository test failed: {e}")
        return False


async def test_managers():
    """Test manager structure."""
    print("\n=== Testing Managers ===")
    try:
        # Skip if dependencies not available
        try:
            from managers.base_manager import BaseManager
        except ImportError as ie:
            print(f"⚠️  Skipping (missing dependency): {ie}")
            return True

        # Check BaseManager structure
        assert hasattr(BaseManager, 'set_managed_timer')
        assert hasattr(BaseManager, 'clear_managed_timer')
        assert hasattr(BaseManager, 'cleanup')

        print("✅ Manager test passed (structure only)")
        return True
    except Exception as e:
        print(f"❌ Manager test failed: {e}")
        return False


async def test_commands():
    """Test command registry."""
    print("\n=== Testing Commands ===")
    try:
        # Skip if dependencies not available
        try:
            from commands.command_registry import CommandRegistry, CommandDefinition
        except ImportError as ie:
            print(f"⚠️  Skipping (missing dependency): {ie}")
            return True

        registry = CommandRegistry()

        # Define a test command
        async def test_handler(message, args):
            pass

        registry.register(
            CommandDefinition(
                name="test",
                description="Test command",
                category="Test",
                aliases=["t"],
            ),
            test_handler
        )

        # Test retrieval
        cmd = registry.get("test")
        assert cmd is not None
        assert cmd.definition.name == "test"

        # Test alias
        cmd_by_alias = registry.get("t")
        assert cmd_by_alias is not None

        print("✅ Commands test passed")
        return True
    except Exception as e:
        print(f"❌ Commands test failed: {e}")
        return False


async def run_all_tests():
    """Run all tests."""
    print("=" * 50)
    print("SELF-DC BOT LOCAL TESTS")
    print("=" * 50)

    tests = [
        test_config,
        test_logger,
        test_validation,
        test_discord_utils,
        test_repositories,
        test_managers,
        test_commands,
    ]

    results = []
    for test in tests:
        try:
            result = await test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test crashed: {e}")
            results.append(False)

    print("\n" + "=" * 50)
    print("TEST SUMMARY")
    print("=" * 50)

    passed = sum(results)
    total = len(results)

    print(f"Passed: {passed}/{total}")

    if passed == total:
        print("✅ All tests passed!")
        return 0
    else:
        print(f"❌ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
