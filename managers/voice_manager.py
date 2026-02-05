"""
Voice Manager
Handles automatic voice channel join and stay functionality
With robust heartbeat, reconnection, and circuit breaker patterns
"""

import asyncio
import random
from enum import Enum
from typing import Any, Dict, Optional

import discord

from self_dc_python.managers.base_manager import BaseManager
from self_dc_python.repositories.voice_repository import VoiceRepository


class ConnectionState(Enum):
    """Connection State Enum."""
    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DISCONNECTING = "DISCONNECTING"
    RECONNECTING = "RECONNECTING"


class CircuitState(Enum):
    """Circuit Breaker State Enum."""
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class VoiceManager(BaseManager):
    """Manager for voice channel connections with reconnection logic."""

    def __init__(self, client: Any, voice_repository: VoiceRepository):
        super().__init__(client, "Voice")
        self.voice_repository = voice_repository

        # Active voice connections per guild (in-memory for non-db mode)
        self.connections: Dict[str, Dict[str, Any]] = {}

        # Connection state tracking per guild
        self.connection_states: Dict[str, ConnectionState] = {}

        # Reconnection settings with exponential backoff
        self.base_reconnect_delay = 5000  # 5 seconds
        self.max_reconnect_delay = 300000  # 5 minutes
        self.reconnect_multiplier = 1.5
        self.reconnect_attempts: Dict[str, int] = {}
        self.max_reconnect_attempts = 10

        # Circuit breaker per guild
        self.circuit_breakers: Dict[str, Dict[str, Any]] = {}
        self.circuit_breaker_threshold = 5  # Open after 5 failures
        self.circuit_breaker_cooldown = 120000  # 2 minutes

        # Heartbeat settings
        self.heartbeat_interval = 30000  # 30 seconds
        self.heartbeat_failures: Dict[str, int] = {}
        self.max_heartbeat_failures = 3

        # Correlation IDs per guild for structured logging
        self.correlation_ids: Dict[str, str] = {}

        # Connection stable tracking (for reset attempts)
        self.connection_stable_since: Dict[str, float] = {}
        self.stable_threshold = 120000  # 2 minutes to be considered stable

        # Graceful shutdown flag
        self.is_shutting_down = False

    def generate_correlation_id(self) -> str:
        """Generate a correlation ID for tracking connection attempts."""
        return f"{int(asyncio.get_event_loop().time() * 1000)}-{random.randint(100000000, 999999999)}"

    def get_correlation_id(self, guild_id: str) -> str:
        """Get correlation ID for a guild."""
        if guild_id not in self.correlation_ids:
            self.correlation_ids[guild_id] = self.generate_correlation_id()
        return self.correlation_ids[guild_id]

    def reset_correlation_id(self, guild_id: str) -> str:
        """Reset correlation ID for a guild (new connection attempt)."""
        self.correlation_ids[guild_id] = self.generate_correlation_id()
        return self.correlation_ids[guild_id]

    def get_connection_state(self, guild_id: str) -> ConnectionState:
        """Get connection state for a guild."""
        return self.connection_states.get(guild_id, ConnectionState.IDLE)

    def set_connection_state(self, guild_id: str, state: ConnectionState) -> None:
        """Set connection state with logging."""
        old_state = self.get_connection_state(guild_id)
        self.connection_states[guild_id] = state

        if old_state != state:
            corr_id = self.get_correlation_id(guild_id)
            self.info(f"[{corr_id}] State transition: {old_state.value} -> {state.value}")

    def get_circuit_breaker(self, guild_id: str) -> Dict[str, Any]:
        """Get circuit breaker state for a guild."""
        if guild_id not in self.circuit_breakers:
            self.circuit_breakers[guild_id] = {
                "state": CircuitState.CLOSED,
                "failures": 0,
                "last_failure_time": None,
                "test_request_allowed": False,
            }
        return self.circuit_breakers[guild_id]

    def record_circuit_success(self, guild_id: str) -> None:
        """Record circuit breaker success."""
        cb = self.get_circuit_breaker(guild_id)
        old_state = cb["state"]

        cb["failures"] = 0
        cb["state"] = CircuitState.CLOSED
        cb["test_request_allowed"] = False

        if old_state != CircuitState.CLOSED:
            corr_id = self.get_correlation_id(guild_id)
            self.success(f"[{corr_id}] Circuit breaker CLOSED (connection successful)")

    def record_circuit_failure(self, guild_id: str) -> None:
        """Record circuit breaker failure."""
        cb = self.get_circuit_breaker(guild_id)
        cb["failures"] += 1
        cb["last_failure_time"] = asyncio.get_event_loop().time() * 1000

        corr_id = self.get_correlation_id(guild_id)

        if cb["state"] == CircuitState.HALF_OPEN:
            cb["state"] = CircuitState.OPEN
            self.warning(f"[{corr_id}] Circuit breaker OPEN (test request failed)")
        elif cb["failures"] >= self.circuit_breaker_threshold and cb["state"] == CircuitState.CLOSED:
            cb["state"] = CircuitState.OPEN
            self.warning(f"[{corr_id}] Circuit breaker OPEN after {cb['failures']} consecutive failures")

    def can_attempt_reconnect(self, guild_id: str) -> bool:
        """Check if circuit breaker allows request."""
        cb = self.get_circuit_breaker(guild_id)

        if cb["state"] == CircuitState.CLOSED:
            return True

        if cb["state"] == CircuitState.OPEN:
            current_time = asyncio.get_event_loop().time() * 1000
            time_since_failure = current_time - cb["last_failure_time"]

            if time_since_failure >= self.circuit_breaker_cooldown:
                cb["state"] = CircuitState.HALF_OPEN
                cb["test_request_allowed"] = True
                corr_id = self.get_correlation_id(guild_id)
                self.info(f"[{corr_id}] Circuit breaker HALF-OPEN (allowing test request)")
                return True

            remaining_cooldown = int((self.circuit_breaker_cooldown - time_since_failure) / 1000)
            corr_id = self.get_correlation_id(guild_id)
            self.warning(f"[{corr_id}] Circuit breaker OPEN, pausing reconnects ({remaining_cooldown}s cooldown remaining)")
            return False

        if cb["state"] == CircuitState.HALF_OPEN:
            if cb["test_request_allowed"]:
                cb["test_request_allowed"] = False
                corr_id = self.get_correlation_id(guild_id)
                self.info(f"[{corr_id}] Circuit breaker allowing test request (HALF_OPEN)")
                return True
            return False

        return True

    def calculate_reconnect_delay(self, attempts: int) -> int:
        """Calculate exponential backoff delay with jitter."""
        # Base exponential calculation
        exponential_delay = self.base_reconnect_delay * (self.reconnect_multiplier ** attempts)

        # Add jitter (0-30% random variation)
        jitter = 1 + random.random() * 0.3

        # Apply cap
        delay = min(exponential_delay * jitter, self.max_reconnect_delay)

        return int(delay)

    def maybe_reset_reconnect_attempts(self, guild_id: str) -> None:
        """Reset reconnect attempts if connection has been stable."""
        stable_since = self.connection_stable_since.get(guild_id)
        if stable_since:
            current_time = asyncio.get_event_loop().time() * 1000
            stable_duration = current_time - stable_since
            if stable_duration >= self.stable_threshold:
                attempts = self.reconnect_attempts.get(guild_id, 0)
                if attempts > 0:
                    corr_id = self.get_correlation_id(guild_id)
                    self.info(f"[{corr_id}] Connection stable for {int(stable_duration / 1000)}s, resetting reconnect attempts")
                    self.reconnect_attempts.pop(guild_id, None)
                    self.record_circuit_success(guild_id)

    async def initialize(self) -> None:
        """Initialize voice manager and restore connections from database."""
        if not self.voice_repository:
            self.info("Database not connected - voice settings will not persist")
            return

        try:
            saved_settings = await self.voice_repository.get_all_enabled()

            for settings in saved_settings:
                try:
                    channel = self.client.get_channel(int(settings["channel_id"]))
                    if channel and isinstance(channel, discord.VoiceChannel):
                        corr_id = self.reset_correlation_id(settings["guild_id"])
                        self.info(f"[{corr_id}] Restoring voice connection to {channel.name}")
                        await self.join_channel(
                            channel,
                            settings.get("self_mute", True),
                            settings.get("self_deaf", True),
                            False
                        )
                    else:
                        # Channel no longer exists, cleanup DB
                        self.warning(f"Voice channel {settings['channel_id']} no longer exists, removing from database")
                        await self.voice_repository.delete_by_guild_id(settings["guild_id"])
                except Exception as error:
                    self.warning(f"Failed to restore voice connection: {error}")
        except Exception as error:
            self.error(f"Failed to initialize voice connections: {error}")

    async def validate_connection(self, guild_id: str, expected_channel_id: str) -> bool:
        """Validate that bot is actually in the voice channel."""
        guild = self.client.get_guild(int(guild_id))
        if not guild:
            return False

        # Wait for voice state to propagate (max 12s, 4 retries with shorter delays)
        max_retries = 4
        retry_delay = 3  # seconds

        for attempt in range(1, max_retries + 1):
            try:
                # Fetch fresh member data
                member = guild.get_member(self.client.user.id)
                if not member:
                    member = await guild.fetch_member(self.client.user.id)

                actual_channel_id = str(member.voice.channel.id) if member.voice and member.voice.channel else None

                if actual_channel_id == expected_channel_id:
                    return True

                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)
            except Exception as error:
                self.debug(f"Validation attempt {attempt} failed: {error}")
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        return False

    def start_heartbeat(self, guild_id: str, voice_client: discord.VoiceClient) -> None:
        """Start heartbeat for a connection."""
        # Clear any existing heartbeat
        self.stop_heartbeat(guild_id)

        heartbeat_key = f"heartbeat_{guild_id}"
        self.heartbeat_failures[guild_id] = 0

        async def heartbeat_fn() -> None:
            connection_info = self.connections.get(guild_id)
            if not connection_info or self.is_shutting_down:
                self.stop_heartbeat(guild_id)
                return

            # Check if connection is still valid using voice state
            if not voice_client or not voice_client.is_connected():
                self.stop_heartbeat(guild_id)
                return

            # For discord.py, use voice state check
            try:
                guild = self.client.get_guild(int(guild_id))
                if not guild:
                    return

                member = guild.get_member(self.client.user.id)
                if not member:
                    member = await guild.fetch_member(self.client.user.id)

                actual_channel_id = str(member.voice.channel.id) if member.voice and member.voice.channel else None
                expected_channel_id = connection_info["channel_id"]

                if actual_channel_id != expected_channel_id:
                    failures = self.heartbeat_failures.get(guild_id, 0) + 1
                    self.heartbeat_failures[guild_id] = failures

                    corr_id = self.get_correlation_id(guild_id)
                    if failures >= self.max_heartbeat_failures:
                        self.warning(f"[{corr_id}] Heartbeat failed {failures}x (not in voice), triggering reconnect")
                        self.stop_heartbeat(guild_id)
                        await self.handle_disconnect(guild_id, connection_info, "heartbeat_failure")
                    else:
                        self.debug(f"[{corr_id}] Heartbeat warning ({failures}/{self.max_heartbeat_failures})")
                    return
            except Exception as error:
                self.debug(f"Heartbeat voice check failed: {error}")

            # Reset failures on success
            self.heartbeat_failures[guild_id] = 0

            # Check if we should reset reconnect attempts (connection stable)
            self.maybe_reset_reconnect_attempts(guild_id)

        # Create heartbeat task that runs periodically
        async def heartbeat_loop() -> None:
            try:
                while True:
                    await heartbeat_fn()
                    await asyncio.sleep(self.heartbeat_interval / 1000)
            except asyncio.CancelledError:
                pass

        task = asyncio.create_task(heartbeat_loop())
        self.timers[heartbeat_key] = task

        # Run first heartbeat immediately
        asyncio.create_task(heartbeat_fn())

    def stop_heartbeat(self, guild_id: str) -> None:
        """Stop heartbeat for a guild."""
        heartbeat_key = f"heartbeat_{guild_id}"
        task = self.timers.pop(heartbeat_key, None)
        if task and not task.done():
            task.cancel()
        self.heartbeat_failures.pop(guild_id, None)

    async def handle_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState
    ) -> None:
        """Handle voice state updates from Discord."""
        try:
            # Only care about our own voice state
            if member.id != self.client.user.id:
                return

            guild_id = str(member.guild.id)

            corr_id = self.get_correlation_id(guild_id)
            old_channel_id = str(before.channel.id) if before.channel else None
            new_channel_id = str(after.channel.id) if after.channel else None

            # Log state change
            self.info(f"[{corr_id}] Voice state update: {old_channel_id or 'null'} -> {new_channel_id or 'null'}")

            # Detect disconnect (left voice channel)
            if old_channel_id and not new_channel_id:
                connection_info = self.connections.get(guild_id)
                if connection_info:
                    self.warning(f"[{corr_id}] Detected disconnect from {connection_info['channel_name']}")
                    await self.handle_disconnect(guild_id, connection_info, "voice_state_update")

            # Detect channel change
            if old_channel_id and new_channel_id and old_channel_id != new_channel_id:
                self.info(f"[{corr_id}] Channel change detected: {old_channel_id} -> {new_channel_id}")
        except Exception as error:
            self.error(f"Error handling voice state update: {error}")

    async def handle_disconnect(
        self,
        guild_id: str,
        connection_info: Dict[str, Any],
        reason: str
    ) -> None:
        """Handle disconnect event."""
        corr_id = self.get_correlation_id(guild_id)

        # Don't reconnect if shutting down
        if self.is_shutting_down:
            self.info(f"[{corr_id}] Not reconnecting - shutdown in progress")
            return

        # Update state
        self.set_connection_state(guild_id, ConnectionState.DISCONNECTING)

        # Stop heartbeat
        self.stop_heartbeat(guild_id)

        # Clean up connection reference but keep settings for reconnect
        channel_id = connection_info["channel_id"]
        self_mute = connection_info["self_mute"]
        self_deaf = connection_info["self_deaf"]

        # Get fresh channel reference
        channel = self.client.get_channel(int(channel_id))

        # Clean up old connection
        self.connections.pop(guild_id, None)

        # Trigger reconnect if we have channel info
        if channel and isinstance(channel, discord.VoiceChannel):
            self.info(f"[{corr_id}] Scheduling reconnect after {reason}")
            self.schedule_reconnect(guild_id, channel, self_mute, self_deaf)
        else:
            self.warning(f"[{corr_id}] Cannot reconnect - channel no longer available")
            self.cleanup_guild_state(guild_id)

    async def join_channel(
        self,
        channel: discord.VoiceChannel,
        self_mute: bool = True,
        self_deaf: bool = True,
        save_to_db: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Join a voice channel and stay.

        Args:
            channel: Voice channel to join
            self_mute: Self mute
            self_deaf: Self deafen
            save_to_db: Whether to save to database

        Returns:
            Voice connection info or None
        """
        if not channel or not isinstance(channel, discord.VoiceChannel):
            self.error("Invalid voice channel")
            return None

        guild_id = str(channel.guild.id)

        # Check if already connected to this channel
        existing_connection = self.connections.get(guild_id)
        if existing_connection and existing_connection["channel_id"] == str(channel.id):
            self.warning(f"Already connected to {channel.name}")
            return existing_connection

        # Generate new correlation ID for this connection attempt
        corr_id = self.reset_correlation_id(guild_id)

        # Set connecting state
        self.set_connection_state(guild_id, ConnectionState.CONNECTING)

        try:
            # Disconnect from existing connection if any
            if existing_connection:
                await self.disconnect(guild_id, False)
                await asyncio.sleep(0.5)

            self.info(f"[{corr_id}] Joining voice channel: {channel.name}")

            # Join the voice channel
            voice_client = None
            try:
                voice_client = await channel.connect(
                    self_mute=self_mute,
                    self_deaf=self_deaf,
                )
            except Exception as error:
                # Library may throw connection errors even if voice state is valid
                # Check if we're actually connected via voice state
                error_msg = str(error)
                if "timeout" in error_msg.lower() or "connection" in error_msg.lower():
                    self.warning(f"[{corr_id}] Library timeout, checking voice state...")
                    await asyncio.sleep(2)
                    is_in_channel = await self.validate_connection(guild_id, str(channel.id))
                    if is_in_channel:
                        self.info(f"[{corr_id}] Voice state confirmed, connection successful")
                        # Create connection info from voice state
                        connection_info = {
                            "voice_client": None,  # We don't have the voice client object, but we're in voice
                            "channel_id": str(channel.id),
                            "channel_name": channel.name,
                            "guild_id": guild_id,
                            "guild_name": channel.guild.name,
                            "self_mute": self_mute,
                            "self_deaf": self_deaf,
                            "joined_at": asyncio.get_event_loop().time() * 1000,
                        }
                        self.connections[guild_id] = connection_info
                        self.connection_stable_since[guild_id] = asyncio.get_event_loop().time() * 1000
                        self.set_connection_state(guild_id, ConnectionState.CONNECTED)
                        if save_to_db and self.voice_repository:
                            await self.voice_repository.save_settings(
                                guild_id, str(channel.id), True, self_mute, self_deaf
                            )
                        self.success(f"[{corr_id}] Successfully joined voice channel: {channel.name}")
                        return connection_info
                raise error

            # For discord.py, wait for voice state to propagate
            self.info(f"[{corr_id}] Waiting for voice state to propagate...")
            await asyncio.sleep(2)  # Give Discord time to propagate

            # Validate connection via guild voice state (primary source of truth)
            is_valid = await self.validate_connection(guild_id, str(channel.id))

            if not is_valid:
                self.warning(f"[{corr_id}] Connection did not become ready in time")
                if voice_client:
                    await voice_client.disconnect()
                self.cleanup_guild_state(guild_id)
                return None

            # Store connection info AFTER validation
            connection_info = {
                "voice_client": voice_client,
                "channel_id": str(channel.id),
                "channel_name": channel.name,
                "guild_id": guild_id,
                "guild_name": channel.guild.name,
                "self_mute": self_mute,
                "self_deaf": self_deaf,
                "joined_at": asyncio.get_event_loop().time() * 1000,
            }

            self.connections[guild_id] = connection_info
            self.connection_stable_since[guild_id] = asyncio.get_event_loop().time() * 1000
            self.set_connection_state(guild_id, ConnectionState.CONNECTED)

            # Save to database
            if save_to_db and self.voice_repository:
                await self.voice_repository.save_settings(
                    guild_id, str(channel.id), True, self_mute, self_deaf
                )

            self.success(f"[{corr_id}] Successfully joined voice channel: {channel.name}")

            # Start heartbeat (only if we have voice client object)
            if voice_client:
                self.start_heartbeat(guild_id, voice_client)
            else:
                self.warning(f"[{corr_id}] No voice client object, skipping heartbeat")

            return connection_info
        except Exception as error:
            self.error(f"[{corr_id}] Failed to join voice channel: {error}")
            self.set_connection_state(guild_id, ConnectionState.IDLE)
            return None

    def schedule_reconnect(
        self,
        guild_id: str,
        channel: discord.VoiceChannel,
        self_mute: bool,
        self_deaf: bool
    ) -> None:
        """Schedule a reconnect attempt with exponential backoff and circuit breaker."""
        try:
            corr_id = self.get_correlation_id(guild_id)

            # Check circuit breaker
            if not self.can_attempt_reconnect(guild_id):
                # Schedule another check after cooldown
                cb = self.get_circuit_breaker(guild_id)
                if cb["state"] == CircuitState.OPEN:
                    current_time = asyncio.get_event_loop().time() * 1000
                    time_until_half_open = self.circuit_breaker_cooldown - (current_time - cb["last_failure_time"])
                    self.set_managed_timer(
                        f"reconnect_{guild_id}",
                        lambda: self.schedule_reconnect(guild_id, channel, self_mute, self_deaf),
                        int(max(time_until_half_open + 1000, 5000))
                    )
                return

            attempts = self.reconnect_attempts.get(guild_id, 0)

            if attempts >= self.max_reconnect_attempts:
                self.error(f"[{corr_id}] Max reconnect attempts reached for {channel.name}")
                self.cleanup_guild_state(guild_id)
                return

            self.reconnect_attempts[guild_id] = attempts + 1
            self.set_connection_state(guild_id, ConnectionState.RECONNECTING)

            # Calculate delay with exponential backoff and jitter
            delay = self.calculate_reconnect_delay(attempts)
            self.info(f"[{corr_id}] Reconnect attempt {attempts + 1}/{self.max_reconnect_attempts} in {int(delay / 1000)}s...")

            async def reconnect_handler() -> None:
                await self.handle_reconnect(guild_id, channel, self_mute, self_deaf)

            self.set_managed_timer(
                f"reconnect_{guild_id}",
                reconnect_handler,
                delay
            )
        except Exception as error:
            self.error(f"Error scheduling reconnect: {error}")

    async def handle_reconnect(
        self,
        guild_id: str,
        channel: discord.VoiceChannel,
        self_mute: bool,
        self_deaf: bool
    ) -> None:
        """Handle reconnection logic."""
        corr_id = self.get_correlation_id(guild_id)

        # Don't reconnect if shutting down
        if self.is_shutting_down:
            self.info(f"[{corr_id}] Not reconnecting - shutdown in progress")
            return

        # Check if we should still be connected
        saved_connection = self.connections.get(guild_id)
        if saved_connection and saved_connection["channel_id"] == str(channel.id):
            self.debug(f"[{corr_id}] Already connected to target channel, skipping reconnect")
            return

        try:
            # Refresh channel from cache
            fresh_channel = self.client.get_channel(channel.id)
            if not fresh_channel or not isinstance(fresh_channel, discord.VoiceChannel):
                self.warning(f"[{corr_id}] Channel {channel.id} no longer exists or is not a voice channel")
                self.info(f"[{corr_id}] Stopping reconnect - voice channel was deleted")

                # Cleanup and remove from DB since channel is gone
                await self.disconnect(guild_id, True)
                return

            result = await self.join_channel(fresh_channel, self_mute, self_deaf, False)
            if result:
                self.success(f"[{corr_id}] Successfully reconnected to {fresh_channel.name}")
                self.record_circuit_success(guild_id)
            else:
                raise Exception("join_channel returned None")
        except Exception as error:
            self.error(f"[{corr_id}] Reconnect failed: {error}")
            self.record_circuit_failure(guild_id)

            attempts = self.reconnect_attempts.get(guild_id, 0)
            if attempts < self.max_reconnect_attempts:
                self.schedule_reconnect(guild_id, channel, self_mute, self_deaf)
            else:
                self.error(f"[{corr_id}] Max reconnect attempts exhausted")
                self.cleanup_guild_state(guild_id)

    def cleanup_guild_state(self, guild_id: str) -> None:
        """Cleanup all state for a guild."""
        self.connections.pop(guild_id, None)
        self.connection_states.pop(guild_id, None)
        self.reconnect_attempts.pop(guild_id, None)
        self.heartbeat_failures.pop(guild_id, None)
        self.connection_stable_since.pop(guild_id, None)
        self.correlation_ids.pop(guild_id, None)
        self.circuit_breakers.pop(guild_id, None)
        self.clear_managed_timer(f"reconnect_{guild_id}")
        self.stop_heartbeat(guild_id)

    async def disconnect(self, guild_id: str, remove_from_db: bool = True) -> bool:
        """
        Disconnect from voice channel in a guild.

        Args:
            guild_id: Guild ID
            remove_from_db: Whether to remove from database

        Returns:
            True if disconnected successfully
        """
        connection_info = self.connections.get(guild_id)
        corr_id = self.get_correlation_id(guild_id)

        if not connection_info:
            return False

        try:
            self.set_connection_state(guild_id, ConnectionState.DISCONNECTING)

            # Stop heartbeat
            self.stop_heartbeat(guild_id)

            # Clear reconnect timer
            self.clear_managed_timer(f"reconnect_{guild_id}")

            # Disconnect the voice connection
            voice_client = connection_info.get("voice_client")
            if voice_client:
                await voice_client.disconnect()

            # Remove from database
            if remove_from_db and self.voice_repository:
                await self.voice_repository.delete_by_guild_id(guild_id)

            self.success(f"[{corr_id}] Disconnected from voice channel: {connection_info['channel_name']}")

            # Cleanup state
            self.cleanup_guild_state(guild_id)

            return True
        except Exception as error:
            self.error(f"[{corr_id}] Failed to disconnect: {error}")
            self.cleanup_guild_state(guild_id)
            return False

    def get_connection_status(self, guild_id: str) -> Optional[Dict[str, Any]]:
        """Get connection status for a guild."""
        connection_info = self.connections.get(guild_id)
        if not connection_info:
            return None

        return {
            **connection_info,
            "state": self.get_connection_state(guild_id).value,
            "correlation_id": self.get_correlation_id(guild_id),
        }

    def is_connected(self, guild_id: str) -> bool:
        """Check if connected to a voice channel in a guild."""
        return guild_id in self.connections and self.get_connection_state(guild_id) == ConnectionState.CONNECTED

    def get_status(self, guild_id: Optional[str] = None) -> str:
        """Get formatted status message."""
        if guild_id:
            connection_info = self.connections.get(guild_id)
            state = self.get_connection_state(guild_id)

            if not connection_info:
                return "🔇 **Voice Status:** Not connected"

            current_time = asyncio.get_event_loop().time() * 1000
            duration = int((current_time - connection_info["joined_at"]) / 1000)
            duration_str = self.format_duration(duration)
            state_emoji = "🟢" if state == ConnectionState.CONNECTED else "🟡"

            return (
                f"{state_emoji} **Voice Status:** {state.value}\n\n"
                f"📍 **Channel:** {connection_info['channel_name']}\n"
                f"🏠 **Server:** {connection_info['guild_name']}\n"
                f"🔇 **Self Mute:** {'Yes' if connection_info['self_mute'] else 'No'}\n"
                f"🔈 **Self Deaf:** {'Yes' if connection_info['self_deaf'] else 'No'}\n"
                f"⏱️ **Duration:** {duration_str}"
            )

        # Return status for all connections
        if not self.connections:
            return "🔇 **Voice Status:** No active connections"

        statuses = []
        current_time = asyncio.get_event_loop().time() * 1000
        for info in self.connections.values():
            duration = int((current_time - info["joined_at"]) / 1000)
            state = self.get_connection_state(info["guild_id"])
            state_emoji = "🟢" if state == ConnectionState.CONNECTED else "🟡"
            statuses.append(
                f"{state_emoji} {info['guild_name']} - {info['channel_name']} "
                f"({self.format_duration(duration)}) [{state.value}]"
            )

        return (
            f"🎤 **Voice Status:** {len(self.connections)} active connection(s)\n\n"
            + "\n".join(statuses)
        )

    def format_duration(self, seconds: int) -> str:
        """Format duration in human readable format."""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60

        if hours > 0:
            return f"{hours}h {minutes}m {secs}s"
        elif minutes > 0:
            return f"{minutes}m {secs}s"
        else:
            return f"{secs}s"

    def cleanup(self, disconnect: bool = True) -> None:
        """
        Cleanup all voice connections (graceful shutdown).

        Args:
            disconnect: Whether to disconnect from voice channels
        """
        self.info("Cleaning up voice connections...")
        self.is_shutting_down = True

        if disconnect:
            # Disconnect all connections
            for guild_id, connection_info in list(self.connections.items()):
                corr_id = self.get_correlation_id(guild_id)
                self.info(f"[{corr_id}] Disconnecting from {connection_info['channel_name']}")

                # Stop heartbeat
                self.stop_heartbeat(guild_id)

                # Clear reconnect timer
                self.clear_managed_timer(f"reconnect_{guild_id}")

                # Disconnect
                try:
                    voice_client = connection_info.get("voice_client")
                    if voice_client:
                        asyncio.create_task(voice_client.disconnect())
                except Exception as error:
                    self.debug(f"[{corr_id}] Error during disconnect: {error}")
        else:
            # Just stop all heartbeats without disconnecting
            for guild_id in list(self.connections.keys()):
                self.stop_heartbeat(guild_id)
                self.clear_managed_timer(f"reconnect_{guild_id}")
            self.info("Voice state preserved for Heroku dyno cycling")

        # Clear all state
        self.connections.clear()
        self.connection_states.clear()
        self.reconnect_attempts.clear()
        self.heartbeat_failures.clear()
        self.connection_stable_since.clear()
        self.correlation_ids.clear()
        self.circuit_breakers.clear()

        self.info("Voice connections cleanup complete")

        # Call parent cleanup
        super().cleanup()
