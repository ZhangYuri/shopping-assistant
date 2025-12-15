/**
 * Main entry point for the Shopping Assistant Agents system
 */

import 'dotenv/config';
import { Logger } from './utils/Logger';
import { ShoppingAssistantServer } from './api/server';

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
    private server: ShoppingAssistantServer;
    private isInitialized = false;
    private isRunning = false;

    constructor() {
        this.logger = new Logger({
            component: 'ShoppingAssistantSystem',
            level: (process.env.LOG_LEVEL as any) || 'info',
        });

        // Initialize server with configuration from environment
        this.server = new ShoppingAssistantServer({
            port: parseInt(process.env.PORT || '3000'),
            host: process.env.HOST || '0.0.0.0',
            enableAuth: process.env.ENABLE_AUTH === 'true',
            enableCors: process.env.ENABLE_CORS !== 'false',
            maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
            uploadDir: process.env.UPLOAD_DIR || './uploads',
            enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
            enableLogging: process.env.ENABLE_LOGGING !== 'false',
            logLevel: (process.env.LOG_LEVEL as any) || 'info',
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing Shopping Assistant System...');

            // Initialize server (this will initialize all components)
            await this.server.initialize();

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

            // Start the server
            await this.server.start();

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

            // Stop the server
            await this.server.shutdown();

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

    getServer(): ShoppingAssistantServer {
        return this.server;
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
