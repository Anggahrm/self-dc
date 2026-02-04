# EPIC RPG Self Bot

A Discord self-bot for automating EPIC RPG tasks. Built with Node.js and designed to run on Bun runtime.

## Features

- **Auto Farm** - Automated adventure, axe, and hunt commands with auto-heal
- **Auto Event Catch** - Automatically catches EPIC coins, coin rain, trees, megalodons, arenas, minibosses, and more
- **Auto Enchant** - Automated enchanting/refining/transmute/transcend with tier targeting
- **Auto Voice Channel** - Join and stay in voice channels persistently
- **Debug Mode** - Comprehensive debugging capabilities
- **PostgreSQL Support** - Persistent data storage for settings and cooldowns
- **Health Monitoring** - Built-in system health tracking

## Requirements

- [Bun](https://bun.sh/) runtime
- PostgreSQL database (optional, for persistence)
- Discord account token

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd epic-rpg-selfbot
```

2. Install dependencies:
```bash
bun install
```

3. Create a `.env` file:
```env
DISCORD_TOKEN=your_discord_token_here
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

4. Run the bot:
```bash
bun start
```

## Commands

Prefix: `.`

| Command | Description |
|---------|-------------|
| `.help` | Show available commands |
| `.farm <start/stop/status>` | Control auto-farming |
| `.event <start/stop/status>` | Control auto-event catching |
| `.enchant <start/stop/status>` | Control auto-enchanting |
| `.voice <join/leave/status>` | Control voice channel |
| `.debug` | Toggle debug mode |
| `.health` | Show system health status |

## Project Structure

```
├── main.js                 # Entry point
├── package.json
├── src/
│   ├── index.js           # Main application logic
│   ├── config/
│   │   ├── index.js       # Configuration constants
│   │   └── database.js    # Database connection
│   ├── commands/
│   │   ├── CommandHandler.js
│   │   └── CommandRegistry.js
│   ├── managers/
│   │   ├── BaseManager.js
│   │   ├── FarmManager.js
│   │   ├── EventHandler.js
│   │   ├── AutoEnchantManager.js
│   │   ├── VoiceManager.js
│   │   └── DebugManager.js
│   ├── repositories/
│   │   ├── BaseRepository.js
│   │   ├── VoiceRepository.js
│   │   ├── SettingsRepository.js
│   │   └── CooldownRepository.js
│   └── utils/
│       ├── logger.js
│       ├── discord.js
│       ├── validation.js
│       ├── errorHandler.js
│       └── monitoring.js
```

## Configuration

Key configuration options in `src/config/index.js`:

- **Farm Cooldowns**: Adventure (1h), Axe (5m), Hunt (1m)
- **Heal Threshold**: 60 HP or 60% HP
- **Enchant Tiers**: NORMIE to ETERNAL with varying bonuses
- **Event Patterns**: Configurable detection for various events

## Database Schema

The bot uses PostgreSQL for persistence with tables for:
- Voice channel connections
- User settings
- Command cooldowns

## Deployment

### Heroku

A `Procfile` is included for Heroku deployment:
```
worker: bun main.js
```

### Self-Hosted

Run with process manager like PM2:
```bash
pm2 start main.js --name epic-rpg-bot --interpreter bun
```

## Disclaimer

This is a self-bot for educational purposes. Using self-bots violates Discord's Terms of Service. Use at your own risk.

## License

MIT
