@echo off
REM Docker Setup Script for Shopping Assistant System (Windows)
REM This script helps set up the Docker environment on Windows

setlocal enabledelayedexpansion

REM Check if Docker is installed
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

where docker-compose >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

echo [INFO] Docker and Docker Compose are installed

REM Function to create directories
:create_directories
echo [INFO] Creating necessary directories...
if not exist "storage\files" mkdir "storage\files"
if not exist "uploads" mkdir "uploads"
if not exist "logs" mkdir "logs"
if not exist "docker\mysql\data" mkdir "docker\mysql\data"
if not exist "docker\redis\data" mkdir "docker\redis\data"
echo [INFO] Directories created
goto :eof

REM Function to setup environment
:setup_environment
if not exist ".env" (
    if "%~1"=="dev" (
        echo [INFO] Copying development environment file...
        copy ".env.docker.dev" ".env" >nul
    ) else (
        echo [INFO] Copying production environment file...
        copy ".env.docker" ".env" >nul
    )
    echo [WARNING] Please edit .env file with your actual configuration values
) else (
    echo [INFO] Environment file already exists
)
goto :eof

REM Function to start services
:start_services
set env_type=%~1
if "%env_type%"=="dev" (
    echo [INFO] Starting development environment...
    docker-compose -f docker-compose.dev.yml up --build -d
) else (
    echo [INFO] Starting production environment...
    docker-compose up --build -d
)
goto :eof

REM Function to stop services
:stop_services
set env_type=%~1
if "%env_type%"=="dev" (
    echo [INFO] Stopping development environment...
    docker-compose -f docker-compose.dev.yml down
) else (
    echo [INFO] Stopping production environment...
    docker-compose down
)
goto :eof

REM Function to show logs
:show_logs
set env_type=%~1
set service=%~2
if "%service%"=="" set service=app

if "%env_type%"=="dev" (
    docker-compose -f docker-compose.dev.yml logs -f %service%
) else (
    docker-compose logs -f %service%
)
goto :eof

REM Function to check health
:health_check
echo [INFO] Checking service health...

REM Check if containers are running
docker-compose ps | findstr "Up" >nul
if %errorlevel% equ 0 (
    echo [INFO] Containers are running
) else (
    echo [ERROR] Some containers are not running
    docker-compose ps
    exit /b 1
)

REM Wait a bit for services to start
timeout /t 10 /nobreak >nul

REM Check application health endpoint
curl -f http://localhost:3000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Application health check passed
) else (
    echo [WARNING] Application health check failed - service may still be starting
)
goto :eof

REM Function to cleanup
:cleanup
echo [INFO] Cleaning up Docker resources...

REM Stop and remove containers
docker-compose down -v
docker-compose -f docker-compose.dev.yml down -v

REM Remove images
for /f "tokens=*" %%i in ('docker images "shopping-assistant*" -q 2^>nul') do docker rmi %%i 2>nul

REM Clean up volumes (optional)
set /p cleanup_volumes="Do you want to remove data volumes? This will delete all data! (y/N): "
if /i "%cleanup_volumes%"=="y" (
    for /f "tokens=*" %%i in ('docker volume ls -q ^| findstr shopping-assistant 2^>nul') do docker volume rm %%i 2>nul
    echo [INFO] Volumes removed
)

echo [INFO] Cleanup completed
goto :eof

REM Main script logic
if "%1"=="setup" (
    call :create_directories
    call :setup_environment %2
    echo [INFO] Setup completed. Run '%~nx0 start' to start services.
) else if "%1"=="start" (
    call :start_services %2
    call :health_check
) else if "%1"=="stop" (
    call :stop_services %2
) else if "%1"=="restart" (
    call :stop_services %2
    call :start_services %2
    call :health_check
) else if "%1"=="logs" (
    call :show_logs %2 %3
) else if "%1"=="health" (
    call :health_check
) else if "%1"=="cleanup" (
    call :cleanup
) else (
    echo Usage: %~nx0 {setup^|start^|stop^|restart^|logs^|health^|cleanup} [dev^|prod] [service]
    echo.
    echo Commands:
    echo   setup [dev^|prod]     - Initial setup ^(create directories, copy env file^)
    echo   start [dev^|prod]     - Start services
    echo   stop [dev^|prod]      - Stop services
    echo   restart [dev^|prod]   - Restart services
    echo   logs [dev^|prod] [service] - Show logs
    echo   health               - Check service health
    echo   cleanup              - Clean up Docker resources
    echo.
    echo Examples:
    echo   %~nx0 setup dev         - Setup development environment
    echo   %~nx0 start prod        - Start production environment
    echo   %~nx0 logs dev app      - Show development app logs
    exit /b 1
)
