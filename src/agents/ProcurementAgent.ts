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
   - 支持用户反馈学习和个性化优化

4. **用户反馈学习机制**：
   - 记录用户对推荐的接受、拒绝、修改行为
   - 学习用户的数量偏好和优先级习惯
   - 基于历史反馈优化未来推荐
   - 提供个性化的采购建议
   - 跟踪推荐系统性能指标

5. **采购模式分析**：
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
- 用户反馈工具：记录反馈、个性化推荐、性能指标分析
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
        const requiredTools = [
            'import_orders',
            'get_order_history',
            'add_to_shopping_list',
            'get_shopping_list',
            'generate_purchase_recommendations',
            'analyze_purchase_patterns_detailed',
            'manage_shopping_list_advanced',
            'record_user_feedback',
            'get_personalized_recommendations',
            'process_recommendation_feedback',
            'update_recommendation_metrics'
        ];
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
     * Generate purchase recommendations based on inventory levels and historical data
     */
    async generatePurchaseRecommendations(analysisDepthDays: number = 90, categories?: string[], threadId?: string): Promise<any> {
        const categoryInfo = categories ? `，重点关注以下类别：${categories.join('、')}` : '';
        const input = `请基于过去${analysisDepthDays}天的数据生成智能采购建议${categoryInfo}。

        分析要求：
        1. 分析库存水平和历史消费模式
        2. 考虑季节性因素和购物活动
        3. 计算消费频率和预计用完时间
        4. 提供优先级排序和具体的购买建议
        5. 估算建议购买数量和成本

        请使用 generate_purchase_recommendations 工具进行分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate detailed purchase recommendations with seasonal considerations
     */
    async generateAdvancedRecommendations(options: {
        analysisDepthDays?: number;
        categories?: string[];
        includeSeasonality?: boolean;
        minPriority?: number;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            analysisDepthDays = 90,
            categories,
            includeSeasonality = true,
            minPriority = 2,
            threadId
        } = options;

        const categoryInfo = categories ? `，重点关注以下类别：${categories.join('、')}` : '';
        const input = `请生成高级采购建议分析${categoryInfo}。

        分析参数：
        - 分析深度：${analysisDepthDays}天
        - 包含季节性分析：${includeSeasonality ? '是' : '否'}
        - 最低优先级：${minPriority}

        请使用 generate_purchase_recommendations 工具，参数设置为：
        {
            "analysisDepthDays": ${analysisDepthDays},
            "categories": ${categories ? JSON.stringify(categories) : 'null'},
            "includeSeasonality": ${includeSeasonality}
        }`;

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
                input = `请添加物品到购物清单：${JSON.stringify(itemData)}。使用 add_to_shopping_list 工具。`;
                break;
            case 'update':
                input = `请更新购物清单项 ${itemId}：${JSON.stringify(itemData)}。使用 update_shopping_list_item 工具。`;
                break;
            case 'remove':
                input = `请从购物清单中删除项目 ${itemId}。使用 update_shopping_list_item 工具设置状态为删除。`;
                break;
            case 'complete':
                input = `请标记购物清单项目 ${itemId} 为已完成。使用 update_shopping_list_item 工具。`;
                break;
            default:
                throw new Error(`Unknown shopping list action: ${action}`);
        }

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Advanced shopping list management with bulk operations and auto-recommendations
     */
    async manageShoppingListAdvanced(options: {
        action: 'bulk_add' | 'auto_add_recommendations' | 'prioritize' | 'cleanup';
        items?: any[];
        autoAddFromRecommendations?: boolean;
        threadId?: string;
    }): Promise<any> {
        const { action, items, autoAddFromRecommendations = false, threadId } = options;

        let input: string;

        switch (action) {
            case 'bulk_add':
                input = `请批量添加物品到购物清单。

                物品列表：${JSON.stringify(items)}

                请使用 manage_shopping_list_advanced 工具，参数设置为：
                {
                    "action": "bulk_add",
                    "items": ${JSON.stringify(items)}
                }`;
                break;
            case 'auto_add_recommendations':
                input = `请自动将高优先级的采购建议添加到购物清单。

                请使用 manage_shopping_list_advanced 工具，参数设置为：
                {
                    "action": "auto_add_recommendations",
                    "autoAddFromRecommendations": true
                }`;
                break;
            case 'prioritize':
                input = `请根据当前库存水平重新调整购物清单的优先级。

                请使用 manage_shopping_list_advanced 工具，参数设置为：
                {
                    "action": "prioritize"
                }`;
                break;
            case 'cleanup':
                input = `请清理购物清单，删除30天前已完成的项目。

                请使用 manage_shopping_list_advanced 工具，参数设置为：
                {
                    "action": "cleanup"
                }`;
                break;
            default:
                throw new Error(`Unknown advanced shopping list action: ${action}`);
        }

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Auto-populate shopping list from recommendations
     */
    async autoPopulateShoppingList(options: {
        minPriority?: number;
        maxItems?: number;
        categories?: string[];
        threadId?: string;
    } = {}): Promise<any> {
        const {
            minPriority = 3,
            maxItems = 10,
            categories,
            threadId
        } = options;

        const categoryInfo = categories ? `，限制类别：${categories.join('、')}` : '';
        const input = `请自动填充购物清单，基于当前的采购建议${categoryInfo}。

        参数设置：
        - 最低优先级：${minPriority}
        - 最大添加数量：${maxItems}

        步骤：
        1. 首先生成采购建议
        2. 筛选优先级 >= ${minPriority} 的物品
        3. 自动添加到购物清单
        4. 避免重复添加已存在的物品

        请先使用 generate_purchase_recommendations 工具，然后使用 manage_shopping_list_advanced 工具自动添加。`;

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
        const timeRangeDays = timeRange === 'year' ? 365 : timeRange === 'quarter' ? 90 : 30;
        const categoryInfo = categories ? `，重点分析以下类别：${categories.join('、')}` : '';

        const input = `请进行详细的购买模式分析${categoryInfo}。

        分析要求：
        1. 分析过去${timeRange === 'year' ? '一年' : timeRange === 'quarter' ? '三个月' : '一个月'}的购买趋势
        2. 识别消费模式和季节性规律
        3. 分析各类别的支出分布
        4. 提供成本优化建议
        5. 生成购买洞察报告

        请使用 analyze_purchase_patterns_detailed 工具，参数设置为：
        {
            "timeRange": ${timeRangeDays},
            "categories": ${categories ? JSON.stringify(categories) : 'null'},
            "includeSeasonality": true
        }`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Perform comprehensive purchase pattern analysis with seasonal insights
     */
    async analyzeComprehensivePurchasePatterns(options: {
        timeRangeDays?: number;
        categories?: string[];
        includeSeasonality?: boolean;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            timeRangeDays = 365,
            categories,
            includeSeasonality = true,
            threadId
        } = options;

        const categoryInfo = categories ? `，重点分析以下类别：${categories.join('、')}` : '';
        const input = `请进行全面的购买模式分析${categoryInfo}。

        分析范围：${timeRangeDays}天
        包含季节性分析：${includeSeasonality ? '是' : '否'}

        请提供：
        1. 月度支出趋势分析
        2. 类别支出分布和排名
        3. 热门商品购买频率分析
        4. 季节性消费模式识别
        5. 购买行为洞察和优化建议

        请使用 analyze_purchase_patterns_detailed 工具进行分析。`;

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
     * Record user feedback for recommendation learning
     */
    async recordUserFeedback(options: {
        recommendationId: string;
        itemName: string;
        userAction: 'accepted' | 'rejected' | 'modified' | 'ignored';
        userFeedback?: string;
        actualQuantity?: number;
        actualPriority?: number;
        threadId?: string;
    }): Promise<any> {
        const {
            recommendationId,
            itemName,
            userAction,
            userFeedback,
            actualQuantity,
            actualPriority,
            threadId
        } = options;

        const input = `请记录用户对采购建议的反馈。

        反馈详情：
        - 推荐ID: ${recommendationId}
        - 物品名称: ${itemName}
        - 用户行为: ${userAction}
        - 用户反馈: ${userFeedback || '无'}
        - 实际数量: ${actualQuantity || '未修改'}
        - 实际优先级: ${actualPriority || '未修改'}

        请使用 record_user_feedback 工具记录此反馈，并更新学习算法。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Process bulk feedback for learning optimization
     */
    async processBulkFeedback(feedbackList: any[], threadId?: string): Promise<any> {
        const input = `请批量处理用户反馈并优化学习算法。

        反馈数量: ${feedbackList.length}

        请使用 process_recommendation_feedback 工具处理以下反馈：
        ${JSON.stringify(feedbackList, null, 2)}

        处理完成后，更新用户偏好和推荐算法参数。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate personalized recommendations based on user feedback history
     */
    async generatePersonalizedRecommendations(options: {
        analysisDepthDays?: number;
        categories?: string[];
        applyLearning?: boolean;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            analysisDepthDays = 90,
            categories,
            applyLearning = true,
            threadId
        } = options;

        const categoryInfo = categories ? `，重点关注以下类别：${categories.join('、')}` : '';
        const input = `请生成基于用户反馈学习的个性化采购建议${categoryInfo}。

        参数设置：
        - 分析深度：${analysisDepthDays}天
        - 应用学习算法：${applyLearning ? '是' : '否'}

        请使用 get_personalized_recommendations 工具，该工具将：
        1. 分析用户历史反馈模式
        2. 应用个性化偏好调整
        3. 基于接受率优化推荐优先级
        4. 根据用户习惯调整建议数量
        5. 提供学习置信度评分

        生成的建议应该更符合用户的实际需求和偏好。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Handle recommendation acceptance with automatic shopping list addition
     */
    async acceptRecommendation(options: {
        recommendationId: string;
        itemName: string;
        category?: string;
        suggestedQuantity: number;
        priority: number;
        reason: string;
        addToShoppingList?: boolean;
        userFeedback?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            recommendationId,
            itemName,
            category,
            suggestedQuantity,
            priority,
            reason,
            addToShoppingList = true,
            userFeedback,
            threadId
        } = options;

        const input = `用户接受了采购建议，请处理以下操作：

        1. 记录用户反馈（接受）
        2. ${addToShoppingList ? '自动添加到购物清单' : '不添加到购物清单'}
        3. 发送确认通知

        建议详情：
        - 推荐ID: ${recommendationId}
        - 物品名称: ${itemName}
        - 分类: ${category || '未分类'}
        - 建议数量: ${suggestedQuantity}
        - 优先级: ${priority}
        - 推荐原因: ${reason}
        - 用户反馈: ${userFeedback || '接受建议'}

        请先使用 record_user_feedback 工具记录反馈，然后${addToShoppingList ? '使用 add_to_shopping_list 工具添加到购物清单，' : ''}最后发送确认通知。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Handle recommendation rejection with learning
     */
    async rejectRecommendation(options: {
        recommendationId: string;
        itemName: string;
        category?: string;
        rejectionReason: string;
        userFeedback?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            recommendationId,
            itemName,
            category,
            rejectionReason,
            userFeedback,
            threadId
        } = options;

        const input = `用户拒绝了采购建议，请处理学习优化：

        建议详情：
        - 推荐ID: ${recommendationId}
        - 物品名称: ${itemName}
        - 分类: ${category || '未分类'}
        - 拒绝原因: ${rejectionReason}
        - 用户反馈: ${userFeedback || '拒绝建议'}

        请使用 record_user_feedback 工具记录此拒绝反馈，系统将学习用户偏好并在未来的推荐中进行调整。

        同时分析拒绝原因，如果是系统性问题（如数量过多、优先级不当等），请调整相关的推荐参数。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Handle recommendation modification with learning
     */
    async modifyRecommendation(options: {
        recommendationId: string;
        itemName: string;
        category?: string;
        originalQuantity: number;
        modifiedQuantity: number;
        originalPriority: number;
        modifiedPriority: number;
        modificationReason: string;
        addToShoppingList?: boolean;
        threadId?: string;
    }): Promise<any> {
        const {
            recommendationId,
            itemName,
            category,
            originalQuantity,
            modifiedQuantity,
            originalPriority,
            modifiedPriority,
            modificationReason,
            addToShoppingList = true,
            threadId
        } = options;

        const input = `用户修改了采购建议，请处理学习和更新：

        修改详情：
        - 推荐ID: ${recommendationId}
        - 物品名称: ${itemName}
        - 分类: ${category || '未分类'}
        - 原始数量: ${originalQuantity} → 修改数量: ${modifiedQuantity}
        - 原始优先级: ${originalPriority} → 修改优先级: ${modifiedPriority}
        - 修改原因: ${modificationReason}

        请执行以下操作：
        1. 使用 record_user_feedback 工具记录修改反馈
        2. ${addToShoppingList ? '使用修改后的参数添加到购物清单' : '不添加到购物清单'}
        3. 学习用户的数量和优先级偏好
        4. 发送修改确认通知

        系统将根据此修改学习用户偏好，在未来为类似物品提供更准确的建议。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Get recommendation performance metrics
     */
    async getRecommendationMetrics(options: {
        startDate?: string;
        endDate?: string;
        categories?: string[];
        threadId?: string;
    } = {}): Promise<any> {
        const {
            startDate,
            endDate,
            categories,
            threadId
        } = options;

        const dateRange = startDate && endDate ? `从 ${startDate} 到 ${endDate}` : '最近30天';
        const categoryInfo = categories ? `，分类筛选：${categories.join('、')}` : '';

        const input = `请分析推荐系统的性能指标${categoryInfo}。

        分析范围：${dateRange}

        请提供以下指标：
        1. 推荐接受率
        2. 推荐拒绝率
        3. 推荐修改率
        4. 平均优先级准确度
        5. 平均数量准确度
        6. 用户满意度趋势
        7. 学习算法改进建议

        使用 update_recommendation_metrics 工具更新最新指标，然后生成详细的性能报告。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Send intelligent recommendation notifications
     */
    async sendRecommendationNotification(options: {
        recommendations: any[];
        notificationType: 'new_recommendations' | 'urgent_items' | 'seasonal_suggestions';
        userId?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            recommendations,
            notificationType,
            userId,
            threadId
        } = options;

        const typeMap = {
            'new_recommendations': '新的采购建议',
            'urgent_items': '紧急补货提醒',
            'seasonal_suggestions': '季节性购买建议'
        };

        const input = `请发送智能采购建议通知。

        通知类型：${typeMap[notificationType]}
        建议数量：${recommendations.length}
        用户ID：${userId || '默认用户'}

        建议摘要：
        ${recommendations.slice(0, 5).map((rec, index) =>
            `${index + 1}. ${rec.item_name} (优先级: ${rec.priority}, 数量: ${rec.suggested_quantity})`
        ).join('\n')}
        ${recommendations.length > 5 ? `\n... 还有 ${recommendations.length - 5} 个建议` : ''}

        请使用通知工具发送个性化的采购建议通知，包含：
        1. 高优先级物品的紧急提醒
        2. 基于学习算法的个性化建议
        3. 用户可以直接接受/拒绝的操作按钮
        4. 建议的购买时机和商家推荐

        通知应该简洁明了，突出最重要的建议。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Create procurement-specific tools factory method
     */
    static createProcurementTools(): {
        databaseTools: DynamicTool[];
        fileStorageTools: DynamicTool[];
        notificationTools: DynamicTool[];
    } {
        // Import the actual database tools
        const {
            createOrderTools,
            createShoppingListTools,
            createProcurementTools,
            createUserFeedbackTools
        } = require('../tools/DatabaseTools');

        const { createAllFileStorageTools } = require('../tools/FileStorageTools');
        const { createAllNotificationTools } = require('../tools/NotificationTools');

        // Database tools for procurement management (including user feedback learning)
        const databaseTools = [
            ...createOrderTools(),
            ...createShoppingListTools(),
            ...createProcurementTools(),
            ...createUserFeedbackTools()
        ];

        // File storage tools for document processing
        const fileStorageTools = createAllFileStorageTools();

        // Notification tools for alerts
        const notificationTools = createAllNotificationTools();

        return {
            databaseTools,
            fileStorageTools,
            notificationTools,
        };
    }
}
