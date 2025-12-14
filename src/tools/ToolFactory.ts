/**
 * Tool Factory
 * Central factory for creating and managing all DynamicTool instances
 */

import { DynamicTool } from '@langchain/core/tools';
import { Logger } from '../utils/Logger';

// Import all tool collections
import {
    createAllDatabaseTools,
    createInventoryTools,
    createOrderTools,
    createShoppingListTools,
    createFinancialTools
} from './DatabaseTools';

import {
    createAllFileStorageTools,
    createFileManagementTools,
    createImageProcessingTools,
    createExcelParsingTools
} from './FileStorageTools';

import {
    createAllStateManagementTools,
    createConversationStateTools,
    createCacheManagementTools,
    createSystemManagementTools
} from './StateManagementTools';

import {
    createAllNotificationTools,
    createBasicNotificationTools,
    createChannelManagementTools,
    createTemplateManagementTools,
    createSpecializedNotificationTools
} from './NotificationTools';

export interface ToolConfiguration {
    includeDatabaseTools?: boolean;
    includeFileStorageTools?: boolean;
    includeStateManagementTools?: boolean;
    includeNotificationTools?: boolean;
    customTools?: DynamicTool[];
}

export interface AgentToolConfiguration {
    agentType: 'inventory' | 'procurement' | 'finance' | 'notification' | 'unified';
    includeSharedTools?: boolean;
    customTools?: DynamicTool[];
}

export class ToolFactory {
    private static instance: ToolFactory;
    private logger: Logger;
    private toolRegistry: Map<string, DynamicTool>;

    private constructor() {
        this.logger = new Logger({
            component: 'ToolFactory',
            level: 'info'
        });
        this.toolRegistry = new Map();
    }

    public static getInstance(): ToolFactory {
        if (!ToolFactory.instance) {
            ToolFactory.instance = new ToolFactory();
        }
        return ToolFactory.instance;
    }

    /**
     * Create all available tools
     */
    createAllTools(config: ToolConfiguration = {}): DynamicTool[] {
        const {
            includeDatabaseTools = true,
            includeFileStorageTools = true,
            includeStateManagementTools = true,
            includeNotificationTools = true,
            customTools = []
        } = config;

        const tools: DynamicTool[] = [];

        if (includeDatabaseTools) {
            tools.push(...createAllDatabaseTools());
        }

        if (includeFileStorageTools) {
            tools.push(...createAllFileStorageTools());
        }

        if (includeStateManagementTools) {
            tools.push(...createAllStateManagementTools());
        }

        if (includeNotificationTools) {
            tools.push(...createAllNotificationTools());
        }

        tools.push(...customTools);

        // Register tools
        this.registerTools(tools);

        this.logger.info('All tools created', {
            totalTools: tools.length,
            databaseTools: includeDatabaseTools,
            fileStorageTools: includeFileStorageTools,
            stateManagementTools: includeStateManagementTools,
            notificationTools: includeNotificationTools,
            customTools: customTools.length
        });

        return tools;
    }

    /**
     * Create tools for specific agent type
     */
    createAgentTools(config: AgentToolConfiguration): DynamicTool[] {
        const { agentType, includeSharedTools = true, customTools = [] } = config;

        const tools: DynamicTool[] = [];

        // Add shared tools if requested
        if (includeSharedTools) {
            tools.push(...createConversationStateTools());
            tools.push(...createCacheManagementTools());
        }

        // Add agent-specific tools
        switch (agentType) {
            case 'inventory':
                tools.push(...createInventoryTools());
                tools.push(...createFileManagementTools());
                tools.push(...createImageProcessingTools());
                tools.push(...createBasicNotificationTools());
                break;

            case 'procurement':
                tools.push(...createOrderTools());
                tools.push(...createShoppingListTools());
                tools.push(...createExcelParsingTools());
                tools.push(...createFileManagementTools());
                tools.push(...createBasicNotificationTools());
                break;

            case 'finance':
                tools.push(...createFinancialTools());
                tools.push(...createOrderTools());
                tools.push(...createBasicNotificationTools());
                break;

            case 'notification':
                tools.push(...createAllNotificationTools());
                tools.push(...createSystemManagementTools());
                break;

            case 'unified':
                tools.push(...this.createAllTools().filter(tool =>
                    !includeSharedTools || !this.isSharedTool(tool)
                ));
                break;

            default:
                this.logger.warn('Unknown agent type, creating minimal tool set', { agentType });
                tools.push(...createConversationStateTools());
                break;
        }

        tools.push(...customTools);

        // Register tools
        this.registerTools(tools);

        this.logger.info('Agent tools created', {
            agentType,
            totalTools: tools.length,
            includeSharedTools,
            customTools: customTools.length
        });

        return tools;
    }

    /**
     * Create database tools only
     */
    createDatabaseTools(): DynamicTool[] {
        const tools = createAllDatabaseTools();
        this.registerTools(tools);
        return tools;
    }

    /**
     * Create file storage tools only
     */
    createFileStorageTools(): DynamicTool[] {
        const tools = createAllFileStorageTools();
        this.registerTools(tools);
        return tools;
    }

    /**
     * Create state management tools only
     */
    createStateManagementTools(): DynamicTool[] {
        const tools = createAllStateManagementTools();
        this.registerTools(tools);
        return tools;
    }

