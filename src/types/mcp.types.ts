/**
 * MCP (Model Context Protocol) related type definitions
 */

import { BaseEntity, ErrorInfo, RetryPolicy } from './common.types';

export type MCPServerType = 'database' | 'file-storage' | 'notification' | 'custom';

export type MCPServerStatus = 'connected' | 'disconnected' | 'error' | 'initializing';

export interface MCPAuthConfig {
    authType: 'none' | 'api-key' | 'oauth' | 'certificate';
    credentials: Record<string, string>;
}

export interface MCPServerConfig {
    serverName: string;
    serverType: MCPServerType;
    connectionString: string;
    authConfig?: MCPAuthConfig;
    capabilities: string[];
    healthCheckEndpoint?: string;
    retryPolicy: RetryPolicy;
    timeout: number;
}

export interface MCPServerInfo extends BaseEntity {
    serverName: string;
    status: MCPServerStatus;
    lastHealthCheck: Date;
    errorMessage?: string;
    capabilities: string[];
    responseTime: number;
    version?: string;
}

export interface MCPToolCall extends BaseEntity {
    callId: string;
    serverName: string;
    toolName: string;
    parameters: any;
    timestamp: Date;
    duration?: number;
    success: boolean;
    result?: any;
    error?: ErrorInfo;
}

export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    serverName: string;
}

export interface MCPCallResult<T = any> {
    success: boolean;
    data?: T;
    error?: ErrorInfo;
    duration: number;
    callId: string;
}

// Base MCP server interface
export interface IMCPServer {
    readonly config: MCPServerConfig;
    readonly status: MCPServerStatus;

    initialize(): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<boolean>;
    callTool<T = any>(toolName: string, parameters: any): Promise<MCPCallResult<T>>;
    getAvailableTools(): Promise<MCPToolDefinition[]>;
    getServerInfo(): MCPServerInfo;

    // Event emitter methods
    on(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
}

// MCP Server Registry Events
export interface MCPServerRegistryEvents {
    serverRegistered: { serverName: string; server: IMCPServer };
    serverUnregistered: { serverName: string };
    serverConnected: { serverName: string; server: IMCPServer };
    serverDisconnected: { serverName: string; server: IMCPServer };
    serverStatusChanged: { serverName: string; server: IMCPServer; status: MCPServerStatus; errorMessage?: string };
    serverUnhealthy: { serverName: string; server: IMCPServer; error?: any };
    serverConnectionFailed: { serverName: string; server: IMCPServer; error: any };
    toolCallCompleted: { serverName: string; server: IMCPServer; toolCall: MCPToolCall };
    toolCallFailed: { serverName: string; server: IMCPServer; toolCall: MCPToolCall };
    shutdown: void;
}

// MCP Manager Events
export interface MCPManagerEvents extends MCPServerRegistryEvents {
    started: void;
    stopped: void;
}

// MCP Server Factory Configuration
export interface MCPServerFactoryConfig {
    validateConfigs: boolean;
    defaultTimeout: number;
    defaultRetryPolicy: RetryPolicy;
}
