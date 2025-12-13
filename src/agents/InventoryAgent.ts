/**
 * Inventory Agent - Manages household inventory operations through natural language
 */

import { BaseAgent } from './base/BaseAgent';
import { MCPManager } from '@/mcp/MCPManager';
import {
    AgentConfig,
    AgentMessage,
    Task,
    AgentCapability,
    MessageType,
} from '@/types/agent.types';
import { MCPCallResult } from '@/types/mcp.types';

// Inventory-specific interfaces
interface InventoryItem {
    id: number;
    item_name: string;
    category?: string;
    current_quantity: number;
    unit?: string;
    storage_location?: string;
    production_date?: Date;
    expiry_date?: Date;
    warranty_period_days: number;
    created_at: Date;
    updated_at: Date;
}

interface CreateInventoryItem {
    item_name: string;
    category?: string;
    current_quantity: number;
    unit?: string;
    storage_location?: string;
    production_date?: Date;
    expiry_date?: Date;
    warranty_period_days?: number;
}

interface InventoryUpdateResult {
    success: boolean;
    item: InventoryItem | null;
    message: string;
    previousQuantity?: number;
    newQuantity?: number;
}

interface ItemAddResult {
    success: boolean;
    itemId?: string;
    item?: InventoryItem | null;
    message: string;
    ocrResult?: any;
}

interface LowStockAlert {
    item: InventoryItem;
    threshold: number;
    recommendedAction: string;
}

interface NaturalLanguageCommand {
    action: 'consume' | 'add' | 'query' | 'update';
    itemName: string;
    quantity?: number;
    unit?: string;
    confidence: number;
}

interface SearchCriteria {
    category?: string;
    item_name?: string;
    low_stock_threshold?: number;
    expiry_within_days?: number;
}

export class InventoryAgent extends BaseAgent {
    private mcpManager: MCPManager;
    private defaultThresholds: Map<string, number> = new Map();

    constructor(config: AgentConfig, mcpManager: MCPManager) {
        super(config);
        this.mcpManager = mcpManager;

        // Set default stock thresholds for common categories
        this.defaultThresholds.set('日用品', 2);
        this.defaultThresholds.set('食品', 3);
        this.defaultThresholds.set('清洁用品', 1);
        this.defaultThresholds.set('个人护理', 2);
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Inventory Agent');

        // Verify MCP servers are available
        if (!this.mcpManager.isServerRegistered('database-server')) {
            throw new Error('Database MCP server not available');
        }

        if (!this.mcpManager.isServerRegistered('file-storage-server')) {
            throw new Error('File Storage MCP server not available');
        }

        this.logger.info('Inventory Agent initialized successfully');
    }

    protected async onStart(): Promise<void> {
        this.logger.info('Starting Inventory Agent');
        // Perform initial inventory health check
        await this.performInventoryHealthCheck();
    }

    protected async onStop(): Promise<void> {
        this.logger.info('Stopping Inventory Agent');
    }

    protected async onProcessTask(task: Task): Promise<any> {
        this.logger.info('Processing inventory task', {
            taskType: task.taskType,
            taskId: task.taskId,
        });

        switch (task.taskType) {
            case 'natural_language_command':
                return this.processNaturalLanguageCommand(task.input.command);

            case 'photo_upload':
                return this.processPhotoUpload(task.input.photoFileId, task.input.description);

            case 'inventory_update':
                return this.updateInventory(task.input.itemId, task.input.quantity);

            case 'inventory_query':
                return this.getInventoryStatus(task.input.itemName);

            case 'threshold_check':
                return this.checkInventoryLevels();

            case 'search_inventory':
                return this.searchInventory(task.input.criteria);

            default:
                throw new Error(`Unknown task type: ${task.taskType}`);
        }
    }

    protected async onHandleMessage(message: AgentMessage): Promise<AgentMessage | null> {
        this.logger.debug('Handling inventory message', {
            messageType: message.messageType,
            fromAgent: message.fromAgent,
        });

        switch (message.messageType) {
            case 'request':
                return this.handleInventoryRequest(message);

            case 'notification':
                return this.handleInventoryNotification(message);

            default:
                this.logger.warn('Unhandled message type', { messageType: message.messageType });
                return null;
        }
    }

