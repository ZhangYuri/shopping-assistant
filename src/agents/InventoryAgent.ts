/**
 * Inventory Agent - Manages household inventory operations through natural language
 * Uses LangChain's createReactAgent with specialized inventory tools
 */

import { BaseAgent, BaseAgentConfig } from './base/BaseAgent';
import { DynamicTool } from '@langchain/core/tools';

// Inventory-specific interfaces

interface InventoryAgentConfig extends Omit<BaseAgentConfig, 'tools'> {
    databaseTools: DynamicTool[];
    fileStorageTools: DynamicTool[];
    notificationTools?: DynamicTool[];
    defaultThresholds?: Record<string, number>;
}

export class InventoryAgent extends BaseAgent {
    private defaultThresholds: Map<string, number> = new Map();

    constructor(config: InventoryAgentConfig) {
        // Combine all tools for the base agent
        const allTools = [
            ...config.databaseTools,
            ...config.fileStorageTools,
            ...(config.notificationTools || []),
        ];

        super({
            ...config,
            tools: allTools,
            systemPrompt: config.systemPrompt || undefined, // Will use getDefaultSystemPrompt if not provided
        });

        // Set default stock thresholds
        const thresholds = config.defaultThresholds || {
            '日用品': 2,
            '食品': 3,
            '清洁用品': 1,
            '个人护理': 2,
        };

        for (const [category, threshold] of Object.entries(thresholds)) {
            this.defaultThresholds.set(category, threshold);
        }
    }

