#!/usr/bin/env node

/**
 * Migration Validation Script
 * This script validates migration files without requiring a database connection
 */

const fs = require('fs').promises;
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../docker/migrations');

/**
 * Validate migration files
 */
async function validateMigrations() {
    console.log('Validating migration files...');

    try {
        // Check if migrations directory exists
        await fs.access(MIGRATIONS_DIR);
        console.log('✓ Migrations directory exists');

        // Get migration files
        const files = await fs.readdir(MIGRATIONS_DIR);
        const migrationFiles = files
            .filter(file => file.endsWith('.sql'))
            .sort();

        if (migrationFiles.length === 0) {
            console.log('⚠ No migration files found');
            return;
        }

        console.log(`Found ${migrationFiles.length} migration files:`);

        // Validate each migration file
        for (const file of migrationFiles) {
            const filePath = path.join(MIGRATIONS_DIR, file);

            try {
                const content = await fs.readFile(filePath, 'utf8');

                // Basic validation
                if (content.trim().length === 0) {
                    console.log(`✗ ${file}: Empty file`);
                    continue;
                }

                // Check for SQL content
                if (!content.toLowerCase().includes('create table') &&
                    !content.toLowerCase().includes('alter table') &&
                    !content.toLowerCase().includes('insert into')) {
                    console.log(`⚠ ${file}: No recognizable SQL statements`);
                    continue;
                }

                // Check for proper migration header
                if (!content.includes('Migration:') || !content.includes('Description:')) {
                    console.log(`⚠ ${file}: Missing migration header`);
                }

                console.log(`✓ ${file}: Valid migration file`);

            } catch (error) {
                console.log(`✗ ${file}: Error reading file - ${error.message}`);
            }
        }

        console.log('\nMigration validation completed');

    } catch (error) {
        console.error('Validation failed:', error.message);
        process.exit(1);
    }
}

// Run validation if this script is executed directly
if (require.main === module) {
    validateMigrations()
        .then(() => {
            console.log('Validation process completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Validation process failed:', error);
            process.exit(1);
        });
}

module.exports = {
    validateMigrations
};
