#!/usr/bin/env node

/**
 * Database Migration Runner for Shopping Assistant System
 * This script runs database migrations in Docker environment
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Configuration from environment variables
const config = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT) || 3306,
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME || 'shopping_assistant',
    multipleStatements: true
};

// Migration files directory
const MIGRATIONS_DIR = path.join(__dirname, '../docker/migrations');

/**
 * Wait for database to be ready
 */
async function waitForDatabase(maxRetries = 30, delay = 2000) {
    console.log('Waiting for database to be ready...');

    for (let i = 0; i < maxRetries; i++) {
        try {
            const connection = await mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password
            });

            await connection.execute('SELECT 1');
            await connection.end();

            console.log('Database is ready!');
            return true;
        } catch (error) {
            console.log(`Attempt ${i + 1}/${maxRetries}: Database not ready yet...`);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error('Database failed to become ready within timeout period');
}

/**
 * Create migrations table if it doesn't exist
 */
async function createMigrationsTable(connection) {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_filename (filename)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createTableSQL);
    console.log('Migrations table ready');
}

/**
 * Get list of executed migrations
 */
async function getExecutedMigrations(connection) {
    try {
        const [rows] = await connection.execute('SELECT filename FROM migrations ORDER BY id');
        return rows.map(row => row.filename);
    } catch (error) {
        console.log('No previous migrations found');
        return [];
    }
}

/**
 * Get list of migration files
 */
async function getMigrationFiles() {
    try {
        const files = await fs.readdir(MIGRATIONS_DIR);
        return files
            .filter(file => file.endsWith('.sql'))
            .sort();
    } catch (error) {
        console.log('No migration files found in', MIGRATIONS_DIR);
        return [];
    }
}

/**
 * Execute a migration file
 */
async function executeMigration(connection, filename) {
    const filePath = path.join(MIGRATIONS_DIR, filename);

    try {
        const sql = await fs.readFile(filePath, 'utf8');

        console.log(`Executing migration: ${filename}`);

        // Split SQL by semicolons and execute each statement
        const statements = sql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        for (const statement of statements) {
            if (statement.trim()) {
                await connection.execute(statement);
            }
        }

        // Record migration as executed
        await connection.execute(
            'INSERT INTO migrations (filename) VALUES (?)',
            [filename]
        );

        console.log(`✓ Migration completed: ${filename}`);

    } catch (error) {
        console.error(`✗ Migration failed: ${filename}`);
        console.error('Error:', error.message);
        throw error;
    }
}

/**
 * Run all pending migrations
 */
async function runMigrations() {
    let connection;

    try {
        // Wait for database to be ready
        await waitForDatabase();

        // Connect to database
        connection = await mysql.createConnection(config);
        console.log('Connected to database');

        // Create migrations table
        await createMigrationsTable(connection);

        // Get executed migrations
        const executedMigrations = await getExecutedMigrations(connection);
        console.log('Executed migrations:', executedMigrations);

        // Get migration files
        const migrationFiles = await getMigrationFiles();
        console.log('Available migrations:', migrationFiles);

        // Find pending migrations
        const pendingMigrations = migrationFiles.filter(
            file => !executedMigrations.includes(file)
        );

        if (pendingMigrations.length === 0) {
            console.log('No pending migrations');
            return;
        }

        console.log(`Found ${pendingMigrations.length} pending migrations`);

        // Execute pending migrations
        for (const migration of pendingMigrations) {
            await executeMigration(connection, migration);
        }

        console.log('All migrations completed successfully!');

    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run migrations if this script is executed directly
if (require.main === module) {
    runMigrations()
        .then(() => {
            console.log('Migration process completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration process failed:', error);
            process.exit(1);
        });
}

module.exports = {
    runMigrations,
    waitForDatabase
};
