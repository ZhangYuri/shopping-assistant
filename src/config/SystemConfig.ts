/**
 * System Configuration Management
 * Handles agent and tool configuration with runtime updates
 */

import { Logger } from '../utils/Logger';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Joi from 'joi';

// Agent configuration interfaces
export interface AgentConfig {
    agentId: string;
    name: string;
    description: string;
    enabled: boolean;
    parameters: Record<string, any>;
    tools: string[];
    thresholds?: Record<string, number>;
    platforms?: string[];
    channels?: string[];
}

export interface InventoryAgentConfig extends AgentConfig {
    thresholds: {
        lowStock: number;
        criticalStock: number;
        expiryWarningDays: number;
    };
    ocrSettings: {
        enabled: boolean;
        confidence: number;
        languages: string[];
    };
}

export interface ProcurementAgentConfig extends AgentConfig {
    platforms: string[];
    analysisSettings: {
        historyDays: number;
        seasonalAnalysis: boolean;
        priceTracking: boolean;
    };
    learningSettings: {
        enabled: boolean;
        feedbackWeight: number;
        adaptationRate: number;
    };
}

export interface FinanceAgentConfig extends AgentConfig {
    budgetSettings: {
        monthlyBudget: number;
        categories: Record<string, number>;
        alertThreshold: number;
    };
    analysisSettings: {
        anomalyDetection: boolean;
        trendAnalysis: boolean;
        reportFrequency: 'daily' | 'weekly' | 'monthly';
    };
}

export interface NotificationAgentConfig extends AgentConfig {
    channels: string[];
    preferences: {
        defaultChannel: string;
        quietHours: {
            enabled: boolean;
            start: string;
            end: string;
            timezone: string;
        };
        priority: {
            low: string[];
            normal: string[];
            high: string[];
            urgent: string[];
        };
    };
    templates: Record<string, string>;
}

// Tool configuration interfaces
export interface ToolConfig {
    name: string;
    category: 'database' | 'file-storage' | 'notification' | 'cache';
    enabled: boolean;
    parameters: Record<string, any>;
    retryPolicy: {
        maxRetries: number;
        backoffStrategy: 'exponential' | 'linear' | 'fixed';
        baseDelay: number;
        maxDelay: number;
    };
    timeout: number;
}

export interface DatabaseToolConfig extends ToolConfig {
    connection: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        ssl: boolean;
        connectionLimit: number;
    };
    querySettings: {
        timeout: number;
        maxRows: number;
        enableTransactions: boolean;
    };
}

export interface FileStorageToolConfig extends ToolConfig {
    storage: {
        type: 'local' | 'cloud';
        basePath: string;
        maxFileSize: number;
        allowedTypes: string[];
    };
    processing: {
        enableOCR: boolean;
        enableImageProcessing: boolean;
        enableExcelParsing: boolean;
    };
}

export interface NotificationToolConfig extends ToolConfig {
    channels: {
        teams: {
            enabled: boolean;
            webhookUrl: string;
            retryCount: number;
        };
        dingtalk: {
            enabled: boolean;
            accessToken: string;
            secret: string;
        };
        wechatWork: {
            enabled: boolean;
            corpId: string;
            agentId: string;
            secret: string;
        };
        email: {
            enabled: boolean;
            smtp: {
                host: string;
                port: number;
                secure: boolean;
                auth: {
                    user: string;
                    pass: string;
                };
            };
        };
    };
}

// System configuration interface
export interface SystemConfiguration {
    version: string;
    environment: 'development' | 'staging' | 'production';
    agents: {
        inventory: InventoryAgentConfig;
        procurement: ProcurementAgentConfig;
        finance: FinanceAgentConfig;
        notification: NotificationAgentConfig;
    };
    tools: {
        database: DatabaseToolConfig;
        fileStorage: FileStorageToolConfig;
        notification: NotificationToolConfig;
    };
    system: {
        logging: {
            level: 'debug' | 'info' | 'warn' | 'error';
            enableConsole: boolean;
            enableFile: boolean;
            filePath: string;
        };
        performance: {
            enableMetrics: boolean;
            metricsInterval: number;
            enableProfiling: boolean;
        };
        security: {
            enableAuth: boolean;
            tokenExpiry: number;
            enableRateLimit: boolean;
            rateLimitWindow: number;
            rateLimitMax: number;
        };
    };
    lastUpdated: string;
    updatedBy: string;
}

