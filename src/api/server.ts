/**
 * Express.js server implementation for Shopping Assistant Agents
 * Provides REST API endpoints for agent interaction with authentication and monitoring
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger';
import { ConversationManager } from '../workflows/ConversationManager';
import { IntelligentAgentRouter } from '../workflows/IntelligentAgentRouter';
import { AgentStateManager } from '../state/AgentStateManager';
import { WorkflowFactory } from '../workflows/WorkflowFactory';
import { SystemMonitor } from '../monitoring/SystemMonitor';
import { SystemConfigManager } from '../config/SystemConfig';
import { HealthController } from './HealthController';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// API interfaces
export interface ApiRequest extends Request {
    userId?: string;
    conversationId?: string;
    requestId?: string;
}

export interface ApiResponse {
    success: boolean;
    data?: any;
    error?: string;
    requestId: string;
    timestamp: string;
    processingTime?: number;
}

export interface ChatRequest {
    message: string;
    conversationId?: string;
    userId?: string;
    language?: 'zh-CN' | 'en-US';
}

export interface ChatResponse {
    response: string;
    conversationId: string;
    targetAgent: string; // LangGraph自动路由的目标智能体 (inventory/procurement/finance/notification)
    confidence: number;
    requiresClarification: boolean;
    clarificationQuestion?: string;
    suggestedActions?: string[];
    metadata: {
        processingTime: number;
        detectedLanguage?: string;
        responseLanguage?: string;
        routedBy?: string; // 路由系统标识，固定为'LangGraph'
    };
}

export interface FileUploadRequest {
    description?: string;
    conversationId?: string;
    userId?: string;
    platform?: string;
}

export interface ServerConfig {
    port: number;
    host: string;
    enableAuth: boolean;
    enableCors: boolean;
    maxFileSize: number;
    uploadDir: string;
    enableRateLimit: boolean;
    rateLimit: {
        windowMs: number;
        max: number;
    };
    enableLogging: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Express.js server for Shopping Assistant Agents API
 */
export class ShoppingAssistantServer {
    private app: Express;
    private logger: Logger;
    private config: ServerConfig;
    private conversationManager?: ConversationManager;
    private agentRouter?: IntelligentAgentRouter;
    private stateManager?: AgentStateManager;
    private systemMonitor?: SystemMonitor;
    private configManager?: SystemConfigManager;
    private healthController?: HealthController;
    private server?: any;
    private upload!: multer.Multer;

