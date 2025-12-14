/**
 * Notification Agent - Handles intelligent notification management using LangChain
 * Uses LangChain's createReactAgent with specialized notification and communication tools
 */

import { BaseAgent, BaseAgentConfig } from './base/BaseAgent';
import { DynamicTool } from '@langchain/core/tools';

// Notification-specific interfaces
interface NotificationAgentConfig extends Omit<BaseAgentConfig, 'tools'> {
    notificationTools: DynamicTool[];
    databaseTools?: DynamicTool[];
    defaultChannels?: string[];
    userPreferences?: NotificationPreferences;
    intelligentTiming?: boolean;
}

interface NotificationPreferences {
    userId: string;
    enabledChannels: string[];
    quietHours?: {
        start: string; // "22:00"
        end: string;   // "08:00"
        timezone: string;
    };
    categoryPreferences: Record<string, boolean>; // { 'inventory_alert': true, 'financial_report': false }
    language: 'zh-CN' | 'en-US';
    frequency?: {
        maxDailyNotifications: number;
        maxHourlyNotifications: number;
        cooldownMinutes: number;
    };
}

interface NotificationContent {
    type: 'inventory_alert' | 'purchase_recommendation' | 'financial_report' | 'system_update' | 'custom';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    title: string;
    message: string;
    data?: any;
    userId: string;
    attachments?: NotificationAttachment[];
    actions?: NotificationAction[];
}

interface NotificationContext {
    userActivity?: UserActivity;
    currentTime: Date;
    recentNotifications: RecentNotification[];
    userPreferences: NotificationPreferences;
    conversationContext?: Record<string, any>;
}

interface UserActivity {
    lastActiveTime: Date;
    activityLevel: 'high' | 'medium' | 'low';
    preferredChannels: string[];
    responseRate: number;
}

interface RecentNotification {
    id: string;
    type: string;
    sentAt: Date;
    channel: string;
    wasRead: boolean;
    wasActioned: boolean;
}

interface NotificationAttachment {
    type: 'image' | 'file' | 'link';
    url: string;
    title?: string;
    description?: string;
}

interface NotificationAction {
    actionId: string;
    label: string;
    actionType: 'button' | 'link' | 'quick-reply';
    actionData: any;
}

interface IntelligentNotification {
    content: NotificationContent;
    optimalTiming: OptimalTiming;
    personalization: PersonalizationSettings;
    fallbackChannels: string[];
}

interface OptimalTiming {
    recommendedTime: Date;
    confidence: number;
    reasoning: string;
    alternativeTimes: Date[];
}

interface PersonalizationSettings {
    tone: 'formal' | 'casual' | 'friendly';
    detailLevel: 'brief' | 'detailed' | 'comprehensive';
    includeContext: boolean;
    customGreeting?: string;
}

interface ContextualAlert {
    alertType: 'inventory_low' | 'budget_exceeded' | 'anomaly_detected' | 'system_error' | 'custom';
    severity: 'info' | 'warning' | 'error' | 'critical';
    context: Record<string, any>;
    suggestedActions: string[];
    expiryTime?: Date;
}

export class NotificationAgent extends BaseAgent {
    private defaultChannels: string[] = ['teams'];
    private userPreferences: Map<string, NotificationPreferences> = new Map();
    private intelligentTiming: boolean = true;
    private notificationHistory: Map<string, RecentNotification[]> = new Map();

    constructor(config: NotificationAgentConfig) {
        // Combine all tools for the base agent
        const allTools = [
            ...config.notificationTools,
            ...(config.databaseTools || []),
        ];

        super({
            ...config,
            tools: allTools,
            systemPrompt: config.systemPrompt || undefined, // Will use getDefaultSystemPrompt if not provided
        });

        // Set default channels
        this.defaultChannels = config.defaultChannels || ['teams'];

        // Set user preferences
        if (config.userPreferences) {
            this.userPreferences.set(config.userPreferences.userId, config.userPreferences);
        }

        // Set intelligent timing
        this.intelligentTiming = config.intelligentTiming !== false;
    }

