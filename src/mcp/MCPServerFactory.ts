/**
 * MCP Server Factory - Creates MCP server instances based on configuration
 */

import { IMCPServer, MCPServerConfig, MCPServerType } from '@/types/mcp.types';
import { Logger } from '@/utils/Logger';

// Import concrete MCP server implementations
// These will be implemented in subsequent tasks
import { DatabaseMCPServer } from './servers/DatabaseMCPServer';
import { FileStorageMCPServer } from './servers/FileStorageMCPServer';
import { CacheMCPServer } from './servers/CacheMCPServer';
import { NotificationMCPServer } from './servers/NotificationMCPServer';

export class MCPServerFactory {
    private static logger = new Logger({
        component: 'MCPServerFactory',
        level: 'info',
    });

    /**
     * Create an MCP server instance based on the provided configuration
     */
    static createServer(config: MCPServerConfig): IMCPServer {
        this.logger.info('Creating MCP server', {
            serverName: config.serverName,
            serverType: config.serverType,
        });

        switch (config.serverType) {
            case 'database':
                return new DatabaseMCPServer(config);

            case 'file-storage':
                return new FileStorageMCPServer(config);

            case 'cache':
                return new CacheMCPServer(config);

            case 'notification':
                return new NotificationMCPServer(config);

            default:
                throw new Error(`Unsupported MCP server type: ${config.serverType}`);
        }
    }

    /**
     * Create multiple MCP servers from an array of configurations
     */
    static createServers(configs: MCPServerConfig[]): IMCPServer[] {
        return configs.map(config => this.createServer(config));
    }

    /**
     * Validate MCP server configuration
     */
    static validateConfig(config: MCPServerConfig): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Required fields validation
        if (!config.serverName || config.serverName.trim() === '') {
            errors.push('Server name is required');
        }

        if (!config.serverType) {
            errors.push('Server type is required');
        }

        if (!config.connectionString || config.connectionString.trim() === '') {
            errors.push('Connection string is required');
        }

        if (!config.capabilities || config.capabilities.length === 0) {
            errors.push('At least one capability must be specified');
        }

        if (!config.retryPolicy) {
            errors.push('Retry policy is required');
        } else {
            // Validate retry policy
            if (config.retryPolicy.maxRetries < 0) {
                errors.push('Max retries must be non-negative');
            }
            if (config.retryPolicy.baseDelay <= 0) {
                errors.push('Base delay must be positive');
            }
            if (config.retryPolicy.maxDelay <= 0) {
                errors.push('Max delay must be positive');
            }
            if (config.retryPolicy.baseDelay > config.retryPolicy.maxDelay) {
                errors.push('Base delay cannot be greater than max delay');
            }
        }

        if (config.timeout && config.timeout <= 0) {
            errors.push('Timeout must be positive');
        }

        // Server type specific validations
        switch (config.serverType) {
            case 'database':
                this.validateDatabaseConfig(config, errors);
                break;
            case 'file-storage':
                this.validateFileStorageConfig(config, errors);
                break;
            case 'cache':
                this.validateCacheConfig(config, errors);
                break;
            case 'notification':
                this.validateNotificationConfig(config, errors);
                break;
        }

        return {
            isValid: errors.length === 0,
            errors,
        };
    }

    /**
     * Create default configuration for a server type
     */
    static createDefaultConfig(
        serverName: string,
        serverType: MCPServerType,
        connectionString: string
    ): MCPServerConfig {
        const baseConfig: MCPServerConfig = {
            serverName,
            serverType,
            connectionString,
            capabilities: this.getDefaultCapabilities(serverType),
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 10000,
            },
            timeout: 30000,
        };

        return baseConfig;
    }

    /**
     * Get supported server types
     */
    static getSupportedServerTypes(): MCPServerType[] {
        return ['database', 'file-storage', 'cache', 'notification'];
    }

    /**
     * Get default capabilities for a server type
     */
    static getDefaultCapabilities(serverType: MCPServerType): string[] {
        switch (serverType) {
            case 'database':
                return [
                    'inventory_operations',
                    'order_operations',
                    'shopping_list_operations',
                    'financial_operations',
                    'query_operations',
                    'transaction_operations',
                ];

            case 'file-storage':
                return [
                    'file_upload',
                    'file_download',
                    'image_processing',
                    'ocr_processing',
                    'excel_parsing',
                    'file_metadata',
                ];

            case 'cache':
                return [
                    'cache_operations',
                    'conversation_context',
                    'session_management',
                    'cache_invalidation',
                ];

            case 'notification':
                return [
                    'notification_sending',
                    'template_management',
                    'user_preferences',
                    'notification_history',
                    'channel_management',
                ];

            default:
                return [];
        }
    }

    private static validateDatabaseConfig(config: MCPServerConfig, errors: string[]): void {
        // Database-specific validation
        const requiredCapabilities = ['inventory_operations', 'order_operations'];
        const missingCapabilities = requiredCapabilities.filter(
            cap => !config.capabilities.includes(cap)
        );

        if (missingCapabilities.length > 0) {
            errors.push(`Database server missing required capabilities: ${missingCapabilities.join(', ')}`);
        }

        // Validate connection string format for database
        if (!config.connectionString.includes('://')) {
            errors.push('Database connection string must include protocol (e.g., mysql://, postgresql://)');
        }
    }

    private static validateFileStorageConfig(config: MCPServerConfig, errors: string[]): void {
        // File storage-specific validation
        const requiredCapabilities = ['file_upload', 'file_download'];
        const missingCapabilities = requiredCapabilities.filter(
            cap => !config.capabilities.includes(cap)
        );

        if (missingCapabilities.length > 0) {
            errors.push(`File storage server missing required capabilities: ${missingCapabilities.join(', ')}`);
        }
    }

    private static validateCacheConfig(config: MCPServerConfig, errors: string[]): void {
        // Cache-specific validation
        const requiredCapabilities = ['cache_operations'];
        const missingCapabilities = requiredCapabilities.filter(
            cap => !config.capabilities.includes(cap)
        );

        if (missingCapabilities.length > 0) {
            errors.push(`Cache server missing required capabilities: ${missingCapabilities.join(', ')}`);
        }
    }

    private static validateNotificationConfig(config: MCPServerConfig, errors: string[]): void {
        // Notification-specific validation
        const requiredCapabilities = ['notification_sending'];
        const missingCapabilities = requiredCapabilities.filter(
            cap => !config.capabilities.includes(cap)
        );

        if (missingCapabilities.length > 0) {
            errors.push(`Notification server missing required capabilities: ${missingCapabilities.join(', ')}`);
        }
    }
}
