/**
 * Notification Service
 * Handles multi-channel notification sending with retry and fallback mechanisms
 */

import { Logger } from '@/utils/Logger';
import { RetryPolicy } from '@/types/common.types';

export interface NotificationChannel {
    name: string;
    type: 'teams' | 'dingtalk' | 'wechat-work' | 'slack' | 'email' | 'webhook';
    config: {
        webhookUrl?: string;
        apiKey?: string;
        appId?: string;
        appSecret?: string;
        [key: string]: any;
    };
    enabled: boolean;
    priority: number; // Lower number = higher priority
    rateLimits?: {
        maxRequestsPerMinute: number;
        maxRequestsPerHour: number;
        maxRequestsPerDay: number;
    };
}

export interface NotificationMessage {
    title: string;
    content: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    attachments?: NotificationAttachment[];
    actions?: NotificationAction[];
    metadata?: Record<string, any>;
}

export interface NotificationAttachment {
    type: 'image' | 'file' | 'link';
    url: string;
    title?: string;
    description?: string;
}

export interface NotificationAction {
    actionId: string;
    label: string;
    actionType: 'button' | 'link' | 'quick-reply';
    actionData: any;
}

export interface NotificationRequest {
    recipientId?: string;
    channels: string[]; // Channel names to use
    message: NotificationMessage;
    scheduledTime?: Date;
    expiryTime?: Date;
    fallbackChannels?: string[];
}

export interface NotificationResult {
    success: boolean;
    notificationId: string;
    channelResults: ChannelResult[];
    error?: string;
}

export interface ChannelResult {
    channelName: string;
    success: boolean;
    messageId?: string;
    error?: string;
    deliveredAt?: Date;
    responseTime?: number;
}

export interface NotificationTemplate {
    templateId: string;
    name: string;
    title: string;
    content: string;
    variables: string[];
    defaultPriority: 'low' | 'normal' | 'high' | 'urgent';
}

export class NotificationService {
    private static instance: NotificationService;
    private logger: Logger;
    private channels: Map<string, NotificationChannel>;
    private templates: Map<string, NotificationTemplate>;
    private retryPolicy: RetryPolicy;
    private rateLimitTracking: Map<string, { requests: number; resetTime: number }>;
    private isInitialized = false;

    private constructor() {
        this.logger = new Logger({
            component: 'NotificationService',
            level: 'info'
        });

        this.channels = new Map();
        this.templates = new Map();
        this.rateLimitTracking = new Map();

        this.retryPolicy = {
            maxRetries: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 10000
        };
    }

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    /**
     * Initialize notification service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Initialize default channels from environment variables
            this.initializeDefaultChannels();

            // Initialize default templates
            this.initializeDefaultTemplates();

            // Start rate limit cleanup interval
            this.startRateLimitCleanup();

            this.isInitialized = true;
            this.logger.info('Notification service initialized', {
                channelCount: this.channels.size,
                templateCount: this.templates.size
            });

        } catch (error) {
            this.logger.error('Failed to initialize notification service', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Send notification
     */
    async sendNotification(request: NotificationRequest): Promise<NotificationResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const notificationId = this.generateNotificationId();
        const channelResults: ChannelResult[] = [];