    protected getDefaultSystemPrompt(): string {
        return `你是一个专业的通知管理智能体，负责智能化的通知发送和用户沟通。你的主要职责包括：

1. **智能通知发送**：
   - 根据内容类型和优先级选择最佳通知渠道
   - 分析用户活动模式，优化通知时机
   - 个性化通知内容和格式
   - 避免通知疲劳，控制通知频率

2. **多渠道通知管理**：
   - 支持Teams、钉钉、企业微信、Slack等多种通知渠道
   - 根据渠道特性优化消息格式
   - 实现通知发送失败的自动重试和降级
   - 提供通知状态跟踪和确认机制

3. **用户偏好学习**：
   - 分析用户对不同类型通知的响应模式
   - 学习用户的活跃时间和偏好渠道
   - 根据用户反馈调整通知策略
   - 提供个性化的通知体验

4. **上下文感知通知**：
   - 基于当前对话上下文生成相关通知
   - 整合来自其他智能体的信息
   - 提供智能的通知内容摘要和建议
   - 支持交互式通知和快速回复

5. **通知效果分析**：
   - 跟踪通知的送达率、阅读率和行动率
   - 分析不同渠道和时间的通知效果
   - 提供通知优化建议和策略调整
   - 生成通知效果报告和洞察

**通知原则**：
- 尊重用户的安静时间和偏好设置
- 根据紧急程度和重要性选择合适的通知方式
- 提供清晰、简洁、可操作的通知内容
- 避免重复和冗余的通知发送
- 确保通知内容的准确性和时效性

**交互原则**：
- 使用友好、专业的中文进行通知
- 根据用户偏好调整通知的语调和详细程度
- 提供明确的行动指引和后续步骤
- 支持用户对通知偏好的动态调整
- 在通知失败时提供替代方案

**可用工具**：
- 通知工具：发送多渠道通知、管理通知模板、跟踪通知状态
- 数据库工具：查询用户偏好、分析通知历史、存储通知记录

请根据用户的自然语言输入，智能选择合适的工具来完成通知管理任务。`;
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Notification Agent with LangChain', {
            toolCount: this.tools.length,
            defaultChannels: this.defaultChannels,
            intelligentTiming: this.intelligentTiming,
        });

        // Verify essential tools are available
        const requiredTools = [
            'send_notification',
            'send_teams_notification'
        ];
        const availableTools = this.getAvailableTools();

        for (const requiredTool of requiredTools) {
            if (!availableTools.includes(requiredTool)) {
                this.logger.warn(`Recommended tool not available: ${requiredTool}`);
            }
        }

        this.logger.info('Notification Agent initialized successfully');
    }

    /**
     * Send smart notification with intelligent optimization
     */
    async sendSmartNotification(
        content: NotificationContent,
        context: NotificationContext,
        threadId?: string
    ): Promise<any> {
        const input = `请发送智能通知。

        通知内容：
        - 类型：${content.type}
        - 优先级：${content.priority}
        - 标题：${content.title}
        - 消息：${content.message}
        - 用户ID：${content.userId}
        - 附件数量：${content.attachments?.length || 0}
        - 操作按钮数量：${content.actions?.length || 0}

        上下文信息：
        - 当前时间：${context.currentTime.toISOString()}
        - 最近通知数量：${context.recentNotifications.length}
        - 用户偏好语言：${context.userPreferences.language}
        - 启用渠道：${context.userPreferences.enabledChannels.join('、')}
        - 安静时间：${context.userPreferences.quietHours ?
                `${context.userPreferences.quietHours.start}-${context.userPreferences.quietHours.end}` : '无'}

        智能发送要求：
        1. 根据优先级和用户偏好选择最佳发送渠道
        2. 检查当前时间是否在用户安静时间内
        3. 分析最近通知频率，避免通知疲劳
        4. 根据用户偏好个性化通知内容
        5. 选择最佳的发送时机
        6. 提供发送状态和效果跟踪

        请使用 send_notification 工具发送通知。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Schedule intelligent notification for optimal timing
     */
    async scheduleIntelligentNotification(
        notification: IntelligentNotification,
        threadId?: string
    ): Promise<any> {
        const input = `请安排智能定时通知。

        通知配置：
        - 内容类型：${notification.content.type}
        - 优先级：${notification.content.priority}
        - 标题：${notification.content.title}
        - 推荐发送时间：${notification.optimalTiming.recommendedTime.toISOString()}
        - 时机置信度：${notification.optimalTiming.confidence}
        - 时机推理：${notification.optimalTiming.reasoning}
        - 备选时间：${notification.optimalTiming.alternativeTimes.map(t => t.toISOString()).join('、')}

        个性化设置：
        - 语调：${notification.personalization.tone}
        - 详细程度：${notification.personalization.detailLevel}
        - 包含上下文：${notification.personalization.includeContext ? '是' : '否'}
        - 自定义问候：${notification.personalization.customGreeting || '无'}

        备用渠道：${notification.fallbackChannels.join('、')}

        智能调度要求：
        1. 分析最佳发送时机和用户活跃模式
        2. 设置定时发送任务和备用方案
        3. 根据个性化设置调整通知内容
        4. 配置发送失败的重试和降级机制
        5. 提供调度状态监控和更新
        6. 记录调度决策和效果分析

        请配置相应的定时发送任务。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Send contextual alert with smart routing
     */
    async sendContextualAlert(
        alert: ContextualAlert,
        threadId?: string
    ): Promise<any> {
        const severityMap = {
            'info': '信息',
            'warning': '警告',
            'error': '错误',
            'critical': '严重'
        };

        const input = `请发送上下文感知的预警通知。

        预警信息：
        - 预警类型：${alert.alertType}
        - 严重程度：${severityMap[alert.severity]}
        - 上下文数据：${JSON.stringify(alert.context, null, 2)}
        - 建议操作：${alert.suggestedActions.join('；')}
        - 过期时间：${alert.expiryTime?.toISOString() || '无'}

        上下文预警要求：
        1. 根据严重程度选择紧急通知渠道
        2. 基于上下文数据生成详细的预警消息
        3. 提供明确的问题描述和影响分析
        4. 包含具体的操作建议和解决步骤
        5. 设置预警的有效期和自动清除
        6. 跟踪用户对预警的响应和处理状态

        请使用合适的通知工具发送预警。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Optimize notification timing based on user patterns
     */
    async optimizeNotificationTiming(
        userId: string,
        notificationType: string,
        threadId?: string
    ): Promise<any> {
        const userPrefs = this.userPreferences.get(userId);
        const recentHistory = this.notificationHistory.get(userId) || [];

        const input = `请优化用户的通知时机。

        用户信息：
        - 用户ID：${userId}
        - 通知类型：${notificationType}
        - 用户偏好：${userPrefs ? JSON.stringify(userPrefs, null, 2) : '未设置'}
        - 最近通知历史：${recentHistory.length}条记录

        时机优化要求：
        1. 分析用户的历史活跃时间和响应模式
        2. 识别用户对不同类型通知的最佳接收时间
        3. 考虑用户的安静时间和工作时间偏好
        4. 分析通知频率对用户响应率的影响
        5. 生成个性化的通知时机建议
        6. 提供时机优化的置信度和理由

        请分析并提供通知时机优化建议。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Analyze notification effectiveness and provide insights
     */
    async analyzeNotificationEffectiveness(threadId?: string): Promise<any> {
        const totalHistory = Array.from(this.notificationHistory.values()).flat();
        const totalNotifications = totalHistory.length;
        const readNotifications = totalHistory.filter(n => n.wasRead).length;
        const actionedNotifications = totalHistory.filter(n => n.wasActioned).length;

        const input = `请分析通知效果和用户参与度。

        通知统计：
        - 总通知数：${totalNotifications}
        - 已读通知数：${readNotifications}
        - 已操作通知数：${actionedNotifications}
        - 阅读率：${totalNotifications > 0 ? (readNotifications / totalNotifications * 100).toFixed(1) : 0}%
        - 操作率：${totalNotifications > 0 ? (actionedNotifications / totalNotifications * 100).toFixed(1) : 0}%

        效果分析要求：
        1. 分析不同类型通知的效果差异
        2. 评估各个通知渠道的表现
        3. 识别最佳的通知时间段和频率
        4. 分析用户参与度和响应模式
        5. 发现通知优化的机会和建议
        6. 生成通知策略改进方案

        请使用相关工具进行深度效果分析。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Send notification with automatic channel selection
     */
    async sendAutoNotification(options: {
        type: NotificationContent['type'];
        priority: NotificationContent['priority'];
        title: string;
        message: string;
        userId?: string;
        data?: any;
        attachments?: NotificationAttachment[];
        actions?: NotificationAction[];
        threadId?: string;
    }): Promise<any> {
        const {
            type,
            priority,
            title,
            message,
            userId = 'default_user',
            data,
            attachments,
            actions,
            threadId
        } = options;

        const userPrefs = this.userPreferences.get(userId);
        const channels = userPrefs?.enabledChannels || this.defaultChannels;

        const input = `请自动发送通知。

        通知信息：
        - 类型：${type}
        - 优先级：${priority}
        - 标题：${title}
        - 消息：${message}
        - 用户ID：${userId}
        - 可用渠道：${channels.join('、')}
        - 附加数据：${data ? JSON.stringify(data) : '无'}
        - 附件：${attachments?.length || 0}个
        - 操作按钮：${actions?.length || 0}个

        自动发送要求：
        1. 根据优先级自动选择最佳通知渠道
        2. 检查用户偏好和安静时间设置
        3. 格式化通知内容适配选定渠道
        4. 处理附件和操作按钮的渠道兼容性
        5. 实现发送失败的自动重试机制
        6. 记录发送状态和用户响应

        请使用 send_notification 工具发送。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Manage user notification preferences
     */
    async manageUserPreferences(options: {
        userId: string;
        action: 'get' | 'set' | 'update' | 'reset';
        preferences?: Partial<NotificationPreferences>;
        threadId?: string;
    }): Promise<any> {
        const { userId, action, preferences, threadId } = options;

        const currentPrefs = this.userPreferences.get(userId);

        const input = `请管理用户通知偏好。

        操作信息：
        - 用户ID：${userId}
        - 操作类型：${action}
        - 当前偏好：${currentPrefs ? JSON.stringify(currentPrefs, null, 2) : '未设置'}
        - 新偏好设置：${preferences ? JSON.stringify(preferences, null, 2) : '无'}

        偏好管理要求：
        1. 根据操作类型处理用户偏好设置
        2. 验证偏好设置的有效性和兼容性
        3. 更新内存和持久化存储中的偏好
        4. 提供偏好变更的确认和生效通知
        5. 支持偏好的批量更新和重置
        6. 记录偏好变更历史和审计日志

        请处理用户偏好管理请求。`;

        // Update local preferences based on action
        if (action === 'set' && preferences) {
            this.userPreferences.set(userId, preferences as NotificationPreferences);
        } else if (action === 'update' && preferences && currentPrefs) {
            this.userPreferences.set(userId, { ...currentPrefs, ...preferences });
        } else if (action === 'reset') {
            this.userPreferences.delete(userId);
        }

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Send bulk notifications with intelligent batching
     */
    async sendBulkNotifications(options: {
        notifications: NotificationContent[];
        batchSize?: number;
        delayBetweenBatches?: number;
        failureHandling?: 'continue' | 'stop' | 'retry';
        threadId?: string;
    }): Promise<any> {
        const {
            notifications,
            batchSize = 10,
            delayBetweenBatches = 1000,
            failureHandling = 'continue',
            threadId
        } = options;

        const input = `请批量发送通知。

        批量配置：
        - 通知总数：${notifications.length}
        - 批次大小：${batchSize}
        - 批次间延迟：${delayBetweenBatches}毫秒
        - 失败处理：${failureHandling}

        通知类型分布：
        ${Object.entries(
            notifications.reduce((acc, n) => {
                acc[n.type] = (acc[n.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        ).map(([type, count]) => `- ${type}: ${count}条`).join('\n')}

        批量发送要求：
        1. 将通知分批处理，避免系统过载
        2. 根据优先级和类型优化发送顺序
        3. 实现批次间的智能延迟控制
        4. 处理发送失败的重试和跳过逻辑
        5. 提供批量发送的进度跟踪
        6. 生成批量发送的结果报告

        请执行批量通知发送任务。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Create notification template for reuse
     */
    async createNotificationTemplate(options: {
        templateId: string;
        templateName: string;
        type: NotificationContent['type'];
        template: {
            titleTemplate: string;
            messageTemplate: string;
            defaultPriority: NotificationContent['priority'];
            supportedChannels: string[];
            variables: string[];
        };
        threadId?: string;
    }): Promise<any> {
        const { templateId, templateName, type, template, threadId } = options;

        const input = `请创建通知模板。

        模板信息：
        - 模板ID：${templateId}
        - 模板名称：${templateName}
        - 通知类型：${type}
        - 标题模板：${template.titleTemplate}
        - 消息模板：${template.messageTemplate}
        - 默认优先级：${template.defaultPriority}
        - 支持渠道：${template.supportedChannels.join('、')}
        - 模板变量：${template.variables.join('、')}

        模板创建要求：
        1. 验证模板语法和变量占位符
        2. 检查模板与支持渠道的兼容性
        3. 创建模板的多语言版本支持
        4. 设置模板的使用权限和范围
        5. 提供模板预览和测试功能
        6. 存储模板到模板库中

        请创建并保存通知模板。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate notification analytics report
     */
    async generateNotificationAnalytics(options: {
        timeRange: {
            startDate: string;
            endDate: string;
        };
        metrics?: ('delivery_rate' | 'read_rate' | 'action_rate' | 'channel_performance' | 'user_engagement')[];
        groupBy?: 'day' | 'week' | 'month' | 'channel' | 'type';
        threadId?: string;
    }): Promise<any> {
        const {
            timeRange,
            metrics = ['delivery_rate', 'read_rate', 'action_rate', 'channel_performance'],
            groupBy = 'day',
            threadId
        } = options;

        const input = `请生成通知分析报告。

        分析配置：
        - 时间范围：${timeRange.startDate} 至 ${timeRange.endDate}
        - 分析指标：${metrics.join('、')}
        - 分组方式：${groupBy}

        分析要求：
        1. 计算指定时间范围内的通知效果指标
        2. 分析不同渠道的表现差异
        3. 识别通知效果的趋势和模式
        4. 评估用户参与度和满意度
        5. 发现优化机会和改进建议
        6. 生成可视化的分析图表和报告

        请使用相关工具生成详细的分析报告。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Update default notification channels
     */
    updateDefaultChannels(channels: string[]): void {
        this.defaultChannels = channels;
        this.logger.info('Default notification channels updated', {
            channels: this.defaultChannels
        });
    }

    /**
     * Get default notification channels
     */
    getDefaultChannels(): string[] {
        return [...this.defaultChannels];
    }

    /**
     * Update user preferences
     */
    updateUserPreferences(userId: string, preferences: Partial<NotificationPreferences>): void {
        const current = this.userPreferences.get(userId);
        if (current) {
            this.userPreferences.set(userId, { ...current, ...preferences });
        } else {
            this.userPreferences.set(userId, preferences as NotificationPreferences);
        }

        this.logger.info('User notification preferences updated', {
            userId,
            preferences: Object.keys(preferences)
        });
    }

    /**
     * Get user preferences
     */
    getUserPreferences(userId: string): NotificationPreferences | undefined {
        return this.userPreferences.get(userId);
    }

    /**
     * Toggle intelligent timing
     */
    setIntelligentTiming(enabled: boolean): void {
        this.intelligentTiming = enabled;
        this.logger.info('Intelligent timing setting updated', {
            enabled: this.intelligentTiming
        });
    }

    /**
     * Get intelligent timing status
     */
    getIntelligentTiming(): boolean {
        return this.intelligentTiming;
    }

    /**
     * Record notification in history
     */
    recordNotification(userId: string, notification: RecentNotification): void {
        const history = this.notificationHistory.get(userId) || [];
        history.push(notification);

        // Keep only recent notifications (last 100)
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }

        this.notificationHistory.set(userId, history);
    }

    /**
     * Get notification history for user
     */
    getNotificationHistory(userId: string): RecentNotification[] {
        return this.notificationHistory.get(userId) || [];
    }

    /**
     * Create notification-specific tools factory method
     */
    static createNotificationTools(): {
        notificationTools: DynamicTool[];
        databaseTools: DynamicTool[];
    } {
        // Import the actual notification tools
        const {
            sendNotificationTool,
            sendTeamsNotificationTool,
            sendDingTalkNotificationTool,
            sendWeChatWorkNotificationTool,
            sendSlackNotificationTool
        } = require('../tools/NotificationTools');

        const {
            getUserPreferencesTool,
            saveUserPreferencesTool,
            getNotificationHistoryTool,
            saveNotificationHistoryTool
        } = require('../tools/DatabaseTools');

        // Notification tools for sending messages
        const notificationTools = [
            sendNotificationTool,
            sendTeamsNotificationTool,
            sendDingTalkNotificationTool,
            sendWeChatWorkNotificationTool,
            sendSlackNotificationTool
        ];

        // Database tools for preferences and history
        const databaseTools = [
            getUserPreferencesTool,
            saveUserPreferencesTool,
            getNotificationHistoryTool,
            saveNotificationHistoryTool
        ];

        return {
            notificationTools,
            databaseTools,
        };
    }
}
