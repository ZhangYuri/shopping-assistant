/**
 * Notification Tools
 * DynamicTool implementations for notification operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { NotificationService, NotificationRequest, NotificationMessage, NotificationChannel, NotificationTemplate } from '@/services/NotificationService';
import { Logger } from '@/utils/Logger';

const logger = new Logger({
    component: 'NotificationTools',
    level: 'info'
});

const notificationService = NotificationService.getInstance();

// Basic notification tools

export const sendNotificationTool = new DynamicTool({
    name: 'send_notification',
    description: '发送通知消息。输入: {"channels": ["通道名称"], "message": {"title": "标题", "content": "内容", "priority": "优先级"}, "recipientId": "接收者ID", "fallbackChannels": ["备用通道"]}',
    func: async (input: string) => {
        try {
            const {
                channels,
                message,
                recipientId,
                fallbackChannels,
                scheduledTime,
                expiryTime
            } = JSON.parse(input);

            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: '通知通道不能为空'
                });
            }

            if (!message || !message.title || !message.content) {
                return JSON.stringify({
                    success: false,
                    error: '消息标题和内容不能为空'
                });
            }

            const request: NotificationRequest = {
                channels,
                message: {
                    title: message.title,
                    content: message.content,
                    priority: message.priority || 'normal',
                    attachments: message.attachments,
                    actions: message.actions,
                    metadata: message.metadata
                },
                recipientId,
                fallbackChannels,
                scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
                expiryTime: expiryTime ? new Date(expiryTime) : undefined
            };

            const result = await notificationService.sendNotification(request);

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    channelResults: result.channelResults,
                    successfulChannels: result.channelResults.filter(r => r.success).length,
                    totalChannels: result.channelResults.length
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send notification', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const sendTemplatedNotificationTool = new DynamicTool({
    name: 'send_templated_notification',
    description: '使用模板发送通知。输入: {"templateId": "模板ID", "variables": {"变量名": "值"}, "channels": ["通道名称"], "recipientId": "接收者ID"}',
    func: async (input: string) => {
        try {
            const {
                templateId,
                variables,
                channels,
                recipientId,
                fallbackChannels,
                scheduledTime,
                expiryTime
            } = JSON.parse(input);

            if (!templateId) {
                return JSON.stringify({
                    success: false,
                    error: '模板ID不能为空'
                });
            }

            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: '通知通道不能为空'
                });
            }

            const result = await notificationService.sendTemplatedNotification(
                templateId,
                variables || {},
                {
                    channels,
                    recipientId,
                    fallbackChannels,
                    scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
                    expiryTime: expiryTime ? new Date(expiryTime) : undefined
                }
            );

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    channelResults: result.channelResults,
                    successfulChannels: result.channelResults.filter(r => r.success).length,
                    totalChannels: result.channelResults.length
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send templated notification', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Teams-specific tools

export const sendTeamsNotificationTool = new DynamicTool({
    name: 'send_teams_notification',
    description: '发送Teams通知。输入: {"title": "标题", "content": "内容", "priority": "优先级", "webhookUrl": "Webhook URL(可选)", "actions": [{"label": "按钮文本", "actionData": {"url": "链接"}}]}',
    func: async (input: string) => {
        try {
            const {
                title,
                content,
                priority = 'normal',
                webhookUrl,
                actions,
                metadata
            } = JSON.parse(input);

            if (!title || !content) {
                return JSON.stringify({
                    success: false,
                    error: '标题和内容不能为空'
                });
            }

            // Use default Teams channel or create temporary one
            let channelName = 'teams-default';

            if (webhookUrl) {
                // Create temporary channel for this specific webhook
                channelName = `teams-temp-${Date.now()}`;
                notificationService.addChannel({
                    name: channelName,
                    type: 'teams',
                    config: { webhookUrl },
                    enabled: true,
                    priority: 1
                });
            }

            const request: NotificationRequest = {
                channels: [channelName],
                message: {
                    title,
                    content,
                    priority,
                    actions,
                    metadata
                }
            };

            const result = await notificationService.sendNotification(request);

            // Clean up temporary channel
            if (webhookUrl) {
                notificationService.removeChannel(channelName);
            }

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    channelResults: result.channelResults
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send Teams notification', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Channel management tools

export const addNotificationChannelTool = new DynamicTool({
    name: 'add_notification_channel',
    description: '添加通知通道。输入: {"name": "通道名称", "type": "通道类型", "config": {"webhookUrl": "URL", "apiKey": "密钥"}, "enabled": true, "priority": 1}',
    func: async (input: string) => {
        try {
            const { name, type, config, enabled = true, priority = 1, rateLimits } = JSON.parse(input);

            if (!name || !type || !config) {
                return JSON.stringify({
                    success: false,
                    error: '通道名称、类型和配置不能为空'
                });
            }

            const supportedTypes = ['teams', 'dingtalk', 'wechat-work', 'slack', 'email', 'webhook'];
            if (!supportedTypes.includes(type)) {
                return JSON.stringify({
                    success: false,
                    error: `不支持的通道类型: ${type}。支持的类型: ${supportedTypes.join(', ')}`
                });
            }

            const channel: NotificationChannel = {
                name,
                type,
                config,
                enabled,
                priority,
                rateLimits
            };

            notificationService.addChannel(channel);

            return JSON.stringify({
                success: true,
                data: {
                    name,
                    type,
                    enabled,
                    priority,
                    message: '通知通道已添加'
                }
            });

        } catch (error) {
            logger.error('Failed to add notification channel', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const removeNotificationChannelTool = new DynamicTool({
    name: 'remove_notification_channel',
    description: '移除通知通道。输入: {"name": "通道名称"}',
    func: async (input: string) => {
        try {
            const { name } = JSON.parse(input);

            if (!name) {
                return JSON.stringify({
                    success: false,
                    error: '通道名称不能为空'
                });
            }

            const removed = notificationService.removeChannel(name);

            return JSON.stringify({
                success: removed,
                data: {
                    name,
                    message: removed ? '通知通道已移除' : '通知通道不存在'
                }
            });

        } catch (error) {
            logger.error('Failed to remove notification channel', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getAvailableChannelsTool = new DynamicTool({
    name: 'get_available_channels',
    description: '获取可用的通知通道列表。输入: {}',
    func: async (input: string) => {
        try {
            const channels = notificationService.getAvailableChannels();

            return JSON.stringify({
                success: true,
                data: {
                    channels: channels.map(channel => ({
                        name: channel.name,
                        type: channel.type,
                        enabled: channel.enabled,
                        priority: channel.priority,
                        hasRateLimits: !!channel.rateLimits
                    })),
                    count: channels.length
                }
            });

        } catch (error) {
            logger.error('Failed to get available channels', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Template management tools

export const addNotificationTemplateTool = new DynamicTool({
    name: 'add_notification_template',
    description: '添加通知模板。输入: {"templateId": "模板ID", "name": "模板名称", "title": "标题模板", "content": "内容模板", "variables": ["变量1", "变量2"], "defaultPriority": "优先级"}',
    func: async (input: string) => {
        try {
            const {
                templateId,
                name,
                title,
                content,
                variables = [],
                defaultPriority = 'normal'
            } = JSON.parse(input);

            if (!templateId || !name || !title || !content) {
                return JSON.stringify({
                    success: false,
                    error: '模板ID、名称、标题和内容不能为空'
                });
            }

            const template: NotificationTemplate = {
                templateId,
                name,
                title,
                content,
                variables,
                defaultPriority
            };

            notificationService.addTemplate(template);

            return JSON.stringify({
                success: true,
                data: {
                    templateId,
                    name,
                    variables,
                    defaultPriority,
                    message: '通知模板已添加'
                }
            });

        } catch (error) {
            logger.error('Failed to add notification template', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getAvailableTemplatesTool = new DynamicTool({
    name: 'get_available_templates',
    description: '获取可用的通知模板列表。输入: {}',
    func: async (input: string) => {
        try {
            const templates = notificationService.getAvailableTemplates();

            return JSON.stringify({
                success: true,
                data: {
                    templates: templates.map(template => ({
                        templateId: template.templateId,
                        name: template.name,
                        variables: template.variables,
                        defaultPriority: template.defaultPriority
                    })),
                    count: templates.length
                }
            });

        } catch (error) {
            logger.error('Failed to get available templates', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Specialized notification tools

export const sendInventoryAlertTool = new DynamicTool({
    name: 'send_inventory_alert',
    description: '发送库存预警通知。输入: {"itemName": "物品名称", "currentQuantity": 当前数量, "suggestedQuantity": 建议数量, "channels": ["通道名称"]}',
    func: async (input: string) => {
        try {
            const { itemName, currentQuantity, suggestedQuantity, channels = ['teams-default'] } = JSON.parse(input);

            if (!itemName || currentQuantity === undefined) {
                return JSON.stringify({
                    success: false,
                    error: '物品名称和当前数量不能为空'
                });
            }

            const result = await notificationService.sendTemplatedNotification(
                'inventory-alert',
                {
                    itemName,
                    currentQuantity,
                    suggestedQuantity: suggestedQuantity || Math.max(5, currentQuantity * 2)
                },
                { channels }
            );

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    itemName,
                    currentQuantity,
                    suggestedQuantity
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send inventory alert', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const sendPurchaseRecommendationTool = new DynamicTool({
    name: 'send_purchase_recommendation',
    description: '发送采购建议通知。输入: {"recommendations": "建议内容", "channels": ["通道名称"]}',
    func: async (input: string) => {
        try {
            const { recommendations, channels = ['teams-default'] } = JSON.parse(input);

            if (!recommendations) {
                return JSON.stringify({
                    success: false,
                    error: '采购建议内容不能为空'
                });
            }

            const result = await notificationService.sendTemplatedNotification(
                'purchase-recommendation',
                { recommendations },
                { channels }
            );

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    recommendations
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send purchase recommendation', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const sendFinancialReportTool = new DynamicTool({
    name: 'send_financial_report',
    description: '发送财务报告通知。输入: {"period": "报告期间", "totalSpending": "总支出", "topCategories": "主要类别", "anomalies": "异常消费", "channels": ["通道名称"]}',
    func: async (input: string) => {
        try {
            const {
                period,
                totalSpending,
                topCategories,
                anomalies,
                channels = ['teams-default']
            } = JSON.parse(input);

            if (!period || !totalSpending) {
                return JSON.stringify({
                    success: false,
                    error: '报告期间和总支出不能为空'
                });
            }

            const result = await notificationService.sendTemplatedNotification(
                'financial-report',
                {
                    period,
                    totalSpending,
                    topCategories: topCategories || '无数据',
                    anomalies: anomalies || '无异常'
                },
                { channels }
            );

            return JSON.stringify({
                success: result.success,
                data: {
                    notificationId: result.notificationId,
                    period,
                    totalSpending
                },
                error: result.error
            });

        } catch (error) {
            logger.error('Failed to send financial report', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Tool factory functions for easy integration

export function createBasicNotificationTools(): DynamicTool[] {
    return [
        sendNotificationTool,
        sendTemplatedNotificationTool,
        sendTeamsNotificationTool
    ];
}

export function createChannelManagementTools(): DynamicTool[] {
    return [
        addNotificationChannelTool,
        removeNotificationChannelTool,
        getAvailableChannelsTool
    ];
}

export function createTemplateManagementTools(): DynamicTool[] {
    return [
        addNotificationTemplateTool,
        getAvailableTemplatesTool
    ];
}

export function createSpecializedNotificationTools(): DynamicTool[] {
    return [
        sendInventoryAlertTool,
        sendPurchaseRecommendationTool,
        sendFinancialReportTool
    ];
}

export function createAllNotificationTools(): DynamicTool[] {
    return [
        ...createBasicNotificationTools(),
        ...createChannelManagementTools(),
        ...createTemplateManagementTools(),
        ...createSpecializedNotificationTools()
    ];
}