    protected getDefaultSystemPrompt(): string {
        return `你是一个专业的库存管理智能体，负责管理家庭库存操作。你的主要职责包括：

1. **自然语言库存管理**：
   - 理解和处理中文库存命令（如"抽纸消耗1包"、"添加牛奶2瓶"、"查询抽纸库存"）
   - 支持消耗、添加、查询、更新等操作
   - 提供清晰的操作反馈和库存状态信息

2. **照片识别和OCR处理**：
   - 处理用户上传的产品照片
   - 使用OCR技术提取产品信息（名称、保质期、生产日期等）
   - 将识别结果与用户描述结合，准确添加库存物品

3. **库存监控和预警**：
   - 监控各类物品的库存水平
   - 当库存低于阈值时自动生成预警
   - 向采购智能体发送补货建议
   - 提供库存健康报告和分析

4. **智能分类和管理**：
   - 自动识别物品类别（日用品、食品、清洁用品、个人护理等）
   - 根据类别设置合适的库存阈值
   - 提供存储位置建议和保质期管理

**交互原则**：
- 始终使用友好、专业的中文回复
- 对于模糊的命令，主动询问澄清
- 提供具体的数量、单位和操作结果
- 在库存不足时给出明确的建议
- 对于错误操作，提供清晰的错误说明和解决方案

**可用工具**：
- 数据库工具：查询、更新、添加库存物品
- 文件存储工具：处理图片上传和OCR识别
- 通知工具：发送库存预警和补货建议

请根据用户的自然语言输入，智能选择合适的工具来完成库存管理任务。`;
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Inventory Agent with LangChain', {
            toolCount: this.tools.length,
            thresholds: Object.fromEntries(this.defaultThresholds),
        });

        // Verify essential tools are available
        const requiredTools = ['getInventoryItem', 'updateInventoryQuantity', 'addInventoryItem'];
        const availableTools = this.getAvailableTools();

        for (const requiredTool of requiredTools) {
            if (!availableTools.includes(requiredTool)) {
                throw new Error(`Required tool not available: ${requiredTool}`);
            }
        }

        this.logger.info('Inventory Agent initialized successfully');
    }

    /**
     * Process natural language inventory commands
     * This is now handled by the LangChain agent with tools
     */
    async processInventoryCommand(command: string, threadId?: string): Promise<any> {
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(command, config);
    }

    /**
     * Process photo upload for inventory items
     */
    async processPhotoUpload(photoFileId: string, description: string, threadId?: string): Promise<any> {
        const input = `请处理这张照片添加库存物品。照片ID: ${photoFileId}，用户描述: ${description}`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Check inventory levels and generate alerts
     */
    async checkInventoryLevels(threadId?: string): Promise<any> {
        const thresholdInfo = Array.from(this.defaultThresholds.entries())
            .map(([category, threshold]) => `${category}: ${threshold}`)
            .join(', ');

        const input = `请检查所有库存物品的库存水平，使用以下阈值生成预警：${thresholdInfo}。对于库存不足的物品，请生成详细的补货建议。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Get inventory status report
     */
    async getInventoryReport(itemName?: string, threadId?: string): Promise<any> {
        const input = itemName
            ? `请查询 ${itemName} 的详细库存信息，包括当前数量、单位、存储位置、保质期等。`
            : `请生成完整的库存状态报告，包括总物品数、各类别分布、库存不足的物品等。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Update inventory thresholds
     */
    updateThresholds(thresholds: Record<string, number>): void {
        for (const [category, threshold] of Object.entries(thresholds)) {
            this.defaultThresholds.set(category, threshold);
        }

        this.logger.info('Inventory thresholds updated', {
            thresholds: Object.fromEntries(this.defaultThresholds)
        });
    }

    /**
     * Get current thresholds
     */
    getThresholds(): Record<string, number> {
        return Object.fromEntries(this.defaultThresholds);
    }

    /**
     * Create inventory-specific tools factory method
     */
    static createInventoryTools(): {
        databaseTools: DynamicTool[];
        fileStorageTools: DynamicTool[];
        notificationTools: DynamicTool[];
    } {
        // Database tools for inventory management
        const databaseTools = [
            new DynamicTool({
                name: 'getInventoryItem',
                description: '根据物品名称查询库存信息',
                func: async (input: string) => {
                    const { itemName } = JSON.parse(input);
                    // This would call the actual MCP database server
                    // For now, return a mock response
                    return JSON.stringify({
                        success: true,
                        item: {
                            id: 1,
                            item_name: itemName,
                            current_quantity: 5,
                            unit: '包',
                            category: '日用品',
                        },
                    });
                },
            }),

            new DynamicTool({
                name: 'updateInventoryQuantity',
                description: '更新库存物品的数量',
                func: async (input: string) => {
                    const { itemId, quantity } = JSON.parse(input);
                    // This would call the actual MCP database server
                    return JSON.stringify({
                        success: true,
                        message: `物品 ${itemId} 的库存已更新为 ${quantity}`,
                    });
                },
            }),

            new DynamicTool({
                name: 'addInventoryItem',
                description: '添加新的库存物品',
                func: async (input: string) => {
                    const { item } = JSON.parse(input);
                    // This would call the actual MCP database server
                    return JSON.stringify({
                        success: true,
                        itemId: 'new-item-id',
                        message: `成功添加新物品: ${item.item_name}`,
                    });
                },
            }),

            new DynamicTool({
                name: 'searchInventoryItems',
                description: '根据条件搜索库存物品',
                func: async (input: string) => {
                    const parsedInput = JSON.parse(input);
                    // This would call the actual MCP database server
                    return JSON.stringify({
                        success: true,
                        items: [
                            {
                                id: 1,
                                item_name: '抽纸',
                                current_quantity: 2,
                                unit: '包',
                                category: '日用品',
                            },
                        ],
                    });
                },
            }),
        ];

        // File storage tools for photo processing
        const fileStorageTools = [
            new DynamicTool({
                name: 'processImage',
                description: '处理图片并进行OCR识别',
                func: async (input: string) => {
                    const { fileId } = JSON.parse(input);
                    // This would call the actual MCP file storage server
                    return JSON.stringify({
                        success: true,
                        extractedText: '产品名称: 抽纸, 生产日期: 2024-01-01',
                        detectedFields: [
                            { fieldType: 'product_name', value: '抽纸', confidence: 0.95 },
                            { fieldType: 'production_date', value: '2024-01-01', confidence: 0.88 },
                        ],
                    });
                },
            }),

            new DynamicTool({
                name: 'getFileMetadata',
                description: '获取文件元数据信息',
                func: async (input: string) => {
                    const { fileId } = JSON.parse(input);
                    // This would call the actual MCP file storage server
                    return JSON.stringify({
                        success: true,
                        data: {
                            fileId,
                            mimeType: 'image/jpeg',
                            size: 1024000,
                            uploadedAt: new Date().toISOString(),
                        },
                    });
                },
            }),
        ];

        // Notification tools for alerts
        const notificationTools = [
            new DynamicTool({
                name: 'sendLowStockAlert',
                description: '发送库存不足预警通知',
                func: async (input: string) => {
                    const { alerts } = JSON.parse(input);
                    // This would call the actual MCP notification server
                    return JSON.stringify({
                        success: true,
                        message: `已发送 ${alerts.length} 个库存预警通知`,
                    });
                },
            }),

            new DynamicTool({
                name: 'notifyProcurementAgent',
                description: '向采购智能体发送补货建议',
                func: async (input: string) => {
                    const { recommendations } = JSON.parse(input);
                    // This would send message to procurement agent
                    return JSON.stringify({
                        success: true,
                        message: `已向采购智能体发送 ${recommendations.length} 个补货建议`,
                    });
                },
            }),
        ];

        return {
            databaseTools,
            fileStorageTools,
            notificationTools,
        };
    }
}