/**
 * System Configuration Manager
 * Handles loading, validation, and runtime updates of system configuration
 */
export class SystemConfigManager {
    private logger: Logger;
    private config: SystemConfiguration;
    private configPath: string;
    private watchers: Map<string, (config: SystemConfiguration) => void> = new Map();
    private validationSchema: Joi.ObjectSchema;

    constructor(configPath?: string) {
        this.logger = new Logger({
            component: 'SystemConfigManager',
            level: 'info',
        });

        this.configPath = configPath || join(process.cwd(), 'config', 'system.json');
        this.validationSchema = this.createValidationSchema();
        this.config = this.loadConfiguration();
    }

    /**
     * Create Joi validation schema for configuration
     */
    private createValidationSchema(): Joi.ObjectSchema {
        return Joi.object({
            version: Joi.string().required(),
            environment: Joi.string().valid('development', 'staging', 'production').required(),
            agents: Joi.object({
                inventory: Joi.object({
                    agentId: Joi.string().required(),
                    name: Joi.string().required(),
                    description: Joi.string().required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    tools: Joi.array().items(Joi.string()).required(),
                    thresholds: Joi.object({
                        lowStock: Joi.number().min(0).required(),
                        criticalStock: Joi.number().min(0).required(),
                        expiryWarningDays: Joi.number().min(1).required(),
                    }).required(),
                    ocrSettings: Joi.object({
                        enabled: Joi.boolean().required(),
                        confidence: Joi.number().min(0).max(1).required(),
                        languages: Joi.array().items(Joi.string()).required(),
                    }).required(),
                }).required(),
                procurement: Joi.object({
                    agentId: Joi.string().required(),
                    name: Joi.string().required(),
                    description: Joi.string().required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    tools: Joi.array().items(Joi.string()).required(),
                    platforms: Joi.array().items(Joi.string()).required(),
                    analysisSettings: Joi.object({
                        historyDays: Joi.number().min(1).required(),
                        seasonalAnalysis: Joi.boolean().required(),
                        priceTracking: Joi.boolean().required(),
                    }).required(),
                    learningSettings: Joi.object({
                        enabled: Joi.boolean().required(),
                        feedbackWeight: Joi.number().min(0).max(1).required(),
                        adaptationRate: Joi.number().min(0).max(1).required(),
                    }).required(),
                }).required(),
                finance: Joi.object({
                    agentId: Joi.string().required(),
                    name: Joi.string().required(),
                    description: Joi.string().required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    tools: Joi.array().items(Joi.string()).required(),
                    budgetSettings: Joi.object({
                        monthlyBudget: Joi.number().min(0).required(),
                        categories: Joi.object().pattern(Joi.string(), Joi.number().min(0)).required(),
                        alertThreshold: Joi.number().min(0).max(1).required(),
                    }).required(),
                    analysisSettings: Joi.object({
                        anomalyDetection: Joi.boolean().required(),
                        trendAnalysis: Joi.boolean().required(),
                        reportFrequency: Joi.string().valid('daily', 'weekly', 'monthly').required(),
                    }).required(),
                }).required(),
                notification: Joi.object({
                    agentId: Joi.string().required(),
                    name: Joi.string().required(),
                    description: Joi.string().required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    tools: Joi.array().items(Joi.string()).required(),
                    channels: Joi.array().items(Joi.string()).required(),
                    preferences: Joi.object({
                        defaultChannel: Joi.string().required(),
                        quietHours: Joi.object({
                            enabled: Joi.boolean().required(),
                            start: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
                            end: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
                            timezone: Joi.string().required(),
                        }).required(),
                        priority: Joi.object({
                            low: Joi.array().items(Joi.string()).required(),
                            normal: Joi.array().items(Joi.string()).required(),
                            high: Joi.array().items(Joi.string()).required(),
                            urgent: Joi.array().items(Joi.string()).required(),
                        }).required(),
                    }).required(),
                    templates: Joi.object().pattern(Joi.string(), Joi.string()).required(),
                }).required(),
            }).required(),
            tools: Joi.object({
                database: Joi.object({
                    name: Joi.string().required(),
                    category: Joi.string().valid('database').required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    retryPolicy: Joi.object({
                        maxRetries: Joi.number().min(0).required(),
                        backoffStrategy: Joi.string().valid('exponential', 'linear', 'fixed').required(),
                        baseDelay: Joi.number().min(0).required(),
                        maxDelay: Joi.number().min(0).required(),
                    }).required(),
                    timeout: Joi.number().min(0).required(),
                    connection: Joi.object({
                        host: Joi.string().required(),
                        port: Joi.number().port().required(),
                        database: Joi.string().required(),
                        user: Joi.string().required(),
                        password: Joi.string().required(),
                        ssl: Joi.boolean().required(),
                        connectionLimit: Joi.number().min(1).required(),
                    }).required(),
                    querySettings: Joi.object({
                        timeout: Joi.number().min(0).required(),
                        maxRows: Joi.number().min(1).required(),
                        enableTransactions: Joi.boolean().required(),
                    }).required(),
                }).required(),
                fileStorage: Joi.object({
                    name: Joi.string().required(),
                    category: Joi.string().valid('file-storage').required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    retryPolicy: Joi.object({
                        maxRetries: Joi.number().min(0).required(),
                        backoffStrategy: Joi.string().valid('exponential', 'linear', 'fixed').required(),
                        baseDelay: Joi.number().min(0).required(),
                        maxDelay: Joi.number().min(0).required(),
                    }).required(),
                    timeout: Joi.number().min(0).required(),
                    storage: Joi.object({
                        type: Joi.string().valid('local', 'cloud').required(),
                        basePath: Joi.string().required(),
                        maxFileSize: Joi.number().min(0).required(),
                        allowedTypes: Joi.array().items(Joi.string()).required(),
                    }).required(),
                    processing: Joi.object({
                        enableOCR: Joi.boolean().required(),
                        enableImageProcessing: Joi.boolean().required(),
                        enableExcelParsing: Joi.boolean().required(),
                    }).required(),
                }).required(),
                notification: Joi.object({
                    name: Joi.string().required(),
                    category: Joi.string().valid('notification').required(),
                    enabled: Joi.boolean().required(),
                    parameters: Joi.object().required(),
                    retryPolicy: Joi.object({
                        maxRetries: Joi.number().min(0).required(),
                        backoffStrategy: Joi.string().valid('exponential', 'linear', 'fixed').required(),
                        baseDelay: Joi.number().min(0).required(),
                        maxDelay: Joi.number().min(0).required(),
                    }).required(),
                    timeout: Joi.number().min(0).required(),
                    channels: Joi.object({
                        teams: Joi.object({
                            enabled: Joi.boolean().required(),
                            webhookUrl: Joi.string().uri().required(),
                            retryCount: Joi.number().min(0).required(),
                        }).required(),
                        dingtalk: Joi.object({
                            enabled: Joi.boolean().required(),
                            accessToken: Joi.string().required(),
                            secret: Joi.string().required(),
                        }).required(),
                        wechatWork: Joi.object({
                            enabled: Joi.boolean().required(),
                            corpId: Joi.string().required(),
                            agentId: Joi.string().required(),
                            secret: Joi.string().required(),
                        }).required(),
                        email: Joi.object({
                            enabled: Joi.boolean().required(),
                            smtp: Joi.object({
                                host: Joi.string().required(),
                                port: Joi.number().port().required(),
                                secure: Joi.boolean().required(),
                                auth: Joi.object({
                                    user: Joi.string().required(),
                                    pass: Joi.string().required(),
                                }).required(),
                            }).required(),
                        }).required(),
                    }).required(),
                }).required(),
            }).required(),
            system: Joi.object({
                logging: Joi.object({
                    level: Joi.string().valid('debug', 'info', 'warn', 'error').required(),
                    enableConsole: Joi.boolean().required(),
                    enableFile: Joi.boolean().required(),
                    filePath: Joi.string().required(),
                }).required(),
                performance: Joi.object({
                    enableMetrics: Joi.boolean().required(),
                    metricsInterval: Joi.number().min(1000).required(),
                    enableProfiling: Joi.boolean().required(),
                }).required(),
                security: Joi.object({
                    enableAuth: Joi.boolean().required(),
                    tokenExpiry: Joi.number().min(300).required(),
                    enableRateLimit: Joi.boolean().required(),
                    rateLimitWindow: Joi.number().min(1000).required(),
                    rateLimitMax: Joi.number().min(1).required(),
                }).required(),
            }).required(),
            lastUpdated: Joi.string().isoDate().required(),
            updatedBy: Joi.string().required(),
        });
    }

