/**
 * Procurement Agent - Handles procurement planning and order management using LangChain
 * Uses LangChain's createReactAgent with specialized procurement tools
 */

import { BaseAgent, BaseAgentConfig } from './base/BaseAgent';
import { DynamicTool } from '@langchain/core/tools';

// Procurement-specific interfaces
interface ProcurementAgentConfig extends Omit<BaseAgentConfig, 'tools'> {
    databaseTools: DynamicTool[];
    fileStorageTools: DynamicTool[];
    notificationTools?: DynamicTool[];
    defaultPlatforms?: string[];
}

export class ProcurementAgent extends BaseAgent {
    private defaultPlatforms: string[] = [];

    constructor(config: ProcurementAgentConfig) {
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

        // Set default platforms
        this.defaultPlatforms = config.defaultPlatforms || [
            '淘宝', '1688', '京东', '抖音商城', '中免日上', '拼多多'
        ];
    }

    protected getDefaultSystemPrompt(): string {
        return `你是一个专业的采购智能体，负责管理家庭购物和采购计划。你的主要职责包括：

1. **订单导入和解析**：
   - 从多个电商平台（淘宝、1688、京东、抖音商城、中免日上、拼多多）导入订单数据
   - 解析Excel文件和图片中的订单信息
   - 标准化不同平台的数据格式
   - 检测和防止重复订单

2. **采购建议生成**：
   - 基于库存水平和历史消费模式生成购买建议
   - 考虑季节性因素和购物活动
   - 提供优先级排序和成本估算
   - 推荐最佳购买时机和商家

3. **购物清单管理**：
   - 维护智能化的购物TODO列表
   - 根据库存预警自动添加物品
   - 提供优先级管理和状态跟踪
   - 支持用户反馈学习

4. **采购模式分析**：
   - 分析历史购买数据和支出趋势
   - 识别消费模式和季节性规律
   - 提供成本优化建议
   - 生成采购报告和洞察

**交互原则**：
- 始终使用友好、专业的中文回复
- 对于复杂的采购需求，主动提供详细的分析和建议
- 在处理订单数据时特别注意数据准确性和重复检测
- 提供具体的购买建议，包括数量、优先级和理由
- 对于错误操作，提供清晰的错误说明和解决方案

**可用工具**：
- 数据库工具：查询、更新、添加订单、库存、购物清单数据
- 文件存储工具：处理Excel文件和图片上传、OCR识别
- 通知工具：发送采购建议和提醒

请根据用户的自然语言输入，智能选择合适的工具来完成采购管理任务。`;
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Procurement Agent with LangChain', {
            toolCount: this.tools.length,
            platforms: this.defaultPlatforms,
        });

        // Verify essential tools are available
        const requiredTools = ['import_orders', 'get_order_history', 'manage_shopping_list', 'generate_purchase_recommendations'];
        const availableTools = this.getAvailableTools();

        for (const requiredTool of requiredTools) {
            if (!availableTools.includes(requiredTool)) {
                throw new Error(`Required tool not available: ${requiredTool}`);
            }
        }

        this.logger.info('Procurement Agent initialized successfully');
    }

    /**
     * Import orders from Excel files or images
     */
    async importOrders(fileId: string, platform: string, threadId?: string): Promise<any> {
        const input = `请导入订单数据。文件ID: ${fileId}，平台: ${platform}。请解析文件内容并检测重复订单。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate purchase recommendations based on inventory levels
     */
    async generatePurchaseRecommendations(analysisDepthDays: number = 90, categories?: string[], threadId?: string): Promise<any> {
        const categoryInfo = categories ? `，重点关注以下类别：${categories.join('、')}` : '';
        const input = `请基于过去${analysisDepthDays}天的数据生成购买建议${categoryInfo}。分析库存水平、历史消费模式，提供优先级排序和具体的购买建议。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Manage shopping list operations
     */
    async manageShoppingList(action: 'add' | 'update' | 'remove' | 'complete', itemData?: any, itemId?: string, threadId?: string): Promise<any> {
        let input: string;

        switch (action) {
            case 'add':
                input = `请添加物品到购物清单：${JSON.stringify(itemData)}`;
                break;
            case 'update':
                input = `请更新购物清单项 ${itemId}：${JSON.stringify(itemData)}`;
                break;
            case 'remove':
                input = `请从购物清单中删除项目 ${itemId}`;
                break;
            case 'complete':
                input = `请标记购物清单项目 ${itemId} 为已完成`;
                break;
            default:
                throw new Error(`Unknown shopping list action: ${action}`);
        }

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Get order history with filters
     */
    async getOrderHistory(filters?: any, threadId?: string): Promise<any> {
        const filterInfo = filters ? `，筛选条件：${JSON.stringify(filters)}` : '';
        const input = `请查询订单历史记录${filterInfo}。提供详细的订单信息和统计分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Analyze purchase patterns and spending trends
     */
    async analyzePurchasePatterns(timeRange: 'month' | 'quarter' | 'year' = 'year', categories?: string[], threadId?: string): Promise<any> {
        const categoryInfo = categories ? `，重点分析以下类别：${categories.join('、')}` : '';
        const input = `请分析过去${timeRange === 'year' ? '一年' : timeRange === 'quarter' ? '三个月' : '一个月'}的购买模式和支出趋势${categoryInfo}。提供详细的分析报告和优化建议。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Get current shopping list
     */
    async getShoppingList(status: 'all' | 'pending' | 'completed' = 'all', threadId?: string): Promise<any> {
        const statusInfo = status === 'all' ? '所有' : status === 'pending' ? '待购买' : '已完成';
        const input = `请查询当前购物清单，显示${statusInfo}的物品。提供详细的清单信息和状态统计。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Process uploaded file (Excel or image)
     */
    async processFileUpload(fileId: string, fileType: 'excel' | 'image', description?: string, threadId?: string): Promise<any> {
        const typeInfo = fileType === 'excel' ? 'Excel文件' : '图片';
        const descInfo = description ? `，用户描述：${description}` : '';
        const input = `请处理上传的${typeInfo}，文件ID: ${fileId}${descInfo}。解析其中的订单或商品信息。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Update default platforms
     */
    updateDefaultPlatforms(platforms: string[]): void {
        this.defaultPlatforms = platforms;
        this.logger.info('Default platforms updated', {
            platforms: this.defaultPlatforms
        });
    }

    /**
     * Get current default platforms
     */
    getDefaultPlatforms(): string[] {
        return [...this.defaultPlatforms];
    }

    /**
     * Create procurement-specific tools factory method
     */
    static createProcurementTools(): {
        databaseTools: DynamicTool[];
        fileStorageTools: DynamicTool[];
        notificationTools: DynamicTool[];
    } {
        // Database tools for procurement management
        const databaseTools = [
            new DynamicTool({
                name: 'import_orders',
                description: '导入订单数据到数据库',
                func: async (input: string) => {
                    const { orders, platform } = JSON.parse(input);
                    // This would call the actual database service
                    return JSON.stringify({
                        success: true,
                        importedCount: orders.length,
                        duplicatesFound: 0,
                        message: `成功导入 ${orders.length} 个来自 ${platform} 的订单`,
                    });
                },
            }),

            new DynamicTool({
                name: 'get_order_history',
                description: '查询历史订单数据',
                func: async (input: string) => {
                    const filters = JSON.parse(input);
                    // This would call the actual database service
                    return JSON.stringify({
                        success: true,
                        orders: [
                            {
                                id: 'order-001',
                                store_name: '淘宝店铺',
                                total_price: 99.99,
                                purchase_date: '2024-01-01',
                                items: ['商品1', '商品2']
                            }
                        ],
                        totalCount: 1,
                    });
                },
            }),

            new DynamicTool({
                name: 'manage_shopping_list',
                description: '管理购物清单',
                func: async (input: string) => {
                    const { action, item } = JSON.parse(input);
                    // This would call the actual database service
                    return JSON.stringify({
                        success: true,
                        message: `购物清单操作 ${action} 执行成功`,
                    });
                },
            }),

            new DynamicTool({
                name: 'generate_purchase_recommendations',
                description: '生成采购建议',
                func: async (input: string) => {
                    const { analysisDepth, categories } = JSON.parse(input);
                    // This would analyze historical data and generate recommendations
                    return JSON.stringify({
                        success: true,
                        recommendations: [
                            {
                                item: '抽纸',
                                priority: 'high',
                                reason: '库存不足，历史消费频率高',
                                suggestedQuantity: 5,
                                estimatedCost: 50.0
                            }
                        ],
                    });
                },
            }),
        ];

        // File storage tools for document processing
        const fileStorageTools = [
            new DynamicTool({
                name: 'upload_file',
                description: '上传文件到存储系统',
                func: async (input: string) => {
                    const { fileData, metadata } = JSON.parse(input);
                    // This would upload file to storage service
                    return JSON.stringify({
                        success: true,
                        fileId: 'file-' + Date.now(),
                        message: '文件上传成功',
                    });
                },
            }),

            new DynamicTool({
                name: 'parse_excel_file',
                description: '解析Excel文件中的订单数据',
                func: async (input: string) => {
                    const { fileId, platform } = JSON.parse(input);
                    // This would parse Excel file and extract order data
                    return JSON.stringify({
                        success: true,
                        orders: [
                            {
                                store_name: '示例店铺',
                                total_price: 99.99,
                                items: ['商品A', '商品B']
                            }
                        ],
                        extractedCount: 1,
                    });
                },
            }),

            new DynamicTool({
                name: 'process_image',
                description: '处理图片并提取订单信息',
                func: async (input: string) => {
                    const { fileId } = JSON.parse(input);
                    // This would process image and extract order information
                    return JSON.stringify({
                        success: true,
                        extractedText: '订单号: 123456, 商品: 示例商品, 价格: 99.99',
                        structuredData: {
                            orderId: '123456',
                            items: ['示例商品'],
                            totalPrice: 99.99
                        },
                    });
                },
            }),
        ];

        // Notification tools for alerts
        const notificationTools = [
            new DynamicTool({
                name: 'send_notification',
                description: '发送通知消息',
                func: async (input: string) => {
                    const { message, channels, priority } = JSON.parse(input);
                    // This would send notification through various channels
                    return JSON.stringify({
                        success: true,
                        message: `通知已发送到 ${channels.join(', ')} 渠道`,
                        notificationId: 'notif-' + Date.now(),
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