    constructor(config: Partial<ServerConfig> = {}) {
        this.config = {
            port: parseInt(process.env.PORT || '3000'),
            host: process.env.HOST || '0.0.0.0',
            enableAuth: process.env.ENABLE_AUTH === 'true',
            enableCors: process.env.ENABLE_CORS !== 'false',
            maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
            uploadDir: process.env.UPLOAD_DIR || './uploads',
            enableRateLimit: process.env.ENABLE_RATE_LIMIT === 'true',
            rateLimit: {
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
                max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests per window
            },
            enableLogging: process.env.ENABLE_LOGGING !== 'false',
            logLevel: (process.env.LOG_LEVEL as any) || 'info',
            ...config,
        };

        this.logger = new Logger({
            component: 'ShoppingAssistantServer',
            level: this.config.logLevel,
        });

        this.app = express();
        this.setupUploadHandler();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Initialize the server with agent components
     */
    async initialize(): Promise<void> {
        try {
            this.logger.info('Initializing Shopping Assistant Server...');

            // Create upload directory if it doesn't exist
            if (!fs.existsSync(this.config.uploadDir)) {
                fs.mkdirSync(this.config.uploadDir, { recursive: true });
            }

            // Initialize configuration manager
            this.configManager = new SystemConfigManager();

            // Initialize system monitor
            this.systemMonitor = new SystemMonitor({
                metricsInterval: 60000, // 1 minute
                healthCheckInterval: 30000, // 30 seconds
                alertCheckInterval: 10000, // 10 seconds
                enableGCMetrics: true,
                enableEventLoopMetrics: true,
            });

            // Initialize health controller
            this.healthController = new HealthController(
                this.systemMonitor,
                this.configManager,
                {
                    enableDetailedHealth: true,
                    enableMetricsEndpoint: true,
                    enableAlertsEndpoint: true,
                    enableConfigEndpoint: process.env.NODE_ENV === 'development',
                    authRequired: this.config.enableAuth,
                }
            );

            // Initialize state manager first
            this.stateManager = new (await import('../state/AgentStateManager')).AgentStateManager();

            // Initialize agent components using WorkflowFactory
            const workflowFactory = new WorkflowFactory();
            const workflowComponents = await workflowFactory.createCompleteWorkflow(
                this.stateManager,
                {
                    enableDatabaseTools: true,
                    enableFileStorageTools: true,
                    enableNotificationTools: true,
                }
            );

            this.agentRouter = workflowComponents.router;

            // Create conversation manager
            this.conversationManager = new ConversationManager(
                this.stateManager,
                this.agentRouter,
                {
                    enableLLMIntentRecognition: true,
                    enableEntityExtraction: true,
                    enableContextLearning: true,
                    enableClarificationQuestions: true,
                    enableMultilingualSupport: true,
                    defaultLanguage: 'zh-CN',
                }
            );

            // Start system monitoring
            this.systemMonitor.start();

            // Setup monitoring event handlers
            this.setupMonitoringEventHandlers();

            this.logger.info('Shopping Assistant Server initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize server', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Setup file upload handler
     */
    private setupUploadHandler(): void {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, this.config.uploadDir);
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
            }
        });

        this.upload = multer({
            storage,
            limits: {
                fileSize: this.config.maxFileSize,
            },
            fileFilter: (req, file, cb) => {
                // Allow images and Excel files
                const allowedTypes = [
                    'image/jpeg',
                    'image/png',
                    'image/gif',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                ];

                if (allowedTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Only images and Excel files are allowed.'));
                }
            }
        });
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
        // Request ID middleware
        this.app.use((req: ApiRequest, res, next) => {
            req.requestId = uuidv4();
            res.setHeader('X-Request-ID', req.requestId);
            next();
        });

        // Logging middleware
        if (this.config.enableLogging) {
            this.app.use((req: ApiRequest, res, next) => {
                const start = Date.now();

                res.on('finish', () => {
                    const duration = Date.now() - start;
                    this.logger.info('HTTP Request', {
                        requestId: req.requestId,
                        method: req.method,
                        url: req.url,
                        statusCode: res.statusCode,
                        duration,
                        userAgent: req.get('User-Agent'),
                        ip: req.ip,
                    });
                });

                next();
            });
        }

        // CORS middleware
        if (this.config.enableCors) {
            this.app.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

                if (req.method === 'OPTIONS') {
                    res.sendStatus(200);
                } else {
                    next();
                }
            });
        }

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Authentication middleware (if enabled)
        if (this.config.enableAuth) {
            this.app.use('/api', this.authMiddleware.bind(this));
        }

        // Rate limiting middleware (if enabled)
        if (this.config.enableRateLimit) {
            // Note: In production, you'd want to use a proper rate limiting library like express-rate-limit
            this.app.use(this.rateLimitMiddleware.bind(this));
        }
    }

    /**
     * Authentication middleware
     */
    private authMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            this.sendErrorResponse(res, 'Authentication required', 401, req.requestId!);
            return;
        }

        const token = authHeader.substring(7);

        // Simple token validation (in production, use proper JWT validation)
        if (token !== process.env.API_TOKEN) {
            this.sendErrorResponse(res, 'Invalid authentication token', 401, req.requestId!);
            return;
        }

        // Extract user ID from token (simplified)
        req.userId = 'authenticated-user';
        next();
    }

    /**
     * Rate limiting middleware
     */
    private rateLimitMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
        // Simple in-memory rate limiting (in production, use Redis or similar)
        const clientId = req.ip || 'unknown';
        const now = Date.now();

        // This is a simplified implementation - use express-rate-limit in production
        next();
    }

    /**
     * Setup monitoring event handlers
     */
    private setupMonitoringEventHandlers(): void {
        if (!this.systemMonitor) return;

        this.systemMonitor.on('alert', (alert) => {
            this.logger.warn('System alert triggered', {
                alertId: alert.id,
                severity: alert.severity,
                message: alert.message,
                metric: alert.metric,
                value: alert.value,
                threshold: alert.threshold,
            });
        });

        this.systemMonitor.on('alertResolved', (alert) => {
            this.logger.info('System alert resolved', {
                alertId: alert.id,
                ruleName: alert.ruleName,
                duration: alert.resolvedAt ?
                    new Date(alert.resolvedAt).getTime() - new Date(alert.timestamp).getTime() : 0,
            });
        });

        this.systemMonitor.on('healthCheck', (health) => {
            if (health.overall !== 'healthy') {
                this.logger.warn('System health degraded', {
                    overall: health.overall,
                    unhealthyComponents: health.components
                        .filter((c: any) => c.status !== 'healthy')
                        .map((c: any) => ({ component: c.component, status: c.status, message: c.message })),
                });
            }
        });
    }

    /**
     * Setup API routes
     */
    private setupRoutes(): void {
        // Health check endpoints
        this.app.get('/health', this.healthController?.basicHealth.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/api/health', this.healthController?.basicHealth.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/health/detailed', this.healthController?.detailedHealth.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/health/ready', this.healthController?.readinessCheck.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/health/live', this.healthController?.livenessCheck.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/health/metrics', this.healthController?.systemMetrics.bind(this.healthController) || this.handleGetMetrics.bind(this));
        this.app.get('/health/alerts', this.healthController?.systemAlerts.bind(this.healthController) || this.handleGetMetrics.bind(this));
        this.app.get('/health/config', this.healthController?.systemConfig.bind(this.healthController) || this.handleGetConfig.bind(this));
        this.app.get('/health/component/:component', this.healthController?.componentHealth.bind(this.healthController) || this.handleHealthCheck.bind(this));
        this.app.get('/health/performance', this.healthController?.performanceMetrics.bind(this.healthController) || this.handleGetMetrics.bind(this));

        // System status endpoint
        this.app.get('/api/status', this.handleSystemStatus.bind(this));

        // Chat endpoints - 统一的对话接口，由LangGraph内部路由到具体智能体
        this.app.post('/api/chat', this.handleChatMessage.bind(this));
        this.app.get('/api/chat/:conversationId', this.handleGetConversation.bind(this));
        this.app.delete('/api/chat/:conversationId', this.handleDeleteConversation.bind(this));

        // File upload endpoints - 用户上传文件，通过对话系统处理
        this.app.post('/api/upload/image', this.upload.single('image'), this.handleImageUpload.bind(this));
        this.app.post('/api/upload/excel', this.upload.single('excel'), this.handleExcelUpload.bind(this));

        // Configuration endpoints
        this.app.get('/api/config', this.handleGetConfig.bind(this));
        this.app.put('/api/config', this.handleUpdateConfig.bind(this));

        // Metrics endpoint
        this.app.get('/api/metrics', this.handleGetMetrics.bind(this));

        // 404 handler for API routes
        this.app.use('/api', (req: ApiRequest, res, next) => {
            this.sendErrorResponse(res, 'API endpoint not found', 404, req.requestId!);
        });
    }

    /**
     * Setup error handling
     */
    private setupErrorHandling(): void {
        // Global error handler
        this.app.use((error: Error, req: ApiRequest, res: Response, next: NextFunction) => {
            this.logger.error('Unhandled error in request', {
                requestId: req.requestId,
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
            });

            if (res.headersSent) {
                return next(error);
            }

            this.sendErrorResponse(res, 'Internal server error', 500, req.requestId!);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception', {
                error: error.message,
                stack: error.stack,
            });

            // Graceful shutdown
            this.shutdown().then(() => {
                process.exit(1);
            });
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled promise rejection', {
                reason: String(reason),
                promise: String(promise),
            });
        });
    }

    /**
     * Health check endpoint handler
     */
    private async handleHealthCheck(req: ApiRequest, res: Response): Promise<void> {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
        };

        this.sendSuccessResponse(res, health, req.requestId!);
    }

    /**
     * System status endpoint handler
     */
    private async handleSystemStatus(req: ApiRequest, res: Response): Promise<void> {
        try {
            const status = {
                server: {
                    status: 'running',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    pid: process.pid,
                },
                agents: {
                    conversationManager: !!this.conversationManager,
                    agentRouter: !!this.agentRouter,
                    stateManager: !!this.stateManager,
                },
                stats: this.conversationManager ? this.conversationManager.getConversationStats() : null,
                routingStats: this.agentRouter ? this.agentRouter.getRoutingStats() : null,
            };

            this.sendSuccessResponse(res, status, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to get system status', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to get system status', 500, req.requestId!);
        }
    }

    /**
     * 统一对话接口处理器
     * 所有用户请求都通过此接口，由LangGraph自动路由到合适的智能体
     * 支持库存管理、采购建议、财务分析、通知等所有功能
     */
    private async handleChatMessage(req: ApiRequest, res: Response): Promise<void> {
        try {
            const { message, conversationId, userId, language }: ChatRequest = req.body;

            if (!message || typeof message !== 'string') {
                this.sendErrorResponse(res, 'Message is required and must be a string', 400, req.requestId!);
                return;
            }

            if (!this.conversationManager) {
                this.sendErrorResponse(res, 'Conversation manager not initialized', 500, req.requestId!);
                return;
            }

            const finalUserId = userId || req.userId || 'anonymous';
            const finalConversationId = conversationId || uuidv4();

            const startTime = Date.now();
            const result = await this.conversationManager.processMessage(
                message,
                finalConversationId,
                finalUserId
            );

            const response: ChatResponse = {
                response: result.routingResult.reasoning,
                conversationId: result.conversationId,
                targetAgent: result.routingResult.targetAgent, // LangGraph自动路由的目标智能体
                confidence: result.routingResult.confidence,
                requiresClarification: result.metadata.requiresClarification,
                clarificationQuestion: result.clarificationRequest?.question,
                suggestedActions: result.routingResult.suggestedActions,
                metadata: {
                    processingTime: Date.now() - startTime,
                    detectedLanguage: result.metadata.detectedLanguage,
                    responseLanguage: result.metadata.responseLanguage,
                    routedBy: 'LangGraph', // 明确标识是由LangGraph路由的
                },
            };

            this.sendSuccessResponse(res, response, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to process chat message', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to process message', 500, req.requestId!);
        }
    }

    /**
     * Get conversation endpoint handler
     */
    private async handleGetConversation(req: ApiRequest, res: Response): Promise<void> {
        try {
            const { conversationId } = req.params;

            if (!this.conversationManager) {
                this.sendErrorResponse(res, 'Conversation manager not initialized', 500, req.requestId!);
                return;
            }

            // Get conversation context (this would need to be implemented in ConversationManager)
            const stats = this.conversationManager.getConversationStats();
            const clarification = this.conversationManager.getPendingClarification(conversationId);

            const conversation = {
                conversationId,
                hasPendingClarification: !!clarification,
                clarificationRequest: clarification,
                stats,
            };

            this.sendSuccessResponse(res, conversation, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to get conversation', {
                requestId: req.requestId,
                conversationId: req.params.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to get conversation', 500, req.requestId!);
        }
    }

    /**
     * Delete conversation endpoint handler
     */
    private async handleDeleteConversation(req: ApiRequest, res: Response): Promise<void> {
        try {
            const { conversationId } = req.params;

            if (!this.conversationManager) {
                this.sendErrorResponse(res, 'Conversation manager not initialized', 500, req.requestId!);
                return;
            }

            await this.conversationManager.clearConversationContext(conversationId);

            this.sendSuccessResponse(res, { deleted: true }, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to delete conversation', {
                requestId: req.requestId,
                conversationId: req.params.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to delete conversation', 500, req.requestId!);
        }
    }

    /**
     * Image upload endpoint handler
     * 上传图片并自动通过对话系统处理（库存识别等）
     */
    private async handleImageUpload(req: ApiRequest, res: Response): Promise<void> {
        try {
            if (!req.file) {
                this.sendErrorResponse(res, 'No image file provided', 400, req.requestId!);
                return;
            }

            if (!this.conversationManager) {
                this.sendErrorResponse(res, 'Conversation manager not initialized', 500, req.requestId!);
                return;
            }

            const { description, conversationId, userId }: FileUploadRequest = req.body;
            const finalUserId = userId || req.userId || 'anonymous';
            const finalConversationId = conversationId || uuidv4();

            // 构建包含图片信息的消息，让对话系统自动路由到合适的智能体
            const imageMessage = description
                ? `我上传了一张图片：${description}。图片文件：${req.file.filename}`
                : `我上传了一张图片，请帮我识别和处理。图片文件：${req.file.filename}`;

            // 通过对话系统处理图片，LangGraph会自动路由到库存智能体进行OCR处理
            const conversationResult = await this.conversationManager.processMessage(
                imageMessage,
                finalConversationId,
                finalUserId
            );

            const uploadResult = {
                fileId: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype,
                uploadPath: req.file.path,
                description,
                conversationId: finalConversationId,
                userId: finalUserId,
                uploadedAt: new Date().toISOString(),
                // 包含对话系统的处理结果
                processingResult: {
                    targetAgent: conversationResult.routingResult.targetAgent,
                    confidence: conversationResult.routingResult.confidence,
                    reasoning: conversationResult.routingResult.reasoning,
                    requiresClarification: conversationResult.metadata.requiresClarification,
                    clarificationQuestion: conversationResult.clarificationRequest?.question,
                },
            };

            this.sendSuccessResponse(res, uploadResult, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to handle image upload', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to upload and process image', 500, req.requestId!);
        }
    }

    /**
     * Excel upload endpoint handler
     * 上传Excel文件并自动通过对话系统处理（订单导入等）
     */
    private async handleExcelUpload(req: ApiRequest, res: Response): Promise<void> {
        try {
            if (!req.file) {
                this.sendErrorResponse(res, 'No Excel file provided', 400, req.requestId!);
                return;
            }

            if (!this.conversationManager) {
                this.sendErrorResponse(res, 'Conversation manager not initialized', 500, req.requestId!);
                return;
            }

            const { platform, conversationId, userId }: FileUploadRequest = req.body;
            const finalUserId = userId || req.userId || 'anonymous';
            const finalConversationId = conversationId || uuidv4();

            // 构建包含Excel文件信息的消息，让对话系统自动路由到采购智能体
            const excelMessage = platform
                ? `我上传了一个${platform}平台的订单Excel文件，请帮我导入和处理。文件：${req.file.filename}`
                : `我上传了一个订单Excel文件，请帮我导入和处理。文件：${req.file.filename}`;

            // 通过对话系统处理Excel文件，LangGraph会自动路由到采购智能体进行订单导入
            const conversationResult = await this.conversationManager.processMessage(
                excelMessage,
                finalConversationId,
                finalUserId
            );

            const uploadResult = {
                fileId: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype,
                uploadPath: req.file.path,
                platform,
                conversationId: finalConversationId,
                userId: finalUserId,
                uploadedAt: new Date().toISOString(),
                // 包含对话系统的处理结果
                processingResult: {
                    targetAgent: conversationResult.routingResult.targetAgent,
                    confidence: conversationResult.routingResult.confidence,
                    reasoning: conversationResult.routingResult.reasoning,
                    requiresClarification: conversationResult.metadata.requiresClarification,
                    clarificationQuestion: conversationResult.clarificationRequest?.question,
                },
            };

            this.sendSuccessResponse(res, uploadResult, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to handle Excel upload', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to upload and process Excel file', 500, req.requestId!);
        }
    }



    /**
     * Get configuration endpoint handler
     */
    private async handleGetConfig(req: ApiRequest, res: Response): Promise<void> {
        try {
            const config = {
                server: {
                    port: this.config.port,
                    host: this.config.host,
                    enableAuth: this.config.enableAuth,
                    enableCors: this.config.enableCors,
                    maxFileSize: this.config.maxFileSize,
                    enableRateLimit: this.config.enableRateLimit,
                },
                agents: {
                    supportedLanguages: this.conversationManager?.getSupportedLanguages() || [],
                },
            };

            this.sendSuccessResponse(res, config, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to get configuration', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to get configuration', 500, req.requestId!);
        }
    }

    /**
     * Update configuration endpoint handler
     */
    private async handleUpdateConfig(req: ApiRequest, res: Response): Promise<void> {
        try {
            // This is a placeholder - in production, you'd want to implement
            // proper configuration management with validation
            this.sendSuccessResponse(res, { updated: false, message: 'Configuration updates not implemented yet' }, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to update configuration', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to update configuration', 500, req.requestId!);
        }
    }

    /**
     * Get metrics endpoint handler
     */
    private async handleGetMetrics(req: ApiRequest, res: Response): Promise<void> {
        try {
            const metrics = {
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                },
                conversations: this.conversationManager?.getConversationStats() || null,
                routing: this.agentRouter?.getRoutingStats() || null,
                timestamp: new Date().toISOString(),
            };

            this.sendSuccessResponse(res, metrics, req.requestId!);
        } catch (error) {
            this.logger.error('Failed to get metrics', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
            });

            this.sendErrorResponse(res, 'Failed to get metrics', 500, req.requestId!);
        }
    }

    /**
     * Send success response
     */
    private sendSuccessResponse(res: Response, data: any, requestId: string): void {
        const response: ApiResponse = {
            success: true,
            data,
            requestId,
            timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
    }

    /**
     * Send error response
     */
    private sendErrorResponse(res: Response, error: string, statusCode: number, requestId: string): void {
        const response: ApiResponse = {
            success: false,
            error,
            requestId,
            timestamp: new Date().toISOString(),
        };

        res.status(statusCode).json(response);
    }

    /**
     * Start the server
     */
    async start(): Promise<void> {
        try {
            await this.initialize();

            this.server = this.app.listen(this.config.port, this.config.host, () => {
                this.logger.info('Shopping Assistant Server started', {
                    port: this.config.port,
                    host: this.config.host,
                    environment: process.env.NODE_ENV || 'development',
                });
            });

            // Handle server errors
            this.server.on('error', (error: Error) => {
                this.logger.error('Server error', {
                    error: error.message,
                    stack: error.stack,
                });
            });

        } catch (error) {
            this.logger.error('Failed to start server', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Stop the server
     */
    async shutdown(): Promise<void> {
        try {
            this.logger.info('Shutting down Shopping Assistant Server...');

            // Close server
            if (this.server) {
                await new Promise<void>((resolve, reject) => {
                    this.server.close((error: Error | undefined) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } else {
                this.logger.warn('Server is not running, skipping shutdown');
            }

            // Shutdown components
            if (this.systemMonitor) {
                await this.systemMonitor.shutdown();
            }

            if (this.configManager) {
                await this.configManager.shutdown();
            }

            if (this.conversationManager) {
                await this.conversationManager.shutdown();
            }

            if (this.agentRouter) {
                await this.agentRouter.shutdown();
            }

            if (this.stateManager) {
                await this.stateManager.shutdown();
            }

            this.logger.info('Shopping Assistant Server shutdown completed');
        } catch (error) {
            this.logger.error('Error during server shutdown', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Get server configuration
     */
    getConfig(): ServerConfig {
        return { ...this.config };
    }

    /**
     * Get Express app instance
     */
    getApp(): Express {
        return this.app;
    }
}
