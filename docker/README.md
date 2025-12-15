# Docker Configuration for Shopping Assistant System

This directory contains Docker configuration files and scripts for the Shopping Assistant System.

## Quick Start

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- At least 4GB RAM available for containers
- At least 2GB free disk space

### Development Environment

1. **Setup development environment:**
   ```bash
   # Linux/Mac
   ./docker/scripts/docker-setup.sh setup dev

   # Windows
   docker\scripts\docker-setup.bat setup dev
   ```

2. **Edit environment variables:**
   ```bash
   # Edit .env file with your actual values
   nano .env  # or use your preferred editor
   ```

3. **Start development services:**
   ```bash
   # Linux/Mac
   ./docker/scripts/docker-setup.sh start dev

   # Windows
   docker\scripts\docker-setup.bat start dev
   ```

4. **Access the application:**
   - Application: http://localhost:3000
   - Health Check: http://localhost:3000/health
   - MySQL: localhost:3307 (dev port)
   - Redis: localhost:6380 (dev port)

### Production Environment

1. **Setup production environment:**
   ```bash
   # Linux/Mac
   ./docker/scripts/docker-setup.sh setup prod

   # Windows
   docker\scripts\docker-setup.bat setup prod
   ```

2. **Configure production values:**
   ```bash
   # Edit .env file with production values
   nano .env
   ```

3. **Start production services:**
   ```bash
   # Linux/Mac
   ./docker/scripts/docker-setup.sh start prod

   # Windows
   docker\scripts\docker-setup.bat start prod
   ```

## File Structure

```
docker/
├── README.md                 # This file
├── mysql/
│   ├── conf/
│   │   └── my.cnf           # MySQL configuration
│   └── init/
│       ├── 01-create-database.sql
│       ├── 02-create-tables.sql
│       └── 03-insert-sample-data.sql
├── redis/
│   └── redis.conf           # Redis configuration
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_agent_system_tables.sql
└── scripts/
    ├── docker-setup.sh      # Linux/Mac setup script
    └── docker-setup.bat     # Windows setup script
```

## Docker Files

- `Dockerfile` - Production container image
- `Dockerfile.dev` - Development container image with hot reload
- `docker-compose.yml` - Production services configuration
- `docker-compose.dev.yml` - Development services configuration
- `.dockerignore` - Files to exclude from Docker build context

## Services

### Application (app)
- **Image**: Custom Node.js application
- **Ports**: 3000 (production), 3000 + 9229 debug (development)
- **Volumes**: Storage, uploads, logs
- **Dependencies**: MySQL, Redis

### MySQL Database (mysql)
- **Image**: mysql:8.0
- **Ports**: 3306 (production), 3307 (development)
- **Volumes**: Persistent data storage
- **Configuration**: Custom my.cnf with optimized settings

### Redis Cache (redis)
- **Image**: redis:7-alpine
- **Ports**: 6379 (production), 6380 (development)
- **Volumes**: Persistent data storage
- **Configuration**: Custom redis.conf

### Migration Service (migration)
- **Image**: Same as application
- **Purpose**: Run database migrations on startup
- **Mode**: Run once and exit

## Environment Variables

### Required Variables

```bash
# API Keys
DEEPSEEK_API_KEY=your_deepseek_api_key_here
TEAMS_WEBHOOK_URL=your_teams_webhook_url_here

# Database
DATABASE_PASSWORD=your_secure_password_here

# Security
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here
```

### Optional Variables

See `.env.docker` and `.env.docker.dev` for complete list of configurable variables.

## Database Migrations

The system uses automatic database migrations:

1. **Migration files** are located in `docker/migrations/`
2. **Migration runner** is in `scripts/run-migrations.js`
3. **Automatic execution** happens on container startup
4. **Migration tracking** is stored in `migrations` table

### Adding New Migrations

1. Create a new SQL file in `docker/migrations/`:
   ```sql
   -- Migration: 003_add_new_feature.sql
   -- Description: Add new feature tables
   -- Date: 2024-12-15

   CREATE TABLE new_feature (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(255) NOT NULL
   );
   ```

