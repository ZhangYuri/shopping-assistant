/**
 * Base abstract class for all MCP servers in the shopping assistant system
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
    IMCPServer,
    MCPServerConfig,
    MCPServerInfo,
    MCPServerStatus,
    MCPToolCall,
    MCPToolDefinition,
    MCPCallResult,
} from '@/types/mcp.types';
import { ErrorInfo } from '@/types/common.types';
import { Logger } from '@/utils/Logger';

export abstract class BaseMCPServer extends EventEmitter implements IMCPServer {
    protected logger: Logger;
    protected _status: MCPServerStatus = 'disconnected';
    protected _serverInfo: MCPServerInfo;
    protected isInitialized = false;
    protected lastHealthCheck = new Date();
    protected connectionRetryCount = 0;

    constructor(public readonly config: MCPServerConfig) {
        super();
        this.logger = new Logger({
            component: `MCP:${config.serverName}`,
            level: 'info',
        });

        this._serverInfo = {
            id: uuidv4(),
            serverName: config.serverName,
            status: 'disconnected',
            lastHealthCheck: new Date(),
            capabilities: [...config.capabilities],
            responseTime: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    }

    get status(): MCPServerStatus {
        return this._status;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing MCP server', { serverName: this.config.serverName });

            this.updateStatus('initializing');
            await this.onInitialize();

            this.isInitialized = true;
            this.logger.info('MCP server initialized successfully', {
                serverName: this.config.serverName,
            });

            this.emit('initialized', this.config.serverName);
        } catch (error) {
            this.logger.error('Failed to initialize MCP server', {
                serverName: this.config.serverName,
                error: error instanceof Error ? error.message : String(error),
            });
            this.updateStatus('error', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async connect(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this._status === 'connected') {
            return;
        }

        try {
            this.logger.info('Connecting to MCP server', { serverName: this.config.serverName });

            this.updateStatus('initializing');
            await this.onConnect();

            this.updateStatus('connected');
            this.connectionRetryCount = 0;

            this.logger.info('MCP server connected successfully', {
                serverName: this.config.serverName,
            });
            this.emit('connected', this.config.serverName);

            // Start health check monitoring
            this.startHealthCheckMonitoring();
        } catch (error) {
            this.connectionRetryCount++;
            this.logger.error('Failed to connect to MCP server', {
                serverName: this.config.serverName,
                error: error instanceof Error ? error.message : String(error),
                retryCount: this.connectionRetryCount,
            });

            this.updateStatus('error', error instanceof Error ? error.message : String(error));

            // Implement retry logic
            if (this.connectionRetryCount < this.config.retryPolicy.maxRetries) {
                const delay = this.calculateRetryDelay();
                this.logger.info(`Retrying connection in ${delay}ms`, {
                    serverName: this.config.serverName,
                    retryCount: this.connectionRetryCount,
                });

                setTimeout(() => this.connect(), delay);
            } else {
                this.emit('connectionFailed', { serverName: this.config.serverName, error });
                throw error;
            }
        }
    }

    async disconnect(): Promise<void> {
        if (this._status === 'disconnected') {
            return;
        }

        try {
            this.logger.info('Disconnecting from MCP server', {
                serverName: this.config.serverName,
            });

            await this.onDisconnect();
            this.updateStatus('disconnected');

            this.logger.info('MCP server disconnected successfully', {
                serverName: this.config.serverName,
            });
            this.emit('disconnected', this.config.serverName);
        } catch (error) {
            this.logger.error('Failed to disconnect from MCP server', {
                serverName: this.config.serverName,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const startTime = Date.now();
            const isHealthy = await this.onHealthCheck();
            const responseTime = Date.now() - startTime;

            this.lastHealthCheck = new Date();
            this._serverInfo.responseTime = responseTime;
            this._serverInfo.lastHealthCheck = this.lastHealthCheck;

            if (isHealthy && this._status !== 'connected') {
                this.updateStatus('connected');
            } else if (!isHealthy && this._status === 'connected') {
                this.updateStatus('error', 'Health check failed');
            }

            this.logger.debug('Health check completed', {
                serverName: this.config.serverName,
                isHealthy,
                responseTime,
            });

            return isHealthy;
        } catch (error) {
            this.logger.error('Health check failed', {
                serverName: this.config.serverName,
                error: error instanceof Error ? error.message : String(error),
            });

            this.updateStatus('error', error instanceof Error ? error.message : String(error));
            return false;
        }
    }

    async callTool<T = any>(toolName: string, parameters: any): Promise<MCPCallResult<T>> {
        if (this._status !== 'connected') {
            throw new Error(`MCP server ${this.config.serverName} is not connected`);
        }

        const callId = uuidv4();
        const startTime = Date.now();

        const toolCall: MCPToolCall = {
            id: uuidv4(),
            callId,
            serverName: this.config.serverName,
            toolName,
            parameters,
            timestamp: new Date(),
            success: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        try {
            this.logger.debug('Calling MCP tool', {
                serverName: this.config.serverName,
                toolName,
                callId,
                parameters,
            });

            const result = await Promise.race([
                this.onCallTool<T>(toolName, parameters),
                this.createTimeoutPromise<T>(),
            ]);

            const duration = Date.now() - startTime;

            toolCall.success = true;
            toolCall.result = result;
            toolCall.duration = duration;

            this.logger.debug('MCP tool call completed successfully', {
                serverName: this.config.serverName,
                toolName,
                callId,
                duration,
            });

            this.emit('toolCallCompleted', toolCall);

            return {
                success: true,
                data: result,
                duration,
                callId,
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorInfo: ErrorInfo = {
                code: 'MCP_TOOL_CALL_ERROR',
                message: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
                details: { toolName, parameters },
            };

            toolCall.success = false;
            toolCall.error = errorInfo;
            toolCall.duration = duration;

            this.logger.error('MCP tool call failed', {
                serverName: this.config.serverName,
                toolName,
                callId,
                error: errorInfo.message,
                duration,
            });

            this.emit('toolCallFailed', toolCall);

            return {
                success: false,
                error: errorInfo,
                duration,
                callId,
            };
        }
    }

    async getAvailableTools(): Promise<MCPToolDefinition[]> {
        return this.onGetAvailableTools();
    }

    getServerInfo(): MCPServerInfo {
        return { ...this._serverInfo };
    }

    // Protected helper methods
    protected updateStatus(status: MCPServerStatus, errorMessage?: string): void {
        this._status = status;
        this._serverInfo.status = status;
        this._serverInfo.errorMessage = errorMessage;
        this._serverInfo.updatedAt = new Date();

        this.emit('statusChanged', { serverName: this.config.serverName, status, errorMessage });
    }

    private calculateRetryDelay(): number {
        const { backoffStrategy, baseDelay, maxDelay } = this.config.retryPolicy;

        switch (backoffStrategy) {
            case 'exponential':
                return Math.min(baseDelay * Math.pow(2, this.connectionRetryCount - 1), maxDelay);
            case 'linear':
                return Math.min(baseDelay * this.connectionRetryCount, maxDelay);
            case 'fixed':
            default:
                return baseDelay;
        }
    }

    private createTimeoutPromise<T>(): Promise<T> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`MCP tool call timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);
        });
    }

    private startHealthCheckMonitoring(): void {
        // Perform health checks every 30 seconds
        const healthCheckInterval = setInterval(async () => {
            if (this._status === 'disconnected') {
                clearInterval(healthCheckInterval);
                return;
            }

            await this.healthCheck();
        }, 30000);
    }

    // Abstract methods that must be implemented by concrete MCP servers
    protected abstract onInitialize(): Promise<void>;
    protected abstract onConnect(): Promise<void>;
    protected abstract onDisconnect(): Promise<void>;
    protected abstract onHealthCheck(): Promise<boolean>;
    protected abstract onCallTool<T = any>(toolName: string, parameters: any): Promise<T>;
    protected abstract onGetAvailableTools(): Promise<MCPToolDefinition[]>;
}