    /**
     * Create notification tools only
     */
    createNotificationTools(): DynamicTool[] {
        const tools = createAllNotificationTools();
        this.registerTools(tools);
        return tools;
    }

    /**
     * Create inventory-specific tools
     */
    createInventoryAgentTools(): DynamicTool[] {
        return this.createAgentTools({ agentType: 'inventory' });
    }

    /**
     * Create procurement-specific tools
     */
    createProcurementAgentTools(): DynamicTool[] {
        return this.createAgentTools({ agentType: 'procurement' });
    }

    /**
     * Create finance-specific tools
     */
    createFinanceAgentTools(): DynamicTool[] {
        return this.createAgentTools({ agentType: 'finance' });
    }

    /**
     * Create notification-specific tools
     */
    createNotificationAgentTools(): DynamicTool[] {
        return this.createAgentTools({ agentType: 'notification' });
    }

    /**
     * Get tool by name
     */
    getTool(toolName: string): DynamicTool | undefined {
        return this.toolRegistry.get(toolName);
    }

    /**
     * Get all registered tools
     */
    getAllRegisteredTools(): DynamicTool[] {
        return Array.from(this.toolRegistry.values());
    }

    /**
     * Get tool names
     */
    getToolNames(): string[] {
        return Array.from(this.toolRegistry.keys());
    }

    /**
     * Check if tool exists
     */
    hasTool(toolName: string): boolean {
        return this.toolRegistry.has(toolName);
    }

    /**
     * Get tools by category
     */
    getToolsByCategory(category: 'database' | 'file-storage' | 'state-management' | 'notification'): DynamicTool[] {
        const tools: DynamicTool[] = [];

        for (const tool of this.toolRegistry.values()) {
            if (this.getToolCategory(tool) === category) {
                tools.push(tool);
            }
        }

        return tools;
    }

    /**
     * Get tool statistics
     */
    getToolStatistics(): {
        totalTools: number;
        databaseTools: number;
        fileStorageTools: number;
        stateManagementTools: number;
        notificationTools: number;
        categories: Record<string, number>;
    } {
        const stats = {
            totalTools: this.toolRegistry.size,
            databaseTools: 0,
            fileStorageTools: 0,
            stateManagementTools: 0,
            notificationTools: 0,
            categories: {} as Record<string, number>
        };

        for (const tool of this.toolRegistry.values()) {
            const category = this.getToolCategory(tool);

            switch (category) {
                case 'database':
                    stats.databaseTools++;
                    break;
                case 'file-storage':
                    stats.fileStorageTools++;
                    break;
                case 'state-management':
                    stats.stateManagementTools++;
                    break;
                case 'notification':
                    stats.notificationTools++;
                    break;
            }

            stats.categories[category] = (stats.categories[category] || 0) + 1;
        }

        return stats;
    }

    /**
     * Clear tool registry
     */
    clearRegistry(): void {
        this.toolRegistry.clear();
        this.logger.info('Tool registry cleared');
    }

    // Private helper methods

    /**
     * Register tools in the registry
     */
    private registerTools(tools: DynamicTool[]): void {
        for (const tool of tools) {
            this.toolRegistry.set(tool.name, tool);
        }
    }

    /**
     * Determine tool category based on tool name
     */
    private getToolCategory(tool: DynamicTool): string {
        const name = tool.name.toLowerCase();

        if (name.includes('inventory') || name.includes('order') || name.includes('shopping') || name.includes('spending')) {
            return 'database';
        }

        if (name.includes('file') || name.includes('image') || name.includes('ocr') || name.includes('excel') || name.includes('upload')) {
            return 'file-storage';
        }

        if (name.includes('conversation') || name.includes('cache') || name.includes('state')) {
            return 'state-management';
        }

        if (name.includes('notification') || name.includes('teams') || name.includes('alert') || name.includes('template')) {
            return 'notification';
        }

        return 'other';
    }

    /**
     * Check if tool is a shared tool
     */
    private isSharedTool(tool: DynamicTool): boolean {
        const sharedToolNames = [
            'save_conversation_state',
            'load_conversation_state',
            'add_conversation_turn',
            'get_conversation_stats',
            'clear_conversation_state',
            'cache_analysis_result',
            'get_cached_analysis_result',
            'clear_expired_cache'
        ];

        return sharedToolNames.includes(tool.name);
    }
}

// Convenience functions for easy access

/**
 * Get the ToolFactory instance
 */
export function getToolFactory(): ToolFactory {
    return ToolFactory.getInstance();
}

/**
 * Create all tools with default configuration
 */
export function createAllTools(): DynamicTool[] {
    return getToolFactory().createAllTools();
}

/**
 * Create tools for specific agent
 */
export function createToolsForAgent(agentType: AgentToolConfiguration['agentType']): DynamicTool[] {
    return getToolFactory().createAgentTools({ agentType });
}

/**
 * Create minimal tool set for testing
 */
export function createMinimalTools(): DynamicTool[] {
    return getToolFactory().createAllTools({
        includeDatabaseTools: true,
        includeFileStorageTools: false,
        includeStateManagementTools: true,
        includeNotificationTools: false
    });
}
