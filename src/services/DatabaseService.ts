/**
 * Database Service
 * Provides database operations with connection pooling and transaction management
 */

import mysql from 'mysql2/promise';
import { getDatabaseConfig, DatabaseConfig } from '@/config/database.config';
import { Logger } from '@/utils/Logger';
import { RetryPolicy } from '@/types/common.types';

export interface DatabaseConnectionPool {
    pool: mysql.Pool;
    config: DatabaseConfig;
}

export interface QueryResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    affectedRows?: number;
    insertId?: number;
}

export interface TransactionCallback<T> {
    (connection: mysql.PoolConnection): Promise<T>;
}

export class DatabaseService {
    private static instance: DatabaseService;
    private pool: mysql.Pool | null = null;
    private logger: Logger;
    private config: DatabaseConfig;
    private retryPolicy: RetryPolicy;

    private constructor() {
        this.logger = new Logger({
            component: 'DatabaseService',
            level: 'info'
        });

        this.config = getDatabaseConfig();
        this.retryPolicy = {
            maxRetries: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 10000
        };
    }

    public static getInstance(): DatabaseService {
        if (!DatabaseService.instance) {
            DatabaseService.instance = new DatabaseService();
        }
        return DatabaseService.instance;
    }

    /**
     * Initialize database connection pool
     */
    async initialize(): Promise<void> {
        if (this.pool) {
            return;
        }

        try {
            this.pool = mysql.createPool({
                host: this.config.host,
                port: this.config.port,
                user: this.config.user,
                password: this.config.password,
                database: this.config.database,
                connectionLimit: this.config.connectionLimit,
                ssl: this.config.ssl ? {} : undefined, // Convert boolean to SslOptions or undefined
                charset: 'utf8mb4',
                timezone: '+00:00'
            });

            // Test connection
            await this.testConnection();

            this.logger.info('Database connection pool initialized', {
                host: this.config.host,
                database: this.config.database,
                connectionLimit: this.config.connectionLimit
            });

        } catch (error) {
            this.logger.error('Failed to initialize database connection pool', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection(): Promise<boolean> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        try {
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();
            return true;
        } catch (error) {
            this.logger.error('Database connection test failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Execute a query with retry logic
     */
    async query<T = any>(
        sql: string,
        params: any[] = []
    ): Promise<QueryResult<T>> {
        return this.executeWithRetry(async () => {
            if (!this.pool) {
                await this.initialize();
            }

            const startTime = Date.now();

            try {
                const [rows, fields] = await this.pool!.execute(sql, params);
                const duration = Date.now() - startTime;

                this.logger.debug('Query executed successfully', {
                    sql: sql.substring(0, 100),
                    paramCount: params.length,
                    duration
                });

                // Handle different result types
                if (Array.isArray(rows)) {
                    return {
                        success: true,
                        data: rows as T,
                        affectedRows: (rows as any).affectedRows,
                        insertId: (rows as any).insertId
                    };
                } else {
                    return {
                        success: true,
                        data: rows as T,
                        affectedRows: (rows as any).affectedRows,
                        insertId: (rows as any).insertId
                    };
                }

            } catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : String(error);

                this.logger.error('Query execution failed', {
                    sql: sql.substring(0, 100),
                    paramCount: params.length,
                    error: errorMessage,
                    duration
                });

                return {
                    success: false,
                    error: errorMessage
                };
            }
        });
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction<T>(callback: TransactionCallback<T>): Promise<QueryResult<T>> {
        return this.executeWithRetry(async () => {
            if (!this.pool) {
                await this.initialize();
            }

            const connection = await this.pool!.getConnection();

            try {
                await connection.beginTransaction();

                const result = await callback(connection);

                await connection.commit();
                connection.release();

                this.logger.debug('Transaction completed successfully');

                return {
                    success: true,
                    data: result
                };

            } catch (error) {
                await connection.rollback();
                connection.release();

                const errorMessage = error instanceof Error ? error.message : String(error);

                this.logger.error('Transaction failed and rolled back', {
                    error: errorMessage
                });

                return {
                    success: false,
                    error: errorMessage
                };
            }
        });
    }

    /**
     * Close database connection pool
     */
    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.logger.info('Database connection pool closed');
        }
    }

    /**
     * Execute operation with retry logic
     */
    private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === this.retryPolicy.maxRetries) {
                    break;
                }

                const delay = this.calculateDelay(attempt);
                this.logger.warn(`Database operation failed, retrying in ${delay}ms`, {
                    attempt: attempt + 1,
                    maxRetries: this.retryPolicy.maxRetries,
                    error: lastError.message
                });

                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Calculate retry delay based on backoff strategy
     */
    private calculateDelay(attempt: number): number {
        const { backoffStrategy, baseDelay, maxDelay } = this.retryPolicy;

        let delay: number;

        switch (backoffStrategy) {
            case 'exponential':
                delay = baseDelay * Math.pow(2, attempt);
                break;
            case 'linear':
                delay = baseDelay * (attempt + 1);
                break;
            case 'fixed':
            default:
                delay = baseDelay;
                break;
        }

        return Math.min(delay, maxDelay);
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
