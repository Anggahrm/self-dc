# Self-DC Bot (Python)

Discord self-bot rewritten in Python using `discord.py-self`.

## Migration Status

| Component | Status |
|-----------|--------|
| Core (Config, Logger, DB) | ✅ Complete |
| Repositories | ✅ Complete |
| Managers (Farm, Voice, Enchant, Event, Debug) | ✅ Complete |
| Commands (25 commands) | ✅ Complete |
| Testing | ✅ Passed |

## Local Testing

### Prerequisites

- Python 3.11 or higher
- pip

### Setup

```bash
# Create virtual environment
python3 -m venv venv

# Activate
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### Configuration

```bash
# Copy example env
cp .env.example .env

# Edit .env with your settings
nano .env
```

### Run Tests

```bash
# Run local tests (no Discord connection needed)
python3 test_local.py

# Expected output:
# Passed: 7/7
# ✅ All tests passed!
```

### Run Bot

```bash
# Run the bot
python3 main.py

# Or as module
python3 -m bot
```

## Heroku Deployment

### Setup

1. Create new Heroku app
2. Set buildpack: `heroku buildpacks:set heroku/python`
3. Add PostgreSQL: `heroku addons:create heroku-postgresql:mini`

### Environment Variables

```bash
heroku config:set DISCORD_TOKEN=your_token
```

### Deploy

```bash
# Push code
git push heroku main
```

## Project Structure

```
self_dc_python/
├── bot/              # Core bot code
├── managers/         # Business logic managers
├── commands/         # Command handlers
├── repositories/     # Database repositories
├── utils/            # Utilities
├── requirements.txt  # Python dependencies
├── Procfile         # Heroku config
└── main.py          # Entry point
```

## Commands

All 25 commands migrated:

- `.help` - Show help
- `.on/.off` - Toggle features
- `.voicejoin/.voiceleave/.voicestatus` - Voice channel
- `.farm/.farmstatus` - Auto farm
- `.enchant/.enchantstatus` - Auto enchant
- `.debug/.debugstatus` - Debug mode
- `.status/.health` - Bot status

## Differences from JS Version

| Feature | JS (Old) | Python (New) |
|---------|----------|--------------|
| Library | discord.js-selfbot-v13 | discord.py-self |
| Runtime | Node.js/Bun | Python 3.11+ |
| Database | pg | asyncpg |
| Web | Express | FastAPI |
| Logging | Custom | Rich |

## Known Issues

- Library `discord.py-self` uses different API for some features
- Voice connection handling adapted for discord.py-self
- Some slash command features may differ

## License

Same as original project.