    /**
     * Load configuration from file or create default
     */
    private loadConfiguration(): SystemConfiguration {
        try {
            if (existsSync(this.configPath)) {
                const configData = readFileSync(this.configPath, 'utf-8');
                const config = JSON.parse(configData);

                // Validate configuration
                const { error, value } = this.validationSchema.validate(config);
                if (error) {
                    this.logger.warn('Configuration validation failed, using defaults', {
                        error: error.message,
                    });
                    return this.createDefaultConfiguration();
                }

                this.logger.info('Configuration loaded successfully', {
                    version: value.version,
                    environment: value.environment,
                });

                return value;
            } else {
                this.logger.info('Configuration file not found, creating default configuration');
                const defaultConfig = this.createDefaultConfiguration();
                this.saveConfiguration(defaultConfig);
                return defaultConfig;
            }
        } catch (error) {
            this.logger.error('Failed to load configuration, using defaults', {
                error: error instanceof Error ? error.message : String(error),
            });
            return this.createDefaultConfiguration();
        }
    }

    /**
     * Create default system configuration
     */
    private createDefaultConfiguration(): SystemConfiguration {
        return {
            version: '1.0.0',
            environment: (process.env.NODE_ENV as any) || 'development',
            agents: {
                inventory: {
                    agentId: 'inventory-agent',
                    name: '库存智能体',
                    description: '管理库存、处理图片识别和库存监控',
                    enabled: true,
                    parameters: {
                        enableOCR: true,
                        enableImageProcessing: true,
                        enableThresholdMonitoring: true,
                    },
                    tools: ['database', 'file-storage', 'notification'],
                    thresholds: {
                        lowStock: 5,
                        criticalStock: 2,
                        expiryWarningDays: 7,
                    },
                    ocrSettings: {
                        enabled: true,
                        confidence: 0.7,
                        languages: ['chi_sim', 'eng'],
                    },
                },
                procurement: {
                    agentId: 'procurement-agent',
                    name: '采购智能体',
                    description: '管理采购、订单导入和采购建议',
                    enabled: true,
                    parameters: {
                        enableOrderImport: true,
                        enablePurchaseRecommendations: true,
                        enableLearning: true,
                    },
                    tools: ['database', 'file-storage', 'notification'],
                    platforms: ['淘宝', '1688', '京东', '拼多多', '抖音商城', '中免日上'],
                    analysisSettings: {
                        historyDays: 90,
                        seasonalAnalysis: true,
                        priceTracking: true,
                    },
                    learningSettings: {
                        enabled: true,
                        feedbackWeight: 0.3,
                        adaptationRate: 0.1,
                    },
                },
                finance: {
                    agentId: 'finance-agent',
                    name: '财务智能体',
                    description: '财务分析、支出监控和报告生成',
                    enabled: true,
                    parameters: {
                        enableBudgetMonitoring: true,
                        enableAnomalyDetection: true,
                        enableReporting: true,
                    },
                    tools: ['database', 'notification'],
                    budgetSettings: {
                        monthlyBudget: 5000,
                        categories: {
                            '食品': 1500,
                            '日用品': 800,
                            '服装': 600,
                            '其他': 1100,
                        },
                        alertThreshold: 0.8,
                    },
                    analysisSettings: {
                        anomalyDetection: true,
                        trendAnalysis: true,
                        reportFrequency: 'monthly',
                    },
                },
                notification: {
                    agentId: 'notification-agent',
                    name: '通知智能体',
                    description: '智能通知管理和多渠道消息发送',
                    enabled: true,
                    parameters: {
                        enableSmartTiming: true,
                        enablePersonalization: true,
                        enableAnalytics: true,
                    },
                    tools: ['notification'],
                    channels: ['teams', 'dingtalk', 'wechatWork', 'email'],
                    preferences: {
                        defaultChannel: 'teams',
                        quietHours: {
                            enabled: true,
                            start: '22:00',
                            end: '08:00',
                            timezone: 'Asia/Shanghai',
                        },
                        priority: {
                            low: ['email'],
                            normal: ['teams', 'email'],
                            high: ['teams', 'dingtalk', 'email'],
                            urgent: ['teams', 'dingtalk', 'wechatWork', 'email'],
                        },
                    },
                    templates: {
                        inventory_alert: '库存提醒：{item_name} 库存不足，当前数量：{quantity}',
                        purchase_recommendation: '采购建议：建议购买 {item_name}，预计需求：{quantity}',
                        financial_report: '财务报告：{period} 总支出：{amount}，预算执行率：{percentage}%',
                        system_update: '系统更新：{message}',
                    },
                },
            },
            tools: {
                database: {
                    name: 'database-tool',
                    category: 'database',
                    enabled: true,
                    parameters: {},
                    retryPolicy: {
                        maxRetries: 3,
                        backoffStrategy: 'exponential',
                        baseDelay: 1000,
                        maxDelay: 10000,
                    },
                    timeout: 30000,
                    connection: {
                        host: process.env.DB_HOST || 'localhost',
                        port: parseInt(process.env.DB_PORT || '3306'),
                        database: process.env.DB_NAME || 'shopping_assistant',
                        user: process.env.DB_USER || 'root',
                        password: process.env.DB_PASSWORD || '',
                        ssl: process.env.DB_SSL === 'true',
                        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
                    },
                    querySettings: {
                        timeout: 15000,
                        maxRows: 1000,
                        enableTransactions: true,
                    },
                },
                fileStorage: {
                    name: 'file-storage-tool',
                    category: 'file-storage',
                    enabled: true,
                    parameters: {},
                    retryPolicy: {
                        maxRetries: 3,
                        backoffStrategy: 'exponential',
                        baseDelay: 1000,
                        maxDelay: 10000,
                    },
                    timeout: 60000,
                    storage: {
                        type: 'local',
                        basePath: process.env.UPLOAD_DIR || './uploads',
                        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
                        allowedTypes: [
                            'image/jpeg',
                            'image/png',
                            'image/gif',
                            'application/vnd.ms-excel',
                            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        ],
                    },
                    processing: {
                        enableOCR: true,
                        enableImageProcessing: true,
                        enableExcelParsing: true,
                    },
                },
                notification: {
                    name: 'notification-tool',
                    category: 'notification',
                    enabled: true,
                    parameters: {},
                    retryPolicy: {
                        maxRetries: 3,
                        backoffStrategy: 'exponential',
                        baseDelay: 1000,
                        maxDelay: 10000,
                    },
                    timeout: 15000,
                    channels: {
                        teams: {
                            enabled: !!process.env.TEAMS_WEBHOOK_URL,
                            webhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
                            retryCount: 3,
                        },
                        dingtalk: {
                            enabled: !!process.env.DINGTALK_ACCESS_TOKEN,
                            accessToken: process.env.DINGTALK_ACCESS_TOKEN || '',
                            secret: process.env.DINGTALK_SECRET || '',
                        },
                        wechatWork: {
                            enabled: !!process.env.WECHAT_WORK_CORP_ID,
                            corpId: process.env.WECHAT_WORK_CORP_ID || '',
                            agentId: process.env.WECHAT_WORK_AGENT_ID || '',
                            secret: process.env.WECHAT_WORK_SECRET || '',
                        },
                        email: {
                            enabled: !!process.env.SMTP_HOST,
                            smtp: {
                                host: process.env.SMTP_HOST || '',
                                port: parseInt(process.env.SMTP_PORT || '587'),
                                secure: process.env.SMTP_SECURE === 'true',
                                auth: {
                                    user: process.env.SMTP_USER || '',
                                    pass: process.env.SMTP_PASS || '',
                                },
                            },
                        },
                    },
                },
            },
            system: {
                logging: {
                    level: (process.env.LOG_LEVEL as any) || 'info',
                    enableConsole: process.env.LOG_CONSOLE !== 'false',
                    enableFile: process.env.LOG_FILE === 'true',
                    filePath: process.env.LOG_FILE_PATH || './logs/system.log',
                },
                performance: {
                    enableMetrics: process.env.ENABLE_METRICS === 'true',
                    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000'),
                    enableProfiling: process.env.ENABLE_PROFILING === 'true',
                },
                security: {
                    enableAuth: process.env.ENABLE_AUTH === 'true',
                    tokenExpiry: parseInt(process.env.TOKEN_EXPIRY || '3600'),
                    enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
                    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
                    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
                },
            },
            lastUpdated: new Date().toISOString(),
            updatedBy: 'system',
        };
    }

