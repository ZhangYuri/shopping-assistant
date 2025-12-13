/**
 * Procurement Agent - Handles procurement planning and order management
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

// Procurement-specific interfaces
interface Order {
    id: string;
    store_name: string;
    total_price?: number;
    delivery_cost?: number;
    pay_fee?: number;
    purchase_date?: Date;
    purchase_channel?: string;
    created_at: Date;
}

interface CreateOrder {
    id: string;
    store_name: string;
    total_price?: number;
    delivery_cost?: number;
    pay_fee?: number;
    purchase_date?: Date;
    purchase_channel?: string;
    items?: CreateOrderItem[];
}

interface OrderItem {
    id: number;
    parent_id: string;
    item_name: string;
    purchase_quantity: number;
    model?: string;
    unit_price?: number;
    category?: string;
    created_at: Date;
}

interface CreateOrderItem {
    item_name: string;
    purchase_quantity: number;
    model?: string;
    unit_price?: number;
    category?: string;
}

interface ImportResult {
    success: boolean;
    orderId?: string;
    itemsImported: number;
    duplicatesDetected: number;
    errors: string[];
    message: string;
    normalizedData?: NormalizedOrderData;
}

interface NormalizedOrderData {
    order: CreateOrder;
    platform: string;
    originalFormat: string;
    confidence: number;
}

interface PurchaseRecommendation {
    itemName: string;
    suggestedQuantity: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    reason: string;
    estimatedCost?: number;
    preferredStore?: string;
    seasonalFactor?: number;
    consumptionRate?: number;
}

interface PurchaseAnalysis {
    totalSpending: number;
    averageOrderValue: number;
    topCategories: CategoryAnalysis[];
    seasonalPatterns: SeasonalPattern[];
    recommendations: string[];
}

interface CategoryAnalysis {
    category: string;
    totalSpent: number;
    itemCount: number;
    averagePrice: number;
    trend: 'increasing' | 'decreasing' | 'stable';
}

interface SeasonalPattern {
    period: string;
    category: string;
    averageSpending: number;
    peakMonths: string[];
    recommendation: string;
}

interface TodoAction {
    type: 'add' | 'update' | 'remove' | 'complete';
    itemId?: string;
}

interface TodoItem {
    id?: number;
    item_name: string;
    suggested_quantity?: number;
    priority?: number;
    status?: string;
    reason?: string;
}

interface TimingRecommendation {
    itemName: string;
    optimalTiming: Date;
    reason: string;
    confidence: number;
    priceFactors: string[];
}

interface OrderFilters {
    start_date?: Date;
    end_date?: Date;
    store_name?: string;
    purchase_channel?: string;
    min_amount?: number;
    max_amount?: number;
}

interface ExcelData {
    sheets: ExcelSheet[];
    metadata: {
        fileName: string;
        totalRows: number;
        detectedPlatform?: string;
        confidence: number;
    };
}

interface ExcelSheet {
    name: string;
    headers: string[];
    rows: any[][];
    detectedFormat: string;
}

interface PlatformDataFormat {
    platform: string;
    identifiers: string[];
    fieldMappings: Record<string, string>;
    dateFormats: string[];
    priceFormats: string[];
}

// Platform-specific data formats
const PLATFORM_FORMATS: PlatformDataFormat[] = [
    {
        platform: '淘宝',
        identifiers: ['订单编号', '商品名称', '实付款', '交易状态'],
        fieldMappings: {
            '订单编号': 'id',
            '商品名称': 'item_name',
            '实付款': 'total_price',
            '交易状态': 'status',
            '成交时间': 'purchase_date',
            '卖家': 'store_name',
            '数量': 'purchase_quantity',
            '单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm:ss'],
        priceFormats: ['¥', '￥', 'CNY']
    },
    {
        platform: '1688',
        identifiers: ['订单号', '产品名称', '订单金额', '订单状态'],
        fieldMappings: {
            '订单号': 'id',
            '产品名称': 'item_name',
            '订单金额': 'total_price',
            '订单状态': 'status',
            '下单时间': 'purchase_date',
            '供应商': 'store_name',
            '采购数量': 'purchase_quantity',
            '单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD HH:mm:ss'],
        priceFormats: ['¥', '￥']
    },
    {
        platform: '京东',
        identifiers: ['订单号', '商品名称', '订单金额', '订单状态'],
        fieldMappings: {
            '订单号': 'id',
            '商品名称': 'item_name',
            '订单金额': 'total_price',
            '订单状态': 'status',
            '下单时间': 'purchase_date',
            '商家': 'store_name',
            '数量': 'purchase_quantity',
            '单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD HH:mm:ss'],
        priceFormats: ['¥', '￥']
    },
    {
        platform: '抖音商城',
        identifiers: ['订单编号', '商品标题', '实付金额'],
        fieldMappings: {
            '订单编号': 'id',
            '商品标题': 'item_name',
            '实付金额': 'total_price',
            '订单状态': 'status',
            '下单时间': 'purchase_date',
            '店铺名称': 'store_name',
            '购买数量': 'purchase_quantity',
            '商品单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD HH:mm:ss'],
        priceFormats: ['¥', '￥']
    },
    {
        platform: '中免日上',
        identifiers: ['订单号', '商品名称', '订单总额'],
        fieldMappings: {
            '订单号': 'id',
            '商品名称': 'item_name',
            '订单总额': 'total_price',
            '订单状态': 'status',
            '下单日期': 'purchase_date',
            '商户': 'store_name',
            '数量': 'purchase_quantity',
            '单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD', 'YYYY/MM/DD'],
        priceFormats: ['¥', '￥', '$', 'USD']
    },
    {
        platform: '拼多多',
        identifiers: ['订单编号', '商品名称', '实付金额', '订单状态'],
        fieldMappings: {
            '订单编号': 'id',
            '商品名称': 'item_name',
            '实付金额': 'total_price',
            '订单状态': 'status',
            '成团时间': 'purchase_date',
            '店铺名称': 'store_name',
            '商品数量': 'purchase_quantity',
            '商品单价': 'unit_price'
        },
        dateFormats: ['YYYY-MM-DD HH:mm:ss'],
        priceFormats: ['¥', '￥']
    }
];

export class ProcurementAgent extends BaseAgent {
    private mcpManager: MCPManager;
    private platformFormats: PlatformDataFormat[];

    constructor(config: AgentConfig, mcpManager: MCPManager) {
        super(config);
        this.mcpManager = mcpManager;
        this.platformFormats = PLATFORM_FORMATS;
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Procurement Agent');

        // Verify MCP servers are available
        if (!this.mcpManager.isServerRegistered('database-server')) {
            throw new Error('Database MCP server not available');
        }

        if (!this.mcpManager.isServerRegistered('file-storage-server')) {
            throw new Error('File Storage MCP server not available');
        }

        this.logger.info('Procurement Agent initialized successfully');
    }

    protected async onStart(): Promise<void> {
        this.logger.info('Starting Procurement Agent');
        // Perform initial procurement system health check
        await this.performProcurementHealthCheck();
    }

    protected async onStop(): Promise<void> {
        this.logger.info('Stopping Procurement Agent');
    }

    protected async onProcessTask(task: Task): Promise<any> {
        this.logger.info('Processing procurement task', {
            taskType: task.taskType,
            taskId: task.taskId,
        });

        switch (task.taskType) {
            case 'import_orders':
                return this.importOrders(task.input.fileId, task.input.platform);

            case 'generate_recommendations':
                return this.generatePurchaseRecommendations();

            case 'manage_todo_list':
                return this.manageTodoList(task.input.action, task.input.item);

            case 'analyze_patterns':
                return this.analyzePurchasePatterns();

            case 'optimize_timing':
                return this.optimizePurchaseTiming(task.input.items);

            case 'process_low_stock_alert':
                return this.processLowStockAlert(task.input.alerts);

            default:
                throw new Error(`Unknown task type: ${task.taskType}`);
        }
    }

    protected async onHandleMessage(message: AgentMessage): Promise<AgentMessage | null> {
        this.logger.debug('Handling procurement message', {
            messageType: message.messageType,
            fromAgent: message.fromAgent,
        });

        switch (message.messageType) {
            case 'request':
                return this.handleProcurementRequest(message);

            case 'notification':
                return this.handleProcurementNotification(message);

            default:
                this.logger.warn('Unhandled message type', { messageType: message.messageType });
                return null;
        }
    }

    protected onGetCapabilities(): AgentCapability[] {
        return [
            {
                name: 'multi_platform_order_import',
                description: 'Import and parse orders from multiple e-commerce platforms',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fileId: { type: 'string', description: 'File ID of uploaded order data' },
                        platform: { type: 'string', description: 'E-commerce platform name' },
                    },
                    required: ['fileId', 'platform'],
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        orderId: { type: 'string' },
                        itemsImported: { type: 'number' },
                        message: { type: 'string' },
                    },
                },
            },
            {
                name: 'purchase_recommendation_generation',
                description: 'Generate intelligent purchase recommendations based on historical data',
                inputSchema: {
                    type: 'object',
                    properties: {
                        analysisDepthDays: { type: 'number', description: 'Days of historical data to analyze' },
                        categories: { type: 'array', items: { type: 'string' }, description: 'Specific categories to analyze' },
                    },
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            itemName: { type: 'string' },
                            suggestedQuantity: { type: 'number' },
                            priority: { type: 'string' },
                            reason: { type: 'string' },
                        },
                    },
                },
            },
            {
                name: 'shopping_list_management',
                description: 'Manage shopping TODO list with intelligent prioritization',
                inputSchema: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', enum: ['add', 'update', 'remove', 'complete'] },
                        item: { type: 'object', description: 'Shopping list item data' },
                    },
                    required: ['action'],
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        updatedList: { type: 'array' },
                    },
                },
            },
        ];
    }

    // Public API methods
    public async importOrders(fileId: string, platform: string): Promise<ImportResult> {
        try {
            this.logger.info('Importing orders from file', { fileId, platform });

            // Validate file exists
            const fileMetadata = await this.callFileStorageMCP('getFileMetadata', {
                fileId,
            });

            if (!fileMetadata.success) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: [`File not found: ${fileId}`],
                    message: `文件不存在或无法访问: ${fileId}`,
                };
            }

            // Parse file based on type
            let parsedData: ExcelData;

            if (fileMetadata.data?.mimeType.includes('excel') ||
                fileMetadata.data?.mimeType.includes('spreadsheet') ||
                fileMetadata.data?.originalName.endsWith('.xlsx') ||
                fileMetadata.data?.originalName.endsWith('.xls')) {

                // Parse Excel file
                const excelResult = await this.callFileStorageMCP('parseExcelFile', {
                    fileId,
                });

                if (!excelResult.success) {
                    return {
                        success: false,
                        itemsImported: 0,
                        duplicatesDetected: 0,
                        errors: ['Failed to parse Excel file'],
                        message: `Excel文件解析失败: ${excelResult.error?.message || '未知错误'}`,
                    };
                }

                parsedData = excelResult.data;
            } else {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: ['Unsupported file format'],
                    message: `不支持的文件格式: ${fileMetadata.data?.mimeType || '未知'}`,
                };
            }

            // Normalize data based on platform
            const normalizedData = await this.normalizeOrderData(parsedData, platform);

            if (!normalizedData) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: ['Failed to normalize order data'],
                    message: `无法识别${platform}平台的数据格式`,
                };
            }

            // Check for duplicates
            const duplicateCheck = await this.checkForDuplicateOrder(normalizedData.order.id);

            if (duplicateCheck.isDuplicate) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 1,
                    errors: [`Duplicate order detected: ${normalizedData.order.id}`],
                    message: `检测到重复订单: ${normalizedData.order.id}`,
                };
            }

            // Import the order
            const importResult = await this.importNormalizedOrder(normalizedData);

            return importResult;

        } catch (error) {
            this.logger.error('Failed to import orders', { fileId, platform, error });
            return {
                success: false,
                itemsImported: 0,
                duplicatesDetected: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                message: `导入订单时出错: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    public async generatePurchaseRecommendations(): Promise<PurchaseRecommendation[]> {
        try {
            this.logger.info('Generating purchase recommendations');

            const recommendations: PurchaseRecommendation[] = [];

            // Get low stock items from inventory agent
            const lowStockItems = await this.getLowStockItems();

            // Analyze historical consumption patterns
            const consumptionAnalysis = await this.analyzeConsumptionPatterns();

            // Generate recommendations based on low stock
            for (const item of lowStockItems) {
                const consumption = consumptionAnalysis.find(c => c.itemName === item.item_name);

                const recommendation: PurchaseRecommendation = {
                    itemName: item.item_name,
                    suggestedQuantity: this.calculateSuggestedQuantity(item, consumption),
                    priority: this.calculatePriority(item, consumption),
                    reason: this.generateRecommendationReason(item, consumption),
                    consumptionRate: consumption?.averageConsumptionPerWeek,
                };

                // Add cost estimation if available
                const costEstimate = await this.estimateItemCost(item.item_name);
                if (costEstimate) {
                    recommendation.estimatedCost = costEstimate.estimatedPrice * recommendation.suggestedQuantity;
                    recommendation.preferredStore = costEstimate.preferredStore;
                }

                recommendations.push(recommendation);
            }

            // Add seasonal recommendations
            const seasonalRecommendations = await this.generateSeasonalRecommendations();
            recommendations.push(...seasonalRecommendations);

            // Sort by priority
            recommendations.sort((a, b) => {
                const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });

            this.logger.info('Generated purchase recommendations', { count: recommendations.length });

            return recommendations;

        } catch (error) {
            this.logger.error('Failed to generate purchase recommendations', { error });
            return [];
        }
    }

    public async manageTodoList(action: TodoAction, item?: TodoItem): Promise<boolean> {
        try {
            this.logger.info('Managing todo list', { action: action.type, itemId: action.itemId });

            switch (action.type) {
                case 'add':
                    if (!item) {
                        throw new Error('Item data required for add action');
                    }
                    return this.addToTodoList(item);

                case 'update':
                    if (!action.itemId || !item) {
                        throw new Error('Item ID and data required for update action');
                    }
                    return this.updateTodoListItem(action.itemId, item);

                case 'remove':
                    if (!action.itemId) {
                        throw new Error('Item ID required for remove action');
                    }
                    return this.removeFromTodoList(action.itemId);

                case 'complete':
                    if (!action.itemId) {
                        throw new Error('Item ID required for complete action');
                    }
                    return this.completeTodoListItem(action.itemId);

                default:
                    throw new Error(`Unknown todo action: ${action.type}`);
            }

        } catch (error) {
            this.logger.error('Failed to manage todo list', { action, error });
            return false;
        }
    }

    public async analyzePurchasePatterns(): Promise<PurchaseAnalysis> {
        try {
            this.logger.info('Analyzing purchase patterns');

            // Get order history for the last year
            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(endDate.getFullYear() - 1);

            const orderHistory = await this.callDatabaseMCP('getOrderHistory', {
                filters: {
                    start_date: startDate,
                    end_date: endDate,
                },
            });

            if (!orderHistory.success || !orderHistory.data) {
                throw new Error('Failed to fetch order history');
            }

            const orders: Order[] = orderHistory.data;

            // Calculate basic metrics
            const totalSpending = orders.reduce((sum, order) => sum + (order.total_price || 0), 0);
            const averageOrderValue = orders.length > 0 ? totalSpending / orders.length : 0;

            // Analyze categories
            const categoryAnalysis = await this.analyzeCategoryPatterns(orders);

            // Analyze seasonal patterns
            const seasonalPatterns = await this.analyzeSeasonalPatterns(orders);

            // Generate recommendations
            const recommendations = this.generateAnalysisRecommendations(
                categoryAnalysis,
                seasonalPatterns,
                totalSpending,
                averageOrderValue
            );

            return {
                totalSpending,
                averageOrderValue,
                topCategories: categoryAnalysis,
                seasonalPatterns,
                recommendations,
            };

        } catch (error) {
            this.logger.error('Failed to analyze purchase patterns', { error });
            throw error;
        }
    }

    public async optimizePurchaseTiming(items: string[]): Promise<TimingRecommendation[]> {
        try {
            this.logger.info('Optimizing purchase timing', { itemCount: items.length });

            const recommendations: TimingRecommendation[] = [];

            for (const itemName of items) {
                const timing = await this.calculateOptimalTiming(itemName);
                recommendations.push(timing);
            }

            return recommendations;

        } catch (error) {
            this.logger.error('Failed to optimize purchase timing', { items, error });
            return [];
        }
    }

    // Private helper methods
    private async normalizeOrderData(excelData: ExcelData, platform: string): Promise<NormalizedOrderData | null> {
        // Find matching platform format
        const platformFormat = this.platformFormats.find(
            format => format.platform === platform ||
                format.identifiers.some(id =>
                    excelData.sheets.some(sheet =>
                        sheet.headers.some(header => header.includes(id))
                    )
                )
        );

        if (!platformFormat) {
            // Try to auto-detect platform
            const detectedPlatform = this.detectPlatformFromData(excelData);
            if (detectedPlatform) {
                return this.normalizeOrderData(excelData, detectedPlatform);
            }
            return null;
        }

        // Find the main data sheet
        const dataSheet = this.findMainDataSheet(excelData.sheets, platformFormat);
        if (!dataSheet) {
            return null;
        }

        // Map headers to our standard format
        const headerMapping = this.createHeaderMapping(dataSheet.headers, platformFormat.fieldMappings);

        // Extract order data
        const orders = this.extractOrdersFromSheet(dataSheet, headerMapping, platformFormat);

        if (orders.length === 0) {
            return null;
        }

        // For now, take the first order (could be enhanced to handle multiple orders)
        const mainOrder = orders[0];

        return {
            order: mainOrder,
            platform: platformFormat.platform,
            originalFormat: dataSheet.detectedFormat,
            confidence: this.calculateNormalizationConfidence(headerMapping, dataSheet),
        };
    }

    private detectPlatformFromData(excelData: ExcelData): string | null {
        for (const format of this.platformFormats) {
            let matchCount = 0;

            for (const sheet of excelData.sheets) {
                for (const identifier of format.identifiers) {
                    if (sheet.headers.some(header => header.includes(identifier))) {
                        matchCount++;
                    }
                }
            }

            // If we match at least half of the identifiers, consider it a match
            if (matchCount >= Math.ceil(format.identifiers.length / 2)) {
                return format.platform;
            }
        }

        return null;
    }

    private findMainDataSheet(sheets: ExcelSheet[], format: PlatformDataFormat): ExcelSheet | null {
        // Find sheet with most matching headers
        let bestSheet: ExcelSheet | null = null;
        let bestScore = 0;

        for (const sheet of sheets) {
            let score = 0;
            for (const identifier of format.identifiers) {
                if (sheet.headers.some(header => header.includes(identifier))) {
                    score++;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestSheet = sheet;
            }
        }

        return bestSheet;
    }

    private createHeaderMapping(headers: string[], fieldMappings: Record<string, string>): Record<number, string> {
        const mapping: Record<number, string> = {};

        headers.forEach((header, index) => {
            for (const [platformField, standardField] of Object.entries(fieldMappings)) {
                if (header.includes(platformField)) {
                    mapping[index] = standardField;
                    break;
                }
            }
        });

        return mapping;
    }

    private extractOrdersFromSheet(
        sheet: ExcelSheet,
        headerMapping: Record<number, string>,
        format: PlatformDataFormat
    ): CreateOrder[] {
        const orders: CreateOrder[] = [];
        const orderMap = new Map<string, CreateOrder>();

        for (const row of sheet.rows) {
            if (row.length === 0) continue;

            // Extract order data from row
            const orderData: any = {};
            const itemData: any = {};

            for (const [colIndex, standardField] of Object.entries(headerMapping)) {
                const value = row[parseInt(colIndex)];
                if (value !== undefined && value !== null && value !== '') {
                    if (standardField === 'id' || standardField === 'store_name' ||
                        standardField === 'total_price' || standardField === 'purchase_date' ||
                        standardField === 'purchase_channel') {
                        orderData[standardField] = this.normalizeFieldValue(value, standardField, format);
                    } else {
                        itemData[standardField] = this.normalizeFieldValue(value, standardField, format);
                    }
                }
            }

            // Create or update order
            if (orderData.id) {
                let order = orderMap.get(orderData.id);

                if (!order) {
                    order = {
                        id: orderData.id,
                        store_name: orderData.store_name || '未知商家',
                        total_price: orderData.total_price,
                        purchase_date: orderData.purchase_date,
                        purchase_channel: format.platform,
                        items: [],
                    };
                    orderMap.set(orderData.id, order);
                }

                // Add item if we have item data
                if (itemData.item_name) {
                    order.items = order.items || [];
                    order.items.push({
                        item_name: itemData.item_name,
                        purchase_quantity: itemData.purchase_quantity || 1,
                        model: itemData.model,
                        unit_price: itemData.unit_price,
                        category: itemData.category,
                    });
                }
            }
        }

        return Array.from(orderMap.values());
    }

    private normalizeFieldValue(value: any, fieldType: string, format: PlatformDataFormat): any {
        if (value === undefined || value === null || value === '') {
            return null;
        }

        switch (fieldType) {
            case 'total_price':
            case 'unit_price':
                return this.normalizePrice(value, format.priceFormats);

            case 'purchase_date':
                return this.normalizeDate(value, format.dateFormats);

            case 'purchase_quantity':
                return this.normalizeQuantity(value);

            default:
                return String(value).trim();
        }
    }

    private normalizePrice(value: any, priceFormats: string[]): number | null {
        if (typeof value === 'number') {
            return value;
        }

        let priceStr = String(value).trim();

        // Remove currency symbols
        for (const format of priceFormats) {
            priceStr = priceStr.replace(new RegExp(format, 'g'), '');
        }

        // Remove commas and other formatting
        priceStr = priceStr.replace(/[,，]/g, '');

        const price = parseFloat(priceStr);
        return isNaN(price) ? null : price;
    }

    private normalizeDate(value: any, dateFormats: string[]): Date | null {
        if (value instanceof Date) {
            return value;
        }

        const dateStr = String(value).trim();

        // Try parsing with different formats
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    }

    private normalizeQuantity(value: any): number {
        if (typeof value === 'number') {
            return Math.max(1, Math.floor(value));
        }

        const quantity = parseInt(String(value).replace(/[^\d]/g, ''));
        return isNaN(quantity) ? 1 : Math.max(1, quantity);
    }

    private calculateNormalizationConfidence(
        headerMapping: Record<number, string>,
        sheet: ExcelSheet
    ): number {
        const mappedFields = Object.keys(headerMapping).length;
        const totalHeaders = sheet.headers.length;

        // Base confidence on how many headers we could map
        const mappingRatio = mappedFields / Math.max(totalHeaders, 1);

        // Boost confidence if we have essential fields
        const essentialFields = ['id', 'item_name', 'store_name'];
        const hasEssentialFields = essentialFields.every(field =>
            Object.values(headerMapping).includes(field)
        );

        let confidence = mappingRatio * 0.7;
        if (hasEssentialFields) {
            confidence += 0.3;
        }

        return Math.min(1.0, confidence);
    }

    private async checkForDuplicateOrder(orderId: string): Promise<{ isDuplicate: boolean; existingOrder?: Order }> {
        try {
            const result = await this.callDatabaseMCP('getOrderDetails', {
                orderId,
            });

            if (result.success && result.data) {
                return {
                    isDuplicate: true,
                    existingOrder: result.data.order,
                };
            }

            return { isDuplicate: false };

        } catch (error) {
            // If order doesn't exist, that's fine
            return { isDuplicate: false };
        }
    }

    private async importNormalizedOrder(normalizedData: NormalizedOrderData): Promise<ImportResult> {
        try {
            const orderId = await this.callDatabaseMCP('createOrder', {
                order: normalizedData.order,
            });

            if (!orderId.success) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: ['Failed to create order in database'],
                    message: '订单创建失败',
                };
            }

            const itemCount = normalizedData.order.items?.length || 0;

            return {
                success: true,
                orderId: orderId.data,
                itemsImported: itemCount,
                duplicatesDetected: 0,
                errors: [],
                message: `成功导入订单 ${normalizedData.order.id}，包含 ${itemCount} 个商品`,
                normalizedData,
            };

        } catch (error) {
            return {
                success: false,
                itemsImported: 0,
                duplicatesDetected: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                message: `导入订单失败: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async getLowStockItems(): Promise<any[]> {
        // This would typically come from the inventory agent
        // For now, we'll make a direct database call
        try {
            const result = await this.callDatabaseMCP('searchInventoryItems', {
                criteria: {
                    low_stock_threshold: 3, // Items with 3 or fewer units
                },
            });

            return result.success && result.data ? result.data : [];
        } catch (error) {
            this.logger.error('Failed to get low stock items', { error });
            return [];
        }
    }

    private async analyzeConsumptionPatterns(): Promise<Array<{
        itemName: string;
        averageConsumptionPerWeek: number;
        trend: 'increasing' | 'decreasing' | 'stable';
        lastPurchaseDate?: Date;
    }>> {
        // Simplified implementation - would be enhanced with more sophisticated analysis
        return [];
    }

    private calculateSuggestedQuantity(item: any, consumption?: any): number {
        // Simple calculation based on current stock and consumption rate
        const currentStock = item.current_quantity || 0;
        const weeklyConsumption = consumption?.averageConsumptionPerWeek || 1;

        // Suggest enough for 4 weeks
        const suggestedStock = Math.ceil(weeklyConsumption * 4);

        return Math.max(1, suggestedStock - currentStock);
    }

    private calculatePriority(item: any, consumption?: any): 'low' | 'normal' | 'high' | 'urgent' {
        const currentStock = item.current_quantity || 0;

        if (currentStock === 0) {
            return 'urgent';
        } else if (currentStock <= 1) {
            return 'high';
        } else if (currentStock <= 2) {
            return 'normal';
        } else {
            return 'low';
        }
    }

    private generateRecommendationReason(item: any, consumption?: any): string {
        const currentStock = item.current_quantity || 0;

        if (currentStock === 0) {
            return `${item.item_name} 已用完，需要立即购买`;
        } else if (currentStock <= 1) {
            return `${item.item_name} 库存严重不足（剩余 ${currentStock}），建议优先购买`;
        } else {
            return `${item.item_name} 库存偏低（剩余 ${currentStock}），建议补充`;
        }
    }

    private async estimateItemCost(itemName: string): Promise<{
        estimatedPrice: number;
        preferredStore: string;
    } | null> {
        // Simplified implementation - would analyze historical prices
        return null;
    }

    private async generateSeasonalRecommendations(): Promise<PurchaseRecommendation[]> {
        // Simplified implementation - would analyze seasonal patterns
        return [];
    }

    private async addToTodoList(item: TodoItem): Promise<boolean> {
        try {
            const result = await this.callDatabaseMCP('addToShoppingList', {
                item: {
                    item_name: item.item_name,
                    suggested_quantity: item.suggested_quantity,
                    priority: item.priority || 1,
                    status: item.status || 'pending',
                    reason: item.reason,
                },
            });

            return result.success;
        } catch (error) {
            this.logger.error('Failed to add item to todo list', { item, error });
            return false;
        }
    }

    private async updateTodoListItem(itemId: string, updates: Partial<TodoItem>): Promise<boolean> {
        try {
            const result = await this.callDatabaseMCP('updateShoppingListItem', {
                id: itemId,
                updates,
            });

            return result.success && result.data;
        } catch (error) {
            this.logger.error('Failed to update todo list item', { itemId, updates, error });
            return false;
        }
    }

    private async removeFromTodoList(itemId: string): Promise<boolean> {
        try {
            const result = await this.callDatabaseMCP('removeFromShoppingList', {
                id: itemId,
            });

            return result.success && result.data;
        } catch (error) {
            this.logger.error('Failed to remove item from todo list', { itemId, error });
            return false;
        }
    }

    private async completeTodoListItem(itemId: string): Promise<boolean> {
        return this.updateTodoListItem(itemId, { status: 'completed' });
    }

    private async analyzeCategoryPatterns(orders: Order[]): Promise<CategoryAnalysis[]> {
        // Simplified implementation
        return [];
    }

    private async analyzeSeasonalPatterns(orders: Order[]): Promise<SeasonalPattern[]> {
        // Simplified implementation
        return [];
    }

    private generateAnalysisRecommendations(
        categoryAnalysis: CategoryAnalysis[],
        seasonalPatterns: SeasonalPattern[],
        totalSpending: number,
        averageOrderValue: number
    ): string[] {
        const recommendations: string[] = [];

        if (totalSpending > 0) {
            recommendations.push(`过去一年总支出: ¥${totalSpending.toFixed(2)}`);
            recommendations.push(`平均订单金额: ¥${averageOrderValue.toFixed(2)}`);
        }

        if (categoryAnalysis.length === 0) {
            recommendations.push('建议增加购买记录以获得更好的分析结果');
        }

        return recommendations;
    }

    private async calculateOptimalTiming(itemName: string): Promise<TimingRecommendation> {
        // Simplified implementation - would analyze price trends and seasonal patterns
        const now = new Date();
        const optimalDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week from now

        return {
            itemName,
            optimalTiming: optimalDate,
            reason: '基于历史数据分析的建议购买时间',
            confidence: 0.7,
            priceFactors: ['历史价格趋势', '季节性因素'],
        };
    }

    private async processLowStockAlert(alerts: any[]): Promise<void> {
        this.logger.info('Processing low stock alerts', { alertCount: alerts.length });

        // Generate recommendations for low stock items
        const recommendations = await this.generatePurchaseRecommendations();

        // Add high-priority items to shopping list
        for (const recommendation of recommendations) {
            if (recommendation.priority === 'urgent' || recommendation.priority === 'high') {
                await this.addToTodoList({
                    item_name: recommendation.itemName,
                    suggested_quantity: recommendation.suggestedQuantity,
                    priority: recommendation.priority === 'urgent' ? 5 : 4,
                    reason: recommendation.reason,
                });
            }
        }

        // Notify other agents if needed
        if (recommendations.length > 0) {
            await this.notifyFinanceAgent(recommendations);
        }
    }

    private async performProcurementHealthCheck(): Promise<void> {
        try {
            this.logger.info('Performing procurement health check');

            // Check database connectivity
            const shoppingList = await this.callDatabaseMCP('getShoppingList', {});

            if (!shoppingList.success) {
                throw new Error('Failed to access shopping list');
            }

            this.logger.info('Procurement health check completed successfully');
        } catch (error) {
            this.logger.error('Procurement health check failed', { error });
            throw error;
        }
    }

    private async notifyFinanceAgent(recommendations: PurchaseRecommendation[]): Promise<void> {
        try {
            const totalEstimatedCost = recommendations.reduce(
                (sum, rec) => sum + (rec.estimatedCost || 0),
                0
            );

            const message = this.createMessage(
                'finance',
                'notification',
                {
                    type: 'purchase_recommendations',
                    recommendations: recommendations.map(rec => ({
                        itemName: rec.itemName,
                        estimatedCost: rec.estimatedCost,
                        priority: rec.priority,
                    })),
                    totalEstimatedCost,
                    timestamp: new Date(),
                }
            );

            this.emit('sendMessage', message);
            this.logger.info('Sent purchase recommendations to finance agent', {
                recommendationCount: recommendations.length,
                totalEstimatedCost
            });
        } catch (error) {
            this.logger.error('Failed to notify finance agent', { error });
        }
    }

    private async handleProcurementRequest(message: AgentMessage): Promise<AgentMessage | null> {
        try {
            const { requestType, data } = message.payload;

            switch (requestType) {
                case 'get_purchase_recommendations':
                    const recommendations = await this.generatePurchaseRecommendations();
                    return this.createMessage(
                        message.fromAgent,
                        'response',
                        { recommendations },
                        message.correlationId
                    );

                case 'get_shopping_list':
                    const shoppingList = await this.callDatabaseMCP('getShoppingList', {});
                    return this.createMessage(
                        message.fromAgent,
                        'response',
                        { shoppingList: shoppingList.data || [] },
                        message.correlationId
                    );

                case 'analyze_purchase_patterns':
                    const analysis = await this.analyzePurchasePatterns();
                    return this.createMessage(
                        message.fromAgent,
                        'response',
                        { analysis },
                        message.correlationId
                    );

                default:
                    this.logger.warn('Unknown procurement request type', { requestType });
                    return null;
            }
        } catch (error) {
            this.logger.error('Failed to handle procurement request', { error });
            return this.createErrorMessage(message, error instanceof Error ? error.message : String(error));
        }
    }

    private async handleProcurementNotification(message: AgentMessage): Promise<AgentMessage | null> {
        try {
            const { type, data } = message.payload;

            switch (type) {
                case 'low_stock_alert':
                    await this.processLowStockAlert(data.alerts || []);
                    break;

                case 'inventory_updated':
                    // Could trigger re-analysis of recommendations
                    this.logger.info('Received inventory update notification');
                    break;

                default:
                    this.logger.info('Received procurement notification', { type });
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to handle procurement notification', { error });
            return null;
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