2. Restart the migration service:
   ```bash
   docker-compose restart migration
   ```

## Common Commands

### Service Management

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d app

# Stop all services
docker-compose down

# Restart service
docker-compose restart app

# View logs
docker-compose logs -f app

# Execute command in container
docker-compose exec app npm run test
```

### Development Commands

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View development logs
docker-compose -f docker-compose.dev.yml logs -f app

# Access development container shell
docker-compose -f docker-compose.dev.yml exec app sh
```

### Database Commands

```bash
# Access MySQL shell
docker-compose exec mysql mysql -u root -p shopping_assistant

# Run migrations manually
docker-compose exec app node scripts/run-migrations.js

# Backup database
docker-compose exec mysql mysqldump -u root -p shopping_assistant > backup.sql

# Restore database
docker-compose exec -T mysql mysql -u root -p shopping_assistant < backup.sql
```

### Redis Commands

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Monitor Redis commands
docker-compose exec redis redis-cli monitor

# Check Redis info
docker-compose exec redis redis-cli info
```

## Troubleshooting

### Common Issues

1. **Port conflicts:**
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :3000

   # Change port in .env file
   PORT=3001
   ```

2. **Database connection issues:**
   ```bash
   # Check MySQL logs
   docker-compose logs mysql

   # Verify database is ready
   docker-compose exec mysql mysqladmin ping -h localhost -u root -p
   ```

3. **Permission issues (Linux/Mac):**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER storage/ uploads/ logs/
   ```

4. **Out of disk space:**
   ```bash
   # Clean up Docker resources
   docker system prune -a

   # Remove unused volumes
   docker volume prune
   ```

### Health Checks

The system includes built-in health checks:

- **Application**: `GET /health`
- **MySQL**: `mysqladmin ping`
- **Redis**: `redis-cli ping`

### Monitoring

View service status:
```bash
# Check container status
docker-compose ps

# Check resource usage
docker stats

# Check logs for errors
docker-compose logs | grep ERROR
```

## Security Considerations

### Production Deployment

1. **Change default passwords** in `.env` file
2. **Use strong JWT secrets** and encryption keys
3. **Limit network exposure** - only expose necessary ports
4. **Regular updates** - keep base images updated
5. **Volume permissions** - ensure proper file permissions
6. **Secrets management** - consider using Docker secrets for sensitive data

### Network Security

- Services communicate through internal Docker network
- Only necessary ports are exposed to host
- Database and Redis are not directly accessible from outside

## Performance Tuning

### MySQL Optimization

Edit `docker/mysql/conf/my.cnf`:
```ini
# Increase buffer pool size for better performance
innodb_buffer_pool_size=512M

# Adjust connection limits
max_connections=500
```

### Redis Optimization

Edit `docker/redis/redis.conf`:
```ini
# Increase memory limit
maxmemory 512mb

# Adjust persistence settings
save 300 10
```

### Application Optimization

- Use production Node.js image
- Enable gzip compression
- Configure proper logging levels
- Set appropriate timeout values

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker-compose exec mysql mysqldump -u root -p --all-databases > full_backup.sql

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec mysql mysqldump -u root -p shopping_assistant > "backup_${DATE}.sql"
```

### Volume Backup

```bash
# Backup volumes
docker run --rm -v shopping-assistant_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_backup.tar.gz /data
```

### Recovery

```bash
# Restore database
docker-compose exec -T mysql mysql -u root -p shopping_assistant < backup.sql

# Restore volumes
docker run --rm -v shopping-assistant_mysql_data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql_backup.tar.gz -C /
```

## Support

For issues and questions:

1. Check the logs: `docker-compose logs`
2. Verify service health: `docker-compose ps`
3. Review environment configuration: `.env`
4. Check Docker resources: `docker system df`

## License

This Docker configuration is part of the Shopping Assistant System project.