    /**
     * Save configuration to file
     */
    private saveConfiguration(config: SystemConfiguration): void {
        try {
            const configDir = this.configPath.substring(0, this.configPath.lastIndexOf('/'));
            if (!existsSync(configDir)) {
                require('fs').mkdirSync(configDir, { recursive: true });
            }

            writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
            this.logger.info('Configuration saved successfully', {
                path: this.configPath,
                version: config.version,
            });
        } catch (error) {
            this.logger.error('Failed to save configuration', {
                error: error instanceof Error ? error.message : String(error),
                path: this.configPath,
            });
            throw error;
        }
    }

    /**
     * Get current configuration
     */
    getConfiguration(): SystemConfiguration {
        return JSON.parse(JSON.stringify(this.config));
    }

    /**
     * Get agent configuration
     */
    getAgentConfig<T extends AgentConfig>(agentType: keyof SystemConfiguration['agents']): T {
        return JSON.parse(JSON.stringify(this.config.agents[agentType])) as T;
    }

    /**
     * Get tool configuration
     */
    getToolConfig<T extends ToolConfig>(toolType: keyof SystemConfiguration['tools']): T {
        return JSON.parse(JSON.stringify(this.config.tools[toolType])) as T;
    }

    /**
     * Update agent configuration
     */
    async updateAgentConfig(
        agentType: keyof SystemConfiguration['agents'],
        updates: Partial<AgentConfig>,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            // Create updated configuration
            const updatedConfig = {
                ...this.config,
                agents: {
                    ...this.config.agents,
                    [agentType]: {
                        ...this.config.agents[agentType],
                        ...updates,
                    },
                },
                lastUpdated: new Date().toISOString(),
                updatedBy,
            };

            // Validate updated configuration
            const { error } = this.validationSchema.validate(updatedConfig);
            if (error) {
                throw new Error(`Configuration validation failed: ${error.message}`);
            }

            // Save and update
            this.saveConfiguration(updatedConfig);
            this.config = updatedConfig;

            // Notify watchers
            this.notifyWatchers();

            this.logger.info('Agent configuration updated', {
                agentType,
                updatedBy,
                updates: Object.keys(updates),
            });
        } catch (error) {
            this.logger.error('Failed to update agent configuration', {
                agentType,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Update tool configuration
     */
    async updateToolConfig(
        toolType: keyof SystemConfiguration['tools'],
        updates: Partial<ToolConfig>,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            // Create updated configuration
            const updatedConfig = {
                ...this.config,
                tools: {
                    ...this.config.tools,
                    [toolType]: {
                        ...this.config.tools[toolType],
                        ...updates,
                    },
                },
                lastUpdated: new Date().toISOString(),
                updatedBy,
            };

            // Validate updated configuration
            const { error } = this.validationSchema.validate(updatedConfig);
            if (error) {
                throw new Error(`Configuration validation failed: ${error.message}`);
            }

            // Save and update
            this.saveConfiguration(updatedConfig);
            this.config = updatedConfig;

            // Notify watchers
            this.notifyWatchers();

            this.logger.info('Tool configuration updated', {
                toolType,
                updatedBy,
                updates: Object.keys(updates),
            });
        } catch (error) {
            this.logger.error('Failed to update tool configuration', {
                toolType,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Update system configuration
     */
    async updateSystemConfig(
        updates: Partial<SystemConfiguration['system']>,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            // Create updated configuration
            const updatedConfig = {
                ...this.config,
                system: {
                    ...this.config.system,
                    ...updates,
                },
                lastUpdated: new Date().toISOString(),
                updatedBy,
            };

            // Validate updated configuration
            const { error } = this.validationSchema.validate(updatedConfig);
            if (error) {
                throw new Error(`Configuration validation failed: ${error.message}`);
            }

            // Save and update
            this.saveConfiguration(updatedConfig);
            this.config = updatedConfig;

            // Notify watchers
            this.notifyWatchers();

            this.logger.info('System configuration updated', {
                updatedBy,
                updates: Object.keys(updates),
            });
        } catch (error) {
            this.logger.error('Failed to update system configuration', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Reload configuration from file
     */
    async reloadConfiguration(): Promise<void> {
        try {
            const newConfig = this.loadConfiguration();
            this.config = newConfig;
            this.notifyWatchers();

            this.logger.info('Configuration reloaded successfully', {
                version: newConfig.version,
                environment: newConfig.environment,
            });
        } catch (error) {
            this.logger.error('Failed to reload configuration', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Validate configuration
     */
    validateConfiguration(config?: SystemConfiguration): { valid: boolean; errors?: string[] } {
        const configToValidate = config || this.config;
        const { error } = this.validationSchema.validate(configToValidate);

        if (error) {
            return {
                valid: false,
                errors: error.details.map(detail => detail.message),
            };
        }

        return { valid: true };
    }

    /**
     * Register configuration change watcher
     */
    onConfigurationChange(watcherId: string, callback: (config: SystemConfiguration) => void): void {
        this.watchers.set(watcherId, callback);
        this.logger.debug('Configuration watcher registered', { watcherId });
    }

    /**
     * Unregister configuration change watcher
     */
    removeConfigurationWatcher(watcherId: string): void {
        this.watchers.delete(watcherId);
        this.logger.debug('Configuration watcher removed', { watcherId });
    }

    /**
     * Notify all watchers of configuration changes
     */
    private notifyWatchers(): void {
        for (const [watcherId, callback] of this.watchers) {
            try {
                callback(this.getConfiguration());
            } catch (error) {
                this.logger.error('Error in configuration watcher', {
                    watcherId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * Get configuration summary
     */
    getConfigurationSummary(): {
        version: string;
        environment: string;
        enabledAgents: string[];
        enabledTools: string[];
        lastUpdated: string;
        updatedBy: string;
    } {
        const enabledAgents = Object.entries(this.config.agents)
            .filter(([, config]) => config.enabled)
            .map(([name]) => name);

        const enabledTools = Object.entries(this.config.tools)
            .filter(([, config]) => config.enabled)
            .map(([name]) => name);

        return {
            version: this.config.version,
            environment: this.config.environment,
            enabledAgents,
            enabledTools,
            lastUpdated: this.config.lastUpdated,
            updatedBy: this.config.updatedBy,
        };
    }

    /**
     * Export configuration to JSON string
     */
    exportConfiguration(): string {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from JSON string
     */
    async importConfiguration(configJson: string, updatedBy: string = 'import'): Promise<void> {
        try {
            const importedConfig = JSON.parse(configJson);

            // Validate imported configuration
            const { error } = this.validationSchema.validate(importedConfig);
            if (error) {
                throw new Error(`Invalid configuration: ${error.message}`);
            }

            // Update metadata
            importedConfig.lastUpdated = new Date().toISOString();
            importedConfig.updatedBy = updatedBy;

            // Save and update
            this.saveConfiguration(importedConfig);
            this.config = importedConfig;

            // Notify watchers
            this.notifyWatchers();

            this.logger.info('Configuration imported successfully', {
                version: importedConfig.version,
                updatedBy,
            });
        } catch (error) {
            this.logger.error('Failed to import configuration', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Reset configuration to defaults
     */
    async resetToDefaults(updatedBy: string = 'reset'): Promise<void> {
        try {
            const defaultConfig = this.createDefaultConfiguration();
            defaultConfig.updatedBy = updatedBy;

            this.saveConfiguration(defaultConfig);
            this.config = defaultConfig;

            // Notify watchers
            this.notifyWatchers();

            this.logger.info('Configuration reset to defaults', { updatedBy });
        } catch (error) {
            this.logger.error('Failed to reset configuration', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Shutdown configuration manager
     */
    async shutdown(): Promise<void> {
        this.watchers.clear();
        this.logger.info('SystemConfigManager shutdown completed');
    }
}
