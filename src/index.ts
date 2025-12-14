/**
 * Main entry point for the Shopping Assistant Agents system
 */

import 'dotenv/config';
import { Logger } from './utils/Logger';

// Initialize main logger
const logger = new Logger({
    component: 'ShoppingAssistantSystem',
    level: (process.env.LOG_LEVEL as any) || 'info',
});

/**
 * Shopping Assistant System main class
 */
export class ShoppingAssistantSystem {
    private logger: Logger;
    private isInitialized = false;
    private isRunning = false;

    constructor() {
        this.logger = new Logger({
            component: 'ShoppingAssistantSystem',
            level: (process.env.LOG_LEVEL as any) || 'info',
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing Shopping Assistant System...');

            // TODO: Initialize components in subsequent tasks:
            // - MCP servers (database, file-storage, cache, notification)
            // - Agents (inventory, procurement, finance, notification)
            // - LangGraph workflow engine
            // - Natural language interface

            this.isInitialized = true;
            this.logger.info('Shopping Assistant System initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Shopping Assistant System', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async start(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isRunning) {
            return;
        }

        try {
            this.logger.info('Starting Shopping Assistant System...');

            // TODO: Start all components in subsequent tasks

            this.isRunning = true;
            this.logger.info('Shopping Assistant System started successfully');
        } catch (error) {
            this.logger.error('Failed to start Shopping Assistant System', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            this.logger.info('Stopping Shopping Assistant System...');

            // TODO: Stop all components gracefully

            this.isRunning = false;
            this.logger.info('Shopping Assistant System stopped successfully');
        } catch (error) {
            this.logger.error('Failed to stop Shopping Assistant System', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    getStatus(): { initialized: boolean; running: boolean } {
        return {
            initialized: this.isInitialized,
            running: this.isRunning,
        };
    }
}

// Main execution function
async function main(): Promise<void> {
    const system = new ShoppingAssistantSystem();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await system.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await system.stop();
        process.exit(0);
    });

    try {
        await system.start();
        logger.info('Shopping Assistant System is running...');
    } catch (error) {
        logger.error('Failed to start system', {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    }
}

// Run the system if this file is executed directly
if (require.main === module) {
    main().catch(error => {
        logger.error('Unhandled error in main', {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    });
}

export default ShoppingAssistantSystem;
