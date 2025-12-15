# Docker Quick Start Guide

## Prerequisites

1. Install Docker Desktop (Windows/Mac) or Docker Engine (Linux)
2. Ensure Docker Compose is available
3. Have at least 4GB RAM and 2GB disk space available

## Quick Setup

### Development Environment

```bash
# 1. Setup development environment
npm run docker:setup:dev
# or manually: docker/scripts/docker-setup.bat setup dev (Windows)

# 2. Edit .env file with your API keys
# Required: DEEPSEEK_API_KEY, TEAMS_WEBHOOK_URL, DATABASE_PASSWORD

# 3. Start development services
npm run docker:start:dev

# 4. Check health
curl http://localhost:3000/health

# 5. View logs
npm run docker:logs:dev
```

### Production Environment

```bash
# 1. Setup production environment
npm run docker:setup:prod

# 2. Edit .env file with production values
# Make sure to use strong passwords and real API keys

# 3. Start production services
npm run docker:start:prod

# 4. Check health
curl http://localhost:3000/health
```

## Service Ports

- **Application**: http://localhost:3000
- **MySQL Dev**: localhost:3307
- **MySQL Prod**: localhost:3306
- **Redis Dev**: localhost:6380
- **Redis Prod**: localhost:6379

## Common Commands

```bash
# Validate migrations
npm run docker:validate-migrations

# Run migrations manually
npm run docker:migrate

# Stop services
npm run docker:stop:dev    # or docker:stop:prod

# View logs
npm run docker:logs:dev    # or docker:logs:prod

# Clean up everything
npm run docker:cleanup
```

## Troubleshooting

1. **Port conflicts**: Change ports in .env file
2. **Permission issues**: Check file permissions on storage/ directories
3. **Database issues**: Check MySQL logs with `docker-compose logs mysql`
4. **Out of space**: Run `npm run docker:cleanup`

## Environment Variables

### Required
- `DEEPSEEK_API_KEY`: Your DeepSeek API key
- `DATABASE_PASSWORD`: Secure database password
- `TEAMS_WEBHOOK_URL`: Teams notification webhook

### Optional
- `JWT_SECRET`: JWT signing secret (auto-generated for dev)
- `ENCRYPTION_KEY`: Data encryption key (auto-generated for dev)

See `.env.docker` and `.env.docker.dev` for complete configuration options.

## Next Steps

1. Configure your API keys in `.env`
2. Test the health endpoint: `curl http://localhost:3000/health`
3. Check the application logs for any issues
4. Start developing with hot reload in development mode

For detailed documentation, see `docker/README.md`.
