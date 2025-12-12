/**
 * MCP Manager - High-level manager for MCP server lifecycle and operations
 */

import { EventEmitter } from 'events';
import { MCPServerRegistry, MCPServerRegistryConfig } from './MCPServerRegistry';
import { MCPServerFactory } from './MCPServerFactory';
import { IMCPServer, MCPServerConfig, MCPServerInfo, MCPCallResult } from '@/types/mcp.types';
import { Logger } from '@/utils/Logger';

export interface MCPManagerConfig {
    registry: MCPServerRegistryConfig;
    autoStart: boolean;
    configValidation: boolean;
}

export class MCPManager extends EventEmitter {
    private registry: MCPServerRegistry;
    private logger: Logger;
    private isStarted = false;

    constructor(private config: MCPManagerConfig) {
        super();
        this.registry = new MCPServerRegistry(config.registry);
        this.logger = new Logger({
            component: 'MCPManager',
            level: 'info',
        });

        // Forward registry events
        this.setupRegistryEventForwarding();
    }

    /**
     * Initialize and start the MCP manager
     */
    async start(): Promise<void> {
        if (this.isStarted) {
            this.logger.warn('MCP Manager is already started');
            return;
        }

        this.logger.info('Starting MCP Manager');

        try {
            // Start health check monitoring
            this.registry.startHealthCheckMonitoring();

            this.isStarted = true;
            this.logger.info('MCP Manager started successfully');
            this.emit('started');
        } catch (error) {
            this.logger.error('Failed to start MCP Manager', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Stop the MCP manager and shutdown all servers
     */
    async stop(): Promise<void> {
        if (!this.isStarted) {
            this.logger.warn('MCP Manager is not started');
            return;
        }

        this.logger.info('Stopping MCP Manager');

        try {
            await this.registry.shutdown();
            this.isStarted = false;

            this.logger.info('MCP Manager stopped successfully');
            this.emit('stopped');
        } catch (error) {
            this.logger.error('Failed to stop MCP Manager', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Register a new MCP server from configuration
     */
    async registerServerFromConfig(config: MCPServerConfig): Promise<void> {
        // Validate configuration if enabled
        if (this.config.configValidation) {
            const validation = MCPServerFactory.validateConfig(config);
            if (!validation.isValid) {
                throw new Error(`Invalid MCP server configuration: ${validation.errors.join(', ')}`);
            }
        }

        this.logger.info('Registering MCP server from configuration', {
            serverName: config.serverName,
            serverType: config.serverType,
        });

        try {
            // Create server instance
            const server = MCPServerFactory.createServer(config);

            // Register with registry
            await this.registry.registerServer(server);

            this.logger.info('MCP server registered successfully from configuration', {
                serverName: config.serverName,
            });
        } catch (error) {
            this.logger.error('Failed to register MCP server from configuration', {
                serverName: config.serverName,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Register multiple MCP servers from configurations
     */
    async registerServersFromConfigs(configs: MCPServerConfig[]): Promise<void> {
        this.logger.info('Registering multiple MCP servers', { count: configs.length });

        const results = await Promise.allSettled(
            configs.map(config => this.registerServerFromConfig(config))
        );

        const failures = results
            .map((result, index) => ({ result, config: configs[index] }))
            .filter(({ result }) => result.status === 'rejected');

        if (failures.length > 0) {
            this.logger.error('Some MCP servers failed to register', {
                failureCount: failures.length,
                totalCount: configs.length,
            });

            const errorMessages = failures.map(({ result, config }) =>
                `${config.serverName}: ${(result as PromiseRejectedResult).reason}`
            );

            throw new Error(`Failed to register ${failures.length} MCP servers: ${errorMessages.join('; ')}`);
        }

        this.logger.info('All MCP servers registered successfully', { count: configs.length });
    }

    /**
     * Unregister an MCP server
     */
    async unregisterServer(serverName: string): Promise<void> {
        return this.registry.unregisterServer(serverName);
    }

    /**
     * Get a registered MCP server
     */
    getServer(serverName: string): IMCPServer | undefined {
        return this.registry.getServer(serverName);
    }

    /**
     * Call a tool on a specific MCP server
     */
    async callTool<T = any>(
        serverName: string,
        toolName: string,
        parameters: any
    ): Promise<MCPCallResult<T>> {
        return this.registry.callTool<T>(serverName, toolName, parameters);
    }

    /**
     * Call a tool with automatic server selection based on capability
     */
    async callToolByCapability<T = any>(
        capability: string,
        toolName: string,
        parameters: any
    ): Promise<MCPCallResult<T>> {
        const servers = this.getServersByCapability(capability);

        if (servers.length === 0) {
            throw new Error(`No MCP servers found with capability: ${capability}`);
        }

        // Use the first available server with the capability
        const server = servers.find(s => s.status === 'connected');
        if (!server) {
            throw new Error(`No connected MCP servers found with capability: ${capability}`);
        }

        return this.registry.callTool<T>(server.config.serverName, toolName, parameters);
    }

    /**
     * Get available tools from all servers or a specific server
     */
    async getAvailableTools(serverName?: string) {
        return this.registry.getAvailableTools(serverName);
    }

    /**
     * Get all server information
     */
    getAllServerInfo(): MCPServerInfo[] {
        return this.registry.getAllServerInfo();
    }

    /**
     * Get server information for a specific server
     */
    getServerInfo(serverName: string): MCPServerInfo | undefined {
        return this.registry.getServerInfo(serverName);
    }

    /**
     * Get servers by capability
     */
    getServersByCapability(capability: string): IMCPServer[] {
        return this.registry.getRegisteredServerNames()
            .map(name => this.registry.getServer(name)!)
            .filter(server => server.config.capabilities.includes(capability));
    }

    /**
     * Get servers by type
     */
    getServersByType(serverType: string): IMCPServer[] {
        return this.registry.getServersByType(serverType);
    }

    /**
     * Perform health check on all servers
     */
    async performHealthCheck(): Promise<Map<string, boolean>> {
        return this.registry.performHealthCheck();
    }

    /**
     * Get manager and registry statistics
     */
    getStats() {
        const registryStats = this.registry.getRegistryStats();

        return {
            isStarted: this.isStarted,
            registry: registryStats,
            capabilities: this.getCapabilityStats(),
        };
    }

    /**
     * Check if manager is started
     */
    isManagerStarted(): boolean {
        return this.isStarted;
    }

    /**
     * Get registered server names
     */
    getRegisteredServerNames(): string[] {
        return this.registry.getRegisteredServerNames();
    }

    /**
     * Check if a server is registered
     */
    isServerRegistered(serverName: string): boolean {
        return this.registry.isServerRegistered(serverName);
    }

    /**
     * Create default server configurations for common setups
     */
    static createDefaultServerConfigs(): MCPServerConfig[] {
        return [
            MCPServerFactory.createDefaultConfig(
                'database-server',
                'database',
                process.env.DATABASE_URL || 'mysql://localhost:3306/shopping_assistant'
            ),
            MCPServerFactory.createDefaultConfig(
                'file-storage-server',
                'file-storage',
                process.env.FILE_STORAGE_PATH || './storage'
            ),
            MCPServerFactory.createDefaultConfig(
                'cache-server',
                'cache',
                process.env.REDIS_URL || 'redis://localhost:6379'
            ),
            MCPServerFactory.createDefaultConfig(
                'notification-server',
                'notification',
                process.env.NOTIFICATION_CONFIG || 'config://default'
            ),
        ];
    }

    private setupRegistryEventForwarding(): void {
        // Forward all registry events with 'mcp:' prefix
        const eventsToForward = [
            'serverRegistered',
            'serverUnregistered',
            'serverConnected',
            'serverDisconnected',
            'serverStatusChanged',
            'serverUnhealthy',
            'serverConnectionFailed',
            'toolCallCompleted',
            'toolCallFailed',
            'shutdown',
        ];

        eventsToForward.forEach(eventName => {
            this.registry.on(eventName, (data) => {
                this.emit(`mcp:${eventName}`, data);
            });
        });
    }

    private getCapabilityStats() {
        const servers = this.registry.getRegisteredServerNames()
            .map(name => this.registry.getServer(name)!)
            .filter(Boolean);

        const capabilityCount = new Map<string, number>();

        servers.forEach(server => {
            server.config.capabilities.forEach(capability => {
                capabilityCount.set(capability, (capabilityCount.get(capability) || 0) + 1);
            });
        });

        return Object.fromEntries(capabilityCount);
    }
}
