/**
 * MCP (Model Context Protocol) related type definitions
 */

import { BaseEntity, ErrorInfo, RetryPolicy } from './common.types';

export type MCPServerType = 'database' | 'file-storage' | 'cache' | 'notification' | 'custom';

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
}