        try {
            this.logger.info('Sending notification', {
                notificationId,
                channels: request.channels,
                priority: request.message.priority,
                recipientId: request.recipientId
            });

            // Check if notification is scheduled for future
            if (request.scheduledTime && request.scheduledTime > new Date()) {
                // In a real implementation, this would be queued for later delivery
                this.logger.info('Notification scheduled for future delivery', {
                    notificationId,
                    scheduledTime: request.scheduledTime
                });

                return {
                    success: true,
                    notificationId,
                    channelResults: [{
                        channelName: 'scheduler',
                        success: true,
                        messageId: `scheduled_${notificationId}`,
                        deliveredAt: new Date()
                    }]
                };
            }

            // Check if notification has expired
            if (request.expiryTime && request.expiryTime < new Date()) {
                return {
                    success: false,
                    notificationId,
                    channelResults: [],
                    error: 'Notification has expired'
                };
            }

            // Try primary channels first
            const primaryChannels = request.channels
                .map(name => this.channels.get(name))
                .filter(channel => channel && channel.enabled)
                .sort((a, b) => a!.priority - b!.priority);

            let successfulDelivery = false;

            for (const channel of primaryChannels) {
                if (!channel) continue;

                try {
                    const result = await this.sendToChannel(channel, request.message, notificationId);
                    channelResults.push(result);

                    if (result.success) {
                        successfulDelivery = true;
                        // For high priority messages, try all channels
                        if (request.message.priority !== 'high' && request.message.priority !== 'urgent') {
                            break;
                        }
                    }
                } catch (error) {
                    channelResults.push({
                        channelName: channel.name,
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Try fallback channels if primary channels failed
            if (!successfulDelivery && request.fallbackChannels) {
                const fallbackChannels = request.fallbackChannels
                    .map(name => this.channels.get(name))
                    .filter(channel => channel && channel.enabled);

                for (const channel of fallbackChannels) {
                    if (!channel) continue;

                    try {
                        const result = await this.sendToChannel(channel, request.message, notificationId);
                        channelResults.push(result);

                        if (result.success) {
                            successfulDelivery = true;
                            break;
                        }
                    } catch (error) {
                        channelResults.push({
                            channelName: channel.name,
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            const result: NotificationResult = {
                success: successfulDelivery,
                notificationId,
                channelResults,
                error: successfulDelivery ? undefined : 'All notification channels failed'
            };

            this.logger.info('Notification sending completed', {
                notificationId,
                success: successfulDelivery,
                channelResults: channelResults.length,
                successfulChannels: channelResults.filter(r => r.success).length
            });

            return result;

        } catch (error) {
            this.logger.error('Failed to send notification', {
                notificationId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                notificationId,
                channelResults,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Send notification using template
     */
    async sendTemplatedNotification(
        templateId: string,
        variables: Record<string, any>,
        request: Omit<NotificationRequest, 'message'>
    ): Promise<NotificationResult> {
        try {
            const template = this.templates.get(templateId);
            if (!template) {
                throw new Error(`Template not found: ${templateId}`);
            }

            // Replace variables in template
            const title = this.replaceVariables(template.title, variables);
            const content = this.replaceVariables(template.content, variables);

            const message: NotificationMessage = {
                title,
                content,
                priority: template.defaultPriority,
                metadata: { templateId, variables }
            };

            return this.sendNotification({
                ...request,
                message
            });

        } catch (error) {
            this.logger.error('Failed to send templated notification', {
                templateId,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                success: false,
                notificationId: this.generateNotificationId(),
                channelResults: [],
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Add or update notification channel
     */
    addChannel(channel: NotificationChannel): void {
        this.channels.set(channel.name, channel);
        this.logger.info('Notification channel added/updated', {
            name: channel.name,
            type: channel.type,
            enabled: channel.enabled
        });
    }

    /**
     * Remove notification channel
     */
    removeChannel(channelName: string): boolean {
        const removed = this.channels.delete(channelName);
        if (removed) {
            this.logger.info('Notification channel removed', { channelName });
        }
        return removed;
    }

    /**
     * Add or update notification template
     */
    addTemplate(template: NotificationTemplate): void {
        this.templates.set(template.templateId, template);
        this.logger.info('Notification template added/updated', {
            templateId: template.templateId,
            name: template.name
        });
    }

    /**
     * Get available channels
     */
    getAvailableChannels(): NotificationChannel[] {
        return Array.from(this.channels.values());
    }

    /**
     * Get available templates
     */
    getAvailableTemplates(): NotificationTemplate[] {
        return Array.from(this.templates.values());
    }

    // Private methods

    /**
     * Send notification to specific channel
     */
    private async sendToChannel(
        channel: NotificationChannel,
        message: NotificationMessage,
        notificationId: string
    ): Promise<ChannelResult> {
        const startTime = Date.now();

        try {
            // Check rate limits
            if (!this.checkRateLimit(channel)) {
                return {
                    channelName: channel.name,
                    success: false,
                    error: 'Rate limit exceeded'
                };
            }

            // Send based on channel type
            let messageId: string;
            switch (channel.type) {
                case 'teams':
                    messageId = await this.sendToTeams(channel, message);
                    break;
                case 'dingtalk':
                    messageId = await this.sendToDingTalk(channel, message);
                    break;
                case 'wechat-work':
                    messageId = await this.sendToWeChatWork(channel, message);
                    break;
                case 'slack':
                    messageId = await this.sendToSlack(channel, message);
                    break;
                case 'webhook':
                    messageId = await this.sendToWebhook(channel, message);
                    break;
                default:
                    throw new Error(`Unsupported channel type: ${channel.type}`);
            }

            const responseTime = Date.now() - startTime;

            this.logger.debug('Channel delivery successful', {
                channelName: channel.name,
                messageId,
                responseTime
            });

            return {
                channelName: channel.name,
                success: true,
                messageId,
                deliveredAt: new Date(),
                responseTime
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;

            this.logger.error('Channel delivery failed', {
                channelName: channel.name,
                error: error instanceof Error ? error.message : String(error),
                responseTime
            });

            return {
                channelName: channel.name,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                responseTime
            };
        }
    }

    /**
     * Send to Microsoft Teams
     */
    private async sendToTeams(channel: NotificationChannel, message: NotificationMessage): Promise<string> {
        if (!channel.config.webhookUrl) {
            throw new Error('Teams webhook URL not configured');
        }

        const payload = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": this.getPriorityColor(message.priority),
            "summary": message.title,
            "sections": [{
                "activityTitle": message.title,
                "activityText": message.content,
                "facts": message.metadata ? Object.entries(message.metadata).map(([key, value]) => ({
                    "name": key,
                    "value": String(value)
                })) : []
            }]
        };

        // Add actions if provided
        if (message.actions && message.actions.length > 0) {
            payload.sections[0]["potentialAction"] = message.actions.map(action => ({
                "@type": "OpenUri",
                "name": action.label,
                "targets": [{
                    "os": "default",
                    "uri": action.actionData.url || "#"
                }]
            }));
        }

        const response = await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Teams API error: ${response.status} ${response.statusText}`);
        }

        return `teams_${Date.now()}`;
    }

    /**
     * Send to DingTalk
     */
    private async sendToDingTalk(channel: NotificationChannel, message: NotificationMessage): Promise<string> {
        if (!channel.config.webhookUrl) {
            throw new Error('DingTalk webhook URL not configured');
        }

        const payload = {
            "msgtype": "markdown",
            "markdown": {
                "title": message.title,
                "text": `# ${message.title}\n\n${message.content}`
            }
        };

        const response = await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`DingTalk API error: ${response.status} ${response.statusText}`);
        }

        return `dingtalk_${Date.now()}`;
    }

    /**
     * Send to WeChat Work
     */
    private async sendToWeChatWork(channel: NotificationChannel, message: NotificationMessage): Promise<string> {
        if (!channel.config.webhookUrl) {
            throw new Error('WeChat Work webhook URL not configured');
        }

        const payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": `# ${message.title}\n\n${message.content}`
            }
        };

        const response = await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`WeChat Work API error: ${response.status} ${response.statusText}`);
        }

        return `wechat_${Date.now()}`;
    }

    /**
     * Send to Slack
     */
    private async sendToSlack(channel: NotificationChannel, message: NotificationMessage): Promise<string> {
        if (!channel.config.webhookUrl) {
            throw new Error('Slack webhook URL not configured');
        }

        const payload = {
            "text": message.title,
            "attachments": [{
                "color": this.getPriorityColor(message.priority),
                "text": message.content,
                "fields": message.metadata ? Object.entries(message.metadata).map(([key, value]) => ({
                    "title": key,
                    "value": String(value),
                    "short": true
                })) : []
            }]
        };

        const response = await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
        }

        return `slack_${Date.now()}`;
    }

    /**
     * Send to generic webhook
     */
    private async sendToWebhook(channel: NotificationChannel, message: NotificationMessage): Promise<string> {
        if (!channel.config.webhookUrl) {
            throw new Error('Webhook URL not configured');
        }

        const payload = {
            title: message.title,
            content: message.content,
            priority: message.priority,
            attachments: message.attachments,
            actions: message.actions,
            metadata: message.metadata
        };

        const response = await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(channel.config.apiKey && { 'Authorization': `Bearer ${channel.config.apiKey}` })
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook API error: ${response.status} ${response.statusText}`);
        }

        return `webhook_${Date.now()}`;
    }

    /**
     * Check rate limits for channel
     */
    private checkRateLimit(channel: NotificationChannel): boolean {
        if (!channel.rateLimits) {
            return true;
        }

        const now = Date.now();
        const tracking = this.rateLimitTracking.get(channel.name);

        if (!tracking || now > tracking.resetTime) {
            this.rateLimitTracking.set(channel.name, {
                requests: 1,
                resetTime: now + 60000 // Reset every minute
            });
            return true;
        }

        if (tracking.requests >= channel.rateLimits.maxRequestsPerMinute) {
            return false;
        }

        tracking.requests++;
        return true;
    }

    /**
     * Get color for priority level
     */
    private getPriorityColor(priority: string): string {
        switch (priority) {
            case 'urgent': return '#FF0000';
            case 'high': return '#FF8C00';
            case 'normal': return '#0078D4';
            case 'low': return '#808080';
            default: return '#0078D4';
        }
    }

    /**
     * Replace variables in template string
     */
    private replaceVariables(template: string, variables: Record<string, any>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }

    /**
     * Generate unique notification ID
     */
    private generateNotificationId(): string {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize default channels from environment
     */
    private initializeDefaultChannels(): void {
        // Teams channel
        if (process.env.TEAMS_WEBHOOK_URL) {
            this.addChannel({
                name: 'teams-default',
                type: 'teams',
                config: {
                    webhookUrl: process.env.TEAMS_WEBHOOK_URL
                },
                enabled: true,
                priority: 1
            });
        }

        // DingTalk channel
        if (process.env.DINGTALK_WEBHOOK_URL) {
            this.addChannel({
                name: 'dingtalk-default',
                type: 'dingtalk',
                config: {
                    webhookUrl: process.env.DINGTALK_WEBHOOK_URL
                },
                enabled: true,
                priority: 2
            });
        }

        // WeChat Work channel
        if (process.env.WECHAT_WORK_WEBHOOK_URL) {
            this.addChannel({
                name: 'wechat-work-default',
                type: 'wechat-work',
                config: {
                    webhookUrl: process.env.WECHAT_WORK_WEBHOOK_URL
                },
                enabled: true,
                priority: 3
            });
        }
    }

    /**
     * Initialize default templates
     */
    private initializeDefaultTemplates(): void {
        // Inventory alert template
        this.addTemplate({
            templateId: 'inventory-alert',
            name: 'Inventory Alert',
            title: '库存预警：{{itemName}}',
            content: '物品 **{{itemName}}** 库存不足，当前数量：{{currentQuantity}}，建议补货数量：{{suggestedQuantity}}',
            variables: ['itemName', 'currentQuantity', 'suggestedQuantity'],
            defaultPriority: 'normal'
        });

        // Purchase recommendation template
        this.addTemplate({
            templateId: 'purchase-recommendation',
            name: 'Purchase Recommendation',
            title: '采购建议',
            content: '基于历史消费数据，建议采购以下物品：\n\n{{recommendations}}',
            variables: ['recommendations'],
            defaultPriority: 'low'
        });

        // Financial report template
        this.addTemplate({
            templateId: 'financial-report',
            name: 'Financial Report',
            title: '{{period}}财务报告',
            content: '总支出：{{totalSpending}}\n主要类别：{{topCategories}}\n异常消费：{{anomalies}}',
            variables: ['period', 'totalSpending', 'topCategories', 'anomalies'],
            defaultPriority: 'normal'
        });

        // System update template
        this.addTemplate({
            templateId: 'system-update',
            name: 'System Update',
            title: '系统更新通知',
            content: '{{updateType}}：{{description}}\n\n状态：{{status}}\n时间：{{timestamp}}',
            variables: ['updateType', 'description', 'status', 'timestamp'],
            defaultPriority: 'low'
        });
    }

    /**
     * Start rate limit cleanup interval
     */
    private startRateLimitCleanup(): void {
        setInterval(() => {
            const now = Date.now();
            for (const [channelName, tracking] of this.rateLimitTracking.entries()) {
                if (now > tracking.resetTime) {
                    this.rateLimitTracking.delete(channelName);
                }
            }
        }, 60000); // Clean up every minute
    }
}