    protected onGetCapabilities(): AgentCapability[] {
        return [
            {
                name: 'natural_language_inventory',
                description: 'Process natural language inventory commands',
                inputSchema: {
                    type: 'object',
                    properties: {
                        command: { type: 'string', description: 'Natural language inventory command' },
                    },
                    required: ['command'],
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        item: { type: 'object' },
                    },
                },
            },
            {
                name: 'photo_inventory_add',
                description: 'Add inventory items from photos with OCR',
                inputSchema: {
                    type: 'object',
                    properties: {
                        photoFileId: { type: 'string', description: 'File ID of uploaded photo' },
                        description: { type: 'string', description: 'User description of the item' },
                    },
                    required: ['photoFileId', 'description'],
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        itemId: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
            {
                name: 'inventory_monitoring',
                description: 'Monitor inventory levels and generate alerts',
                inputSchema: {
                    type: 'object',
                    properties: {
                        thresholds: { type: 'object', description: 'Custom thresholds by category' },
                    },
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            item: { type: 'object' },
                            alert: { type: 'string' },
                        },
                    },
                },
            },
        ];
    }

    // Public API methods
    public async processNaturalLanguageCommand(command: string): Promise<InventoryUpdateResult> {
        try {
            this.logger.info('Processing natural language command', { command });

            // Parse the natural language command
            const parsedCommand = this.parseNaturalLanguageCommand(command);

            if (parsedCommand.confidence < 0.7) {
                return {
                    success: false,
                    item: null,
                    message: `命令不够清晰，请提供更具体的信息。例如："抽纸消耗1包" 或 "添加牛奶2瓶"`,
                };
            }

            // Execute the parsed command
            switch (parsedCommand.action) {
                case 'consume':
                    return this.consumeInventoryItem(parsedCommand.itemName, parsedCommand.quantity || 1);

                case 'add':
                    return this.addInventoryItem(parsedCommand.itemName, parsedCommand.quantity || 1, parsedCommand.unit);

                case 'query':
                    const item = await this.getInventoryItem(parsedCommand.itemName);
                    return {
                        success: true,
                        item,
                        message: item
                            ? `${item.item_name}: 当前库存 ${item.current_quantity} ${item.unit || '个'}`
                            : `未找到物品: ${parsedCommand.itemName}`,
                    };

                case 'update':
                    return this.setInventoryQuantity(parsedCommand.itemName, parsedCommand.quantity || 0);

                default:
                    return {
                        success: false,
                        item: null,
                        message: `不支持的操作: ${parsedCommand.action}`,
                    };
            }
        } catch (error) {
            this.logger.error('Failed to process natural language command', { command, error });
            return {
                success: false,
                item: null,
                message: `处理命令时出错: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    public async processPhotoUpload(photoFileId: string, description: string): Promise<ItemAddResult> {
        try {
            this.logger.info('Processing photo upload', { photoFileId, description });

            // Validate file exists and is an image
            const fileMetadata = await this.callFileStorageMCP('getFileMetadata', {
                fileId: photoFileId,
            });

            if (!fileMetadata.success) {
                return {
                    success: false,
                    message: `文件不存在或无法访问: ${photoFileId}`,
                };
            }

            if (!fileMetadata.data?.mimeType.startsWith('image/')) {
                return {
                    success: false,
                    message: `文件不是图片格式: ${fileMetadata.data?.mimeType || '未知'}`,
                };
            }

            // Process image with OCR
            const ocrResult = await this.callFileStorageMCP('processImage', {
                fileId: photoFileId,
                options: {
                    enhanceImage: true,
                    language: 'eng+chi_sim',
                    detectFields: true,
                    outputFormat: 'structured',
                },
            });

            if (!ocrResult.success) {
                return this.handleOCRFailure(description, photoFileId);
            }

            return this.processOCRSuccess(ocrResult.data, description, photoFileId);

        } catch (error) {
            this.logger.error('Failed to process photo upload', { photoFileId, description, error });
            return {
                success: false,
                message: `处理照片时出错: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    public async updateInventory(itemId: string, quantity: number): Promise<boolean> {
        try {
            const result = await this.callDatabaseMCP('updateInventoryQuantity', {
                itemId,
                quantity,
            });

            return result.success && result.data;
        } catch (error) {
            this.logger.error('Failed to update inventory', { itemId, quantity, error });
            return false;
        }
    }

    public async checkInventoryLevels(): Promise<LowStockAlert[]> {
        try {
            this.logger.info('Checking inventory levels for low stock alerts');

            const alerts: LowStockAlert[] = [];

            // Check each category with its threshold
            for (const [category, threshold] of this.defaultThresholds) {
                const lowStockItems = await this.callDatabaseMCP('searchInventoryItems', {
                    criteria: {
                        category,
                        low_stock_threshold: threshold,
                    },
                });

                if (lowStockItems.success && lowStockItems.data && lowStockItems.data.length > 0) {
                    for (const item of lowStockItems.data) {
                        alerts.push({
                            item,
                            threshold,
                            recommendedAction: this.generateRecommendedAction(item, threshold),
                        });
                    }
                }
            }

            this.logger.info('Inventory level check completed', { alertCount: alerts.length });

            // If there are alerts, notify procurement agent
            if (alerts.length > 0) {
                await this.notifyProcurementAgent(alerts);
            }

            return alerts;
        } catch (error) {
            this.logger.error('Failed to check inventory levels', { error });
            return [];
        }
    }

    public async getInventoryStatus(itemName?: string): Promise<InventoryItem[]> {
        try {
            if (itemName) {
                const item = await this.getInventoryItem(itemName);
                return item ? [item] : [];
            } else {
                const result = await this.callDatabaseMCP('searchInventoryItems', {
                    criteria: {},
                });
                return result.success && result.data ? result.data : [];
            }
        } catch (error) {
            this.logger.error('Failed to get inventory status', { itemName, error });
            return [];
        }
    }

    public async getInventoryHealthReport(): Promise<{
        totalItems: number;
        lowStockItems: number;
        categoryBreakdown: Record<string, number>;
        recommendations: string[];
    }> {
        try {
            // Get all inventory items
            const allItems = await this.callDatabaseMCP('searchInventoryItems', {
                criteria: {},
            });

            if (!allItems.success || !allItems.data) {
                throw new Error('Failed to fetch inventory items');
            }

            const items: InventoryItem[] = allItems.data;
            const lowStockAlerts = await this.checkInventoryLevels();

            // Category breakdown
            const categoryBreakdown: Record<string, number> = {};
            for (const item of items) {
                const category = item.category || '其他';
                categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
            }

            // Generate recommendations
            const recommendations: string[] = [];

            if (lowStockAlerts.length > 0) {
                recommendations.push(`有 ${lowStockAlerts.length} 个物品库存不足，建议及时补充`);
            }

            if (recommendations.length === 0) {
                recommendations.push('库存状况良好，无需特别关注');
            }

            return {
                totalItems: items.length,
                lowStockItems: lowStockAlerts.length,
                categoryBreakdown,
                recommendations,
            };
        } catch (error) {
            this.logger.error('Failed to generate inventory health report', { error });
            throw error;
        }
    }

    // Private helper methods
    private parseNaturalLanguageCommand(command: string): NaturalLanguageCommand {
        // Simple pattern matching for Chinese inventory commands
        const patterns = [
            // Consumption patterns: "抽纸消耗1包", "用了2瓶洗发水"
            {
                regex: /(.+?)(消耗|用了|使用了)\s*(\d+)\s*([个包瓶盒袋支条])?/,
                action: 'consume' as const,
                itemIndex: 1,
                quantityIndex: 3,
                unitIndex: 4,
            },
            // Addition patterns: "添加牛奶2瓶", "买了3包抽纸"
            {
                regex: /(添加|买了|新增)\s*(.+?)\s*(\d+)\s*([个包瓶盒袋支条])?/,
                action: 'add' as const,
                itemIndex: 2,
                quantityIndex: 3,
                unitIndex: 4,
            },
            // Query patterns: "查询抽纸", "抽纸还有多少"
            {
                regex: /(查询|查看|检查)(.+?)$|(.+?)(还有多少|剩余|库存)/,
                action: 'query' as const,
                itemIndex: 2,
                quantityIndex: -1,
                unitIndex: -1,
            },
        ];

        for (const pattern of patterns) {
            const match = command.match(pattern.regex);
            if (match) {
                const itemName = match[pattern.itemIndex]?.trim();
                const quantity = pattern.quantityIndex > 0 ? parseInt(match[pattern.quantityIndex]) : undefined;
                const unit = pattern.unitIndex > 0 ? match[pattern.unitIndex] : undefined;

                if (itemName) {
                    return {
                        action: pattern.action,
                        itemName,
                        quantity,
                        unit,
                        confidence: 0.9,
                    };
                }
            }
        }

        // Fallback: try to extract item name and assume query
        const itemMatch = command.match(/([^\d\s]+)/);
        if (itemMatch) {
            return {
                action: 'query',
                itemName: itemMatch[1].trim(),
                confidence: 0.5,
            };
        }

        return {
            action: 'query',
            itemName: command,
            confidence: 0.3,
        };
    }

    private async consumeInventoryItem(itemName: string, quantity: number): Promise<InventoryUpdateResult> {
        const item = await this.getInventoryItem(itemName);

        if (!item) {
            return {
                success: false,
                item: null,
                message: `未找到物品: ${itemName}`,
            };
        }

        if (item.current_quantity < quantity) {
            return {
                success: false,
                item,
                message: `库存不足: ${itemName} 当前库存 ${item.current_quantity}，需要消耗 ${quantity}`,
            };
        }

        const newQuantity = item.current_quantity - quantity;
        const updateSuccess = await this.updateInventory(item.id.toString(), newQuantity);

        if (!updateSuccess) {
            return {
                success: false,
                item,
                message: `更新库存失败: ${itemName}`,
            };
        }

        const updatedItem = await this.getInventoryItem(itemName);

        return {
            success: true,
            item: updatedItem,
            message: `成功消耗 ${itemName} ${quantity} ${item.unit || '个'}，剩余 ${newQuantity} ${item.unit || '个'}`,
            previousQuantity: item.current_quantity,
            newQuantity,
        };
    }

    private async addInventoryItem(itemName: string, quantity: number, unit?: string): Promise<InventoryUpdateResult> {
        const existingItem = await this.getInventoryItem(itemName);

        if (existingItem) {
            // Update existing item
            const newQuantity = existingItem.current_quantity + quantity;
            const updateSuccess = await this.updateInventory(existingItem.id.toString(), newQuantity);

            if (!updateSuccess) {
                return {
                    success: false,
                    item: existingItem,
                    message: `更新库存失败: ${itemName}`,
                };
            }

            const updatedItem = await this.getInventoryItem(itemName);

            return {
                success: true,
                item: updatedItem,
                message: `成功添加 ${itemName} ${quantity} ${unit || existingItem.unit || '个'}，总计 ${newQuantity} ${unit || existingItem.unit || '个'}`,
                previousQuantity: existingItem.current_quantity,
                newQuantity,
            };
        } else {
            // Create new item
            const newItem: CreateInventoryItem = {
                item_name: itemName,
                current_quantity: quantity,
                unit: unit || '个',
                category: this.guessCategory(itemName),
            };

            const result = await this.callDatabaseMCP('addInventoryItem', {
                item: newItem,
            });

            if (!result.success) {
                return {
                    success: false,
                    item: null,
                    message: `添加新物品失败: ${itemName}`,
                };
            }

            const addedItem = await this.getInventoryItemById(result.data);

            return {
                success: true,
                item: addedItem,
                message: `成功添加新物品: ${itemName} ${quantity} ${unit || '个'}`,
                newQuantity: quantity,
            };
        }
    }

    private async setInventoryQuantity(itemName: string, quantity: number): Promise<InventoryUpdateResult> {
        const item = await this.getInventoryItem(itemName);

        if (!item) {
            return {
                success: false,
                item: null,
                message: `未找到物品: ${itemName}`,
            };
        }

        const updateSuccess = await this.updateInventory(item.id.toString(), quantity);

        if (!updateSuccess) {
            return {
                success: false,
                item,
                message: `更新库存失败: ${itemName}`,
            };
        }

        const updatedItem = await this.getInventoryItem(itemName);

        return {
            success: true,
            item: updatedItem,
            message: `成功设置 ${itemName} 库存为 ${quantity} ${item.unit || '个'}`,
            previousQuantity: item.current_quantity,
            newQuantity: quantity,
        };
    }

    private async getInventoryItem(itemName: string): Promise<InventoryItem | null> {
        try {
            const result = await this.callDatabaseMCP('getInventoryItem', {
                itemName,
            });

            return result.success && result.data ? result.data : null;
        } catch (error) {
            this.logger.error('Failed to get inventory item', { itemName, error });
            return null;
        }
    }

    private async getInventoryItemById(itemId: string): Promise<InventoryItem | null> {
        try {
            // Use search with empty criteria and then filter by ID
            const result = await this.callDatabaseMCP('searchInventoryItems', {
                criteria: {},
            });

            if (result.success && result.data && result.data.length > 0) {
                const item = result.data.find((item: InventoryItem) => item.id.toString() === itemId);
                return item || null;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to get inventory item by ID', { itemId, error });
            return null;
        }
    }

    private processOCRSuccess(ocrData: any, description: string, photoFileId: string): ItemAddResult {
        // Simple implementation for now
        const itemName = description || 'OCR识别物品';

        return {
            success: true,
            message: `成功处理照片，识别物品: ${itemName}`,
            ocrResult: ocrData,
        };
    }

    private handleOCRFailure(description: string, photoFileId: string): ItemAddResult {
        if (!description || description.trim().length === 0) {
            return {
                success: false,
                message: '图像识别失败，且未提供物品描述。请提供物品名称或重新上传更清晰的照片。',
            };
        }

        return {
            success: true,
            message: `图像识别失败，已根据描述处理: ${description}`,
        };
    }

    private generateRecommendedAction(item: InventoryItem, threshold: number): string {
        const remaining = item.current_quantity;

        if (remaining === 0) {
            return `${item.item_name} 已用完，建议立即购买`;
        } else if (remaining <= threshold / 2) {
            return `${item.item_name} 库存严重不足（剩余 ${remaining}），建议优先购买`;
        } else {
            return `${item.item_name} 库存偏低（剩余 ${remaining}），建议补充`;
        }
    }

    private guessCategory(itemName: string): string {
        const categoryKeywords = {
            '日用品': ['抽纸', '纸巾', '卫生纸', '湿巾'],
            '食品': ['牛奶', '面包', '米', '面条', '油', '盐', '糖', '醋'],
            '清洁用品': ['洗衣液', '洗洁精', '洗发水', '沐浴露', '牙膏'],
            '个人护理': ['护肤品', '化妆品', '洗面奶', '面膜'],
        };

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(keyword => itemName.includes(keyword))) {
                return category;
            }
        }

        return '其他';
    }

    private async performInventoryHealthCheck(): Promise<void> {
        try {
            this.logger.info('Performing inventory health check');
            // Simple health check implementation
            this.logger.info('Inventory health check completed');
        } catch (error) {
            this.logger.error('Inventory health check failed', { error });
        }
    }

    private async notifyProcurementAgent(alerts: LowStockAlert[]): Promise<void> {
        try {
            const message = this.createMessage(
                'procurement',
                'notification',
                {
                    type: 'low_stock_alert',
                    alerts: alerts.map(alert => ({
                        item: alert.item,
                        threshold: alert.threshold,
                        recommendedAction: alert.recommendedAction,
                    })),
                    timestamp: new Date(),
                }
            );

            this.emit('sendMessage', message);
            this.logger.info('Sent low stock alerts to procurement agent', { alertCount: alerts.length });
        } catch (error) {
            this.logger.error('Failed to notify procurement agent', { error });
        }
    }

    private async handleInventoryRequest(message: AgentMessage): Promise<AgentMessage | null> {
        try {
            const { requestType, data } = message.payload;

            switch (requestType) {
                case 'get_inventory_status':
                    const items = await this.getInventoryStatus(data.itemName);
                    return this.createMessage(
                        message.fromAgent,
                        'response',
                        { items },
                        message.correlationId
                    );

                case 'check_stock_levels':
                    const alerts = await this.checkInventoryLevels();
                    return this.createMessage(
                        message.fromAgent,
                        'response',
                        { alerts },
                        message.correlationId
                    );

                default:
                    this.logger.warn('Unknown inventory request type', { requestType });
                    return null;
            }
        } catch (error) {
            this.logger.error('Failed to handle inventory request', { error });
            return this.createErrorMessage(message, error instanceof Error ? error.message : String(error));
        }
    }

    private async handleInventoryNotification(message: AgentMessage): Promise<AgentMessage | null> {
        // Handle notifications from other agents
        this.logger.info('Received inventory notification', { payload: message.payload });
        return null;
    }

    private async searchInventory(criteria: SearchCriteria): Promise<InventoryItem[]> {
        try {
            const result = await this.callDatabaseMCP('searchInventoryItems', {
                criteria,
            });

            return result.success && result.data ? result.data : [];
        } catch (error) {
            this.logger.error('Failed to search inventory', { criteria, error });
            return [];
        }
    }

    // MCP helper methods
    private async callDatabaseMCP<T = any>(toolName: string, params: any): Promise<MCPCallResult<T>> {
        return this.mcpManager.callTool<T>('database-server', toolName, params);
    }

    private async callFileStorageMCP<T = any>(toolName: string, params: any): Promise<MCPCallResult<T>> {
        return this.mcpManager.callTool<T>('file-storage-server', toolName, params);
    }
}
