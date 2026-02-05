"""
Monitoring Utilities
System metrics and health monitoring
"""

import asyncio
import os
import platform
import time
from typing import Any, Dict, List, Optional


class HealthStatus:
    """Health status result."""

    def __init__(
        self,
        healthy: bool,
        status: str,
        checks: Dict[str, bool],
        timestamp: str,
    ):
        self.healthy = healthy
        self.status = status
        self.checks = checks
        self.timestamp = timestamp


class Monitoring:
    """System metrics and health monitoring."""

    def __init__(self, client: Any):
        self.client = client
        self.start_time = time.time()
        self.metrics = {
            "commandsExecuted": 0,
            "messagesProcessed": 0,
            "apiCalls": 0,
            "errors": 0,
        }
        self.hourly_stats: Dict[str, Dict[str, int]] = {}
        self._hourly_task: Optional[asyncio.Task] = None

    async def initialize(self) -> None:
        """Initialize monitoring."""
        # Record hourly stats every hour
        self._hourly_task = asyncio.create_task(self._hourly_stats_loop())

        # Track message processing
        # Note: Event listeners need to be adapted based on discord.py-self API
        # This is a placeholder for the event subscription
        if hasattr(self.client, "on_message"):
            original_on_message = self.client.on_message

            async def wrapped_on_message(message: Any) -> None:
                self.record_message()
                if original_on_message:
                    await original_on_message(message)

            self.client.on_message = wrapped_on_message

    async def _hourly_stats_loop(self) -> None:
        """Background task to record hourly statistics."""
        while True:
            await asyncio.sleep(3600)  # Every hour
            self.record_hourly_stats()

    def record_command(self) -> None:
        """Record command execution."""
        self.metrics["commandsExecuted"] += 1

    def record_message(self) -> None:
        """Record message processed."""
        self.metrics["messagesProcessed"] += 1

    def record_api_call(self) -> None:
        """Record API call."""
        self.metrics["apiCalls"] += 1

    def record_error(self) -> None:
        """Record error."""
        self.metrics["errors"] += 1

    def get_system_metrics(self) -> Dict[str, Any]:
        """
        Get system metrics.

        Returns:
            Dict with memory, CPU, uptime, and platform info
        """
        import psutil

        process = psutil.Process()
        memory_info = process.memory_info()
        load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0.0, 0.0, 0.0)

        return {
            "memory": {
                "used": round(memory_info.rss / 1024 / 1024),
                "heapUsed": round(memory_info.rss / 1024 / 1024),  # Approximation
                "heapTotal": round(memory_info.vms / 1024 / 1024),  # Approximation
                "external": round(getattr(memory_info, "shared", 0) / 1024 / 1024),
                "systemTotal": round(psutil.virtual_memory().total / 1024 / 1024),
                "systemFree": round(psutil.virtual_memory().available / 1024 / 1024),
            },
            "cpu": {
                "loadAvg1m": round(load_avg[0], 2),
                "loadAvg5m": round(load_avg[1], 2),
                "loadAvg15m": round(load_avg[2], 2),
                "cores": psutil.cpu_count(),
            },
            "uptime": {
                "process": self.format_duration(int(time.time() - process.create_time())),
                "system": self.format_duration(int(time.time() - psutil.boot_time())),
                "bot": self.format_duration(int(time.time() - self.start_time)),
            },
            "platform": {
                "python": platform.python_version(),
                "os": f"{platform.system()} {platform.release()}",
                "arch": platform.machine(),
            },
        }

    def get_discord_metrics(self) -> Dict[str, Any]:
        """
        Get Discord client metrics.

        Returns:
            Dict with status, ping, guilds, channels, users, shards
        """
        # Adapt based on discord.py-self API
        return {
            "status": getattr(self.client, "status", "unknown"),
            "ping": getattr(self.client, "latency", 0) * 1000,  # Convert to ms
            "guilds": len(self.client.guilds) if hasattr(self.client, "guilds") else 0,
            "channels": (
                sum(len(g.channels) for g in self.client.guilds)
                if hasattr(self.client, "guilds")
                else 0
            ),
            "users": len(self.client.users) if hasattr(self.client, "users") else 0,
            "shards": getattr(self.client, "shards", 1),
        }

    def get_app_metrics(self) -> Dict[str, Any]:
        """
        Get application metrics.

        Returns:
            Dict with metrics and hourly rates
        """
        return {
            **self.metrics,
            "commandsPerHour": self.calculate_commands_per_hour(),
            "messagesPerHour": self.calculate_messages_per_hour(),
        }

    def calculate_commands_per_hour(self) -> int:
        """Calculate commands per hour."""
        hours = (time.time() - self.start_time) / 3600
        return round(self.metrics["commandsExecuted"] / hours) if hours > 0 else 0

    def calculate_messages_per_hour(self) -> int:
        """Calculate messages per hour."""
        hours = (time.time() - self.start_time) / 3600
        return round(self.metrics["messagesProcessed"] / hours) if hours > 0 else 0

    def record_hourly_stats(self) -> None:
        """Record hourly statistics."""
        from datetime import datetime
        hour = datetime.now().strftime("%Y-%m-%dT%H")
        self.hourly_stats[hour] = self.metrics.copy()

        # Keep only last 24 hours
        keys = sorted(self.hourly_stats.keys())
        if len(keys) > 24:
            for old_key in keys[:-24]:
                del self.hourly_stats[old_key]

    def get_health_status(self) -> HealthStatus:
        """
        Get health status.

        Returns:
            HealthStatus with overall health and individual checks
        """
        system = self.get_system_metrics()
        discord = self.get_discord_metrics()

        checks = {
            "memory": system["memory"]["used"] < system["memory"]["systemTotal"] * 0.8,
            "heap": system["memory"]["heapUsed"] < system["memory"]["heapTotal"] * 0.9,
            "discord": discord["status"] == "ready" if isinstance(discord["status"], str) else True,
            "ping": discord["ping"] < 500,
            "errors": self.metrics["errors"] < 100,
        }

        healthy = all(checks.values())

        return HealthStatus(
            healthy=healthy,
            status="healthy" if healthy else "degraded",
            checks=checks,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )

    def format_health_status(self) -> str:
        """
        Format health status for display.

        Returns:
            Formatted health status string
        """
        health = self.get_health_status()
        system = self.get_system_metrics()
        discord = self.get_discord_metrics()
        app = self.get_app_metrics()

        status_icon = "🟢" if health.healthy else "🟡"

        lines = [
            f"{status_icon} **Bot Health Status: {health.status.upper()}**",
            "",
            "📊 **System:**",
            f"Memory: {system['memory']['used']}MB / {system['memory']['systemTotal']}MB",
            f"Heap: {system['memory']['heapUsed']}MB / {system['memory']['heapTotal']}MB",
            f"CPU Load: {system['cpu']['loadAvg1m']} ({system['cpu']['cores']} cores)",
            "",
            "🤖 **Discord:**",
            f"Status: {discord['status']}",
            f"Ping: {discord['ping']:.0f}ms",
            f"Guilds: {discord['guilds']} | Channels: {discord['channels']}",
            "",
            "📈 **Metrics:**",
            f"Commands: {app['commandsExecuted']} ({app['commandsPerHour']}/hr)",
            f"Messages: {app['messagesProcessed']} ({app['messagesPerHour']}/hr)",
            f"Errors: {app['errors']}",
            "",
            "⏱️ **Uptime:**",
            f"Bot: {system['uptime']['bot']}",
            f"System: {system['uptime']['system']}",
        ]

        return "\n".join(lines)

    @staticmethod
    def format_duration(seconds: int) -> str:
        """
        Format duration in human readable format.

        Args:
            seconds: Duration in seconds

        Returns:
            Formatted duration string
        """
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        mins = (seconds % 3600) // 60
        secs = seconds % 60

        parts: List[str] = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if mins > 0:
            parts.append(f"{mins}m")
        if secs > 0 or not parts:
            parts.append(f"{secs}s")

        return " ".join(parts)

    def get_full_status(self) -> Dict[str, Any]:
        """
        Get full status report.

        Returns:
            Dict with health, system, discord, and app metrics
        """
        health = self.get_health_status()
        return {
            "health": {
                "healthy": health.healthy,
                "status": health.status,
                "checks": health.checks,
                "timestamp": health.timestamp,
            },
            "system": self.get_system_metrics(),
            "discord": self.get_discord_metrics(),
            "app": self.get_app_metrics(),
        }

    async def stop(self) -> None:
        """Stop monitoring and cleanup."""
        if self._hourly_task and not self._hourly_task.done():
            self._hourly_task.cancel()
            try:
                await self._hourly_task
            except asyncio.CancelledError:
                pass
