/**
 * MCP Server Registry - Manages registration and lifecycle of MCP servers
 */

import { EventEmitter } from 'events';
import { IMCPServer, MCPServerConfig, MCPServerInfo, MCPServerStatus, MCPCallResult } from '@/types/mcp.types';
import { Logger } from '@/utils/Logger';

export interface MCPServerRegistryConfig {
    healthCheckInterval: number;
    maxConcurrentCalls: number;
    defaultTimeout: number;
}

export class MCPServerRegistry extends EventEmitter {
    private servers = new Map<string, IMCPServer>();
    private serverConfigs = new Map<string, MCPServerConfig>();
    private healthCheckInterval?: NodeJS.Timeout;
    private logger: Logger;

    constructor(private config: MCPServerRegistryConfig) {
        super();
        this.logger = new Logger({
            component: 'MCPServerRegistry',
            level: 'info',
        });
    }

    /**
     * Register a new MCP server
     */
    async registerServer(server: IMCPServer): Promise<void> {
        const serverName = server.config.serverName;

        if (this.servers.has(serverName)) {
            throw new Error(`MCP server '${serverName}' is already registered`);
        }

        this.logger.info('Registering MCP server', { serverName });

        // Store server and config
        this.servers.set(serverName, server);
        this.serverConfigs.set(serverName, server.config);

        // Set up event listeners
        this.setupServerEventListeners(server);

        // Initialize and connect the server
        try {
            await server.initialize();
            await server.connect();

            this.logger.info('MCP server registered and connected successfully', { serverName });
            this.emit('serverRegistered', { serverName, server });
        } catch (error) {
            this.logger.error('Failed to initialize MCP server during registration', {
                serverName,
                error: error instanceof Error ? error.message : String(error),
            });

            // Clean up on failure
            this.servers.delete(serverName);
            this.serverConfigs.delete(serverName);
            throw error;
        }
    }

