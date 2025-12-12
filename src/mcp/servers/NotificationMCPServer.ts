/**
 * Notification MCP Server - Placeholder for task 2.8
 * This will be implemented in task 2.8
 */

import { BaseMCPServer } from '../base/BaseMCPServer';
import { MCPServerConfig, MCPToolDefinition } from '@/types/mcp.types';

export class NotificationMCPServer extends BaseMCPServer {
    constructor(config: MCPServerConfig) {
        super(config);
    }

    protected async onInitialize(): Promise<void> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }

    protected async onConnect(): Promise<void> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }

    protected async onDisconnect(): Promise<void> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }

    protected async onHealthCheck(): Promise<boolean> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }

    protected async onCallTool<T = any>(toolName: string, parameters: any): Promise<T> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }

    protected async onGetAvailableTools(): Promise<MCPToolDefinition[]> {
        // Will be implemented in task 2.8
        throw new Error('NotificationMCPServer not yet implemented - will be completed in task 2.8');
    }
}
