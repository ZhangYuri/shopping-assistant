-- Initialize Shopping Assistant Database
-- This script runs automatically when the MySQL container starts for the first time

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS shopping_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS shopping_assistant_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS shopping_assistant_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create application user
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'app_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON shopping_assistant.* TO 'app_user'@'%';
GRANT ALL PRIVILEGES ON shopping_assistant_dev.* TO 'app_user'@'%';
GRANT ALL PRIVILEGES ON shopping_assistant_test.* TO 'app_user'@'%';

-- Flush privileges
FLUSH PRIVILEGES;

-- Use the main database
USE shopping_assistant;