    /**
     * Unregister an MCP server
     */
    async unregisterServer(serverName: string): Promise<void> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server '${serverName}' is not registered`);
        }

        this.logger.info('Unregistering MCP server', { serverName });

        try {
            await server.disconnect();
            this.servers.delete(serverName);
            this.serverConfigs.delete(serverName);

            this.logger.info('MCP server unregistered successfully', { serverName });
            this.emit('serverUnregistered', { serverName });
        } catch (error) {
            this.logger.error('Failed to disconnect MCP server during unregistration', {
                serverName,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Get a registered MCP server
     */
    getServer(serverName: string): IMCPServer | undefined {
        return this.servers.get(serverName);
    }

    /**
     * Get all registered server names
     */
    getRegisteredServerNames(): string[] {
        return Array.from(this.servers.keys());
    }

    /**
     * Get server information for all registered servers
     */
    getAllServerInfo(): MCPServerInfo[] {
        return Array.from(this.servers.values()).map(server => server.getServerInfo());
    }

    /**
     * Get server information for a specific server
     */
    getServerInfo(serverName: string): MCPServerInfo | undefined {
        const server = this.servers.get(serverName);
        return server?.getServerInfo();
    }

    /**
     * Call a tool on a specific MCP server
     */
    async callTool<T = any>(
        serverName: string,
        toolName: string,
        parameters: any
    ): Promise<MCPCallResult<T>> {
        const server = this.servers.get(serverName);
        if (!server) {
            throw new Error(`MCP server '${serverName}' is not registered`);
        }

        if (server.status !== 'connected') {
            throw new Error(`MCP server '${serverName}' is not connected (status: ${server.status})`);
        }

        this.logger.debug('Calling tool on MCP server', { serverName, toolName, parameters });

        try {
            const result = await server.callTool<T>(toolName, parameters);

            this.logger.debug('MCP tool call completed', {
                serverName,
                toolName,
                success: result.success,
                duration: result.duration,
            });

            return result;
        } catch (error) {
            this.logger.error('MCP tool call failed', {
                serverName,
                toolName,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Get available tools from all servers or a specific server
     */
    async getAvailableTools(serverName?: string) {
        if (serverName) {
            const server = this.servers.get(serverName);
            if (!server) {
                throw new Error(`MCP server '${serverName}' is not registered`);
            }
            return server.getAvailableTools();
        }

        // Get tools from all servers
        const allTools = [];
        for (const [name, server] of this.servers) {
            try {
                const tools = await server.getAvailableTools();
                allTools.push(...tools);
            } catch (error) {
                this.logger.warn('Failed to get tools from server', {
                    serverName: name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return allTools;
    }

    /**
     * Perform health check on all servers
     */
    async performHealthCheck(): Promise<Map<string, boolean>> {
        const results = new Map<string, boolean>();

        for (const [serverName, server] of this.servers) {
            try {
                const isHealthy = await server.healthCheck();
                results.set(serverName, isHealthy);

                if (!isHealthy) {
                    this.logger.warn('MCP server health check failed', { serverName });
                    this.emit('serverUnhealthy', { serverName, server });
                }
            } catch (error) {
                this.logger.error('Health check error for MCP server', {
                    serverName,
                    error: error instanceof Error ? error.message : String(error),
                });
                results.set(serverName, false);
                this.emit('serverUnhealthy', { serverName, server, error });
            }
        }

        return results;
    }

    /**
     * Start periodic health checks
     */
    startHealthCheckMonitoring(): void {
        if (this.healthCheckInterval) {
            return; // Already started
        }

        this.logger.info('Starting MCP server health check monitoring', {
            interval: this.config.healthCheckInterval,
        });

        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.healthCheckInterval);
    }

    /**
     * Stop periodic health checks
     */
    stopHealthCheckMonitoring(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
            this.logger.info('Stopped MCP server health check monitoring');
        }
    }

    /**
     * Shutdown all servers and cleanup
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down MCP server registry');

        this.stopHealthCheckMonitoring();

        // Disconnect all servers
        const disconnectPromises = Array.from(this.servers.entries()).map(
            async ([serverName, server]) => {
                try {
                    await server.disconnect();
                    this.logger.info('MCP server disconnected during shutdown', { serverName });
                } catch (error) {
                    this.logger.error('Failed to disconnect MCP server during shutdown', {
                        serverName,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        );

        await Promise.allSettled(disconnectPromises);

        // Clear all servers
        this.servers.clear();
        this.serverConfigs.clear();

        this.logger.info('MCP server registry shutdown completed');
        this.emit('shutdown');
    }

    /**
     * Get servers by type
     */
    getServersByType(serverType: string): IMCPServer[] {
        return Array.from(this.servers.values()).filter(
            server => server.config.serverType === serverType
        );
    }

    /**
     * Get servers by status
     */
    getServersByStatus(status: MCPServerStatus): IMCPServer[] {
        return Array.from(this.servers.values()).filter(
            server => server.status === status
        );
    }

    /**
     * Check if a server is registered
     */
    isServerRegistered(serverName: string): boolean {
        return this.servers.has(serverName);
    }

    /**
     * Get registry statistics
     */
    getRegistryStats() {
        const servers = Array.from(this.servers.values());
        const statusCounts = servers.reduce((acc, server) => {
            acc[server.status] = (acc[server.status] || 0) + 1;
            return acc;
        }, {} as Record<MCPServerStatus, number>);

        const typeCounts = servers.reduce((acc, server) => {
            acc[server.config.serverType] = (acc[server.config.serverType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalServers: servers.length,
            statusCounts,
            typeCounts,
            healthyServers: servers.filter(s => s.status === 'connected').length,
        };
    }

    private setupServerEventListeners(server: IMCPServer): void {
        const serverName = server.config.serverName;

        server.on('connected', () => {
            this.logger.info('MCP server connected', { serverName });
            this.emit('serverConnected', { serverName, server });
        });

        server.on('disconnected', () => {
            this.logger.info('MCP server disconnected', { serverName });
            this.emit('serverDisconnected', { serverName, server });
        });

        server.on('statusChanged', (event) => {
            this.logger.debug('MCP server status changed', { serverName, ...event });
            this.emit('serverStatusChanged', { serverName, server, ...event });
        });

        server.on('toolCallCompleted', (toolCall) => {
            this.logger.debug('MCP tool call completed', { serverName, toolCall });
            this.emit('toolCallCompleted', { serverName, server, toolCall });
        });

        server.on('toolCallFailed', (toolCall) => {
            this.logger.warn('MCP tool call failed', { serverName, toolCall });
            this.emit('toolCallFailed', { serverName, server, toolCall });
        });

        server.on('connectionFailed', (event) => {
            this.logger.error('MCP server connection failed', { serverName, ...event });
            this.emit('serverConnectionFailed', { serverName, server, ...event });
        });
    }
}
