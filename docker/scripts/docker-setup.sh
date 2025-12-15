#!/bin/bash

# Docker Setup Script for Shopping Assistant System
# This script helps set up the Docker environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    print_status "Docker and Docker Compose are installed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."

    mkdir -p storage/files
    mkdir -p uploads
    mkdir -p logs
    mkdir -p docker/mysql/data
    mkdir -p docker/redis/data

    print_status "Directories created"
}

# Copy environment file
setup_environment() {
    if [ ! -f .env ]; then
        if [ "$1" = "dev" ]; then
            print_status "Copying development environment file..."
            cp .env.docker.dev .env
        else
            print_status "Copying production environment file..."
            cp .env.docker .env
        fi

        print_warning "Please edit .env file with your actual configuration values"
    else
        print_status "Environment file already exists"
    fi
}

# Build and start services
start_services() {
    local env_type=${1:-prod}

    if [ "$env_type" = "dev" ]; then
        print_status "Starting development environment..."
        docker-compose -f docker-compose.dev.yml up --build -d
    else
        print_status "Starting production environment..."
        docker-compose up --build -d
    fi
}

# Stop services
stop_services() {
    local env_type=${1:-prod}

    if [ "$env_type" = "dev" ]; then
        print_status "Stopping development environment..."
        docker-compose -f docker-compose.dev.yml down
    else
        print_status "Stopping production environment..."
        docker-compose down
    fi
}

# Show logs
show_logs() {
    local env_type=${1:-prod}
    local service=${2:-app}

    if [ "$env_type" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml logs -f $service
    else
        docker-compose logs -f $service
    fi
}

# Health check
health_check() {
    print_status "Checking service health..."

    # Check if containers are running
    if docker-compose ps | grep -q "Up"; then
        print_status "Containers are running"
    else
        print_error "Some containers are not running"
        docker-compose ps
        return 1
    fi

    # Check application health endpoint
    sleep 10
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_status "Application health check passed"
    else
        print_warning "Application health check failed - service may still be starting"
    fi
}

# Clean up
cleanup() {
    print_status "Cleaning up Docker resources..."

    # Stop and remove containers
    docker-compose down -v
    docker-compose -f docker-compose.dev.yml down -v

    # Remove images
    docker rmi $(docker images "shopping-assistant*" -q) 2>/dev/null || true

    # Clean up volumes (optional)
    read -p "Do you want to remove data volumes? This will delete all data! (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume rm $(docker volume ls -q | grep shopping-assistant) 2>/dev/null || true
        print_status "Volumes removed"
    fi

    print_status "Cleanup completed"
}

# Main script logic
case "$1" in
    "setup")
        check_docker
        create_directories
        setup_environment $2
        print_status "Setup completed. Run '$0 start' to start services."
        ;;
    "start")
        check_docker
        start_services $2
        health_check
        ;;
    "stop")
        stop_services $2
        ;;
    "restart")
        stop_services $2
        start_services $2
        health_check
        ;;
    "logs")
        show_logs $2 $3
        ;;
    "health")
        health_check
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Usage: $0 {setup|start|stop|restart|logs|health|cleanup} [dev|prod] [service]"
        echo ""
        echo "Commands:"
        echo "  setup [dev|prod]     - Initial setup (create directories, copy env file)"
        echo "  start [dev|prod]     - Start services"
        echo "  stop [dev|prod]      - Stop services"
        echo "  restart [dev|prod]   - Restart services"
        echo "  logs [dev|prod] [service] - Show logs"
        echo "  health               - Check service health"
        echo "  cleanup              - Clean up Docker resources"
        echo ""
        echo "Examples:"
        echo "  $0 setup dev         - Setup development environment"
        echo "  $0 start prod        - Start production environment"
        echo "  $0 logs dev app      - Show development app logs"
        exit 1
        ;;
esac
