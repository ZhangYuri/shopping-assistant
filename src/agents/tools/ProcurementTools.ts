/**
 * Procurement Tools Factory - Creates LangChain tools for procurement operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { MCPManager } from '@/mcp/MCPManager';
import { Logger } from '@/utils/Logger';

export class ProcurementToolsFactory {
    private mcpManager: MCPManager;
    private logger: Logger;

    constructor(mcpManager: MCPManager) {
        this.mcpManager = mcpManager;
        this.logger = new Logger({
            component: 'ProcurementToolsFactory',
            level: 'info',
        });
    }

    public createAllTools(): DynamicTool[] {
        const tools: DynamicTool[] = [];

        // Database tools
        tools.push(...this.createDatabaseTools());

        // File storage tools
        tools.push(...this.createFileStorageTools());

        // Notification tools
        tools.push(...this.createNotificationTools());

        this.logger.info(`Created ${tools.length} procurement tools`);
        return tools;
    }

    private createDatabaseTools(): DynamicTool[] {
        return [
            // Order Import Tool
            new DynamicTool({
                name: 'import_orders',
                description: 'Import orders from Excel files or images from multiple e-commerce platforms (淘宝, 1688, 京东, 抖音商城, 中免日上, 拼多多). Input should be JSON with fileId and platform fields.',
                func: async (input: string) => {
                    try {
                        const { fileId, platform } = JSON.parse(input);
                        return JSON.stringify(await this.importOrders(fileId, platform));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with fileId and platform fields.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),

            // Get Order History Tool
            new DynamicTool({
                name: 'get_order_history',
                description: 'Retrieve order history with optional filters. Input should be JSON with optional startDate, endDate, storeName, platform, minAmount, maxAmount.',
                func: async (input: string) => {
                    try {
                        const filters = input ? JSON.parse(input) : {};
                        return JSON.stringify(await this.getOrderHistory(filters));
                    } catch (error) {
                        return JSON.stringify(await this.getOrderHistory({}));
                    }
                },
            }),

            // Get Shopping List Tool
            new DynamicTool({
                name: 'get_shopping_list',
                description: 'Get current shopping list with all pending and completed items. Input should be JSON with optional status (pending/completed/all).',
                func: async (input: string) => {
                    try {
                        const { status = 'all' } = input ? JSON.parse(input) : {};
                        return JSON.stringify(await this.getShoppingList(status));
                    } catch (error) {
                        return JSON.stringify(await this.getShoppingList('all'));
                    }
                },
            }),

            // Shopping List Management Tool
            new DynamicTool({
                name: 'manage_shopping_list',
                description: 'Manage shopping TODO list with add, update, remove, and complete operations. Input should be JSON with action, optional itemId, and optional itemData.',
                func: async (input: string) => {
                    try {
                        const { action, itemId, itemData } = JSON.parse(input);
                        return JSON.stringify(await this.manageShoppingList(action, itemId, itemData));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with action, optional itemId, and optional itemData.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),

            // Get Inventory Items Tool
            new DynamicTool({
                name: 'get_inventory_items',
                description: 'Get inventory items with optional filters. Input should be JSON with optional criteria like category, low_stock_threshold, item_name.',
                func: async (input: string) => {
                    try {
                        const criteria = input ? JSON.parse(input) : {};
                        return JSON.stringify(await this.getInventoryItems(criteria));
                    } catch (error) {
                        return JSON.stringify(await this.getInventoryItems({}));
                    }
                },
            }),

            // Purchase Pattern Analysis Tool
            new DynamicTool({
                name: 'analyze_purchase_patterns',
                description: 'Analyze historical purchase patterns and spending trends. Input should be JSON with optional timeRange (month/quarter/year) and categories array.',
                func: async (input: string) => {
                    try {
                        const { timeRange = 'year', categories } = input ? JSON.parse(input) : {};
                        return JSON.stringify(await this.analyzePurchasePatterns(timeRange, categories));
                    } catch (error) {
                        return JSON.stringify(await this.analyzePurchasePatterns('year', undefined));
                    }
                },
            }),

            // Generate Purchase Recommendations Tool
            new DynamicTool({
                name: 'generate_purchase_recommendations',
                description: 'Generate intelligent purchase recommendations based on inventory levels and historical data. Input should be JSON with optional analysisDepthDays (default: 90) and categories array.',
                func: async (input: string) => {
                    try {
                        const { analysisDepthDays = 90, categories } = input ? JSON.parse(input) : {};
                        return JSON.stringify(await this.generatePurchaseRecommendations(analysisDepthDays, categories));
                    } catch (error) {
                        return JSON.stringify(await this.generatePurchaseRecommendations(90, undefined));
                    }
                },
            }),
        ];
    }

    private createFileStorageTools(): DynamicTool[] {
        return [
            // File Upload Tool
            new DynamicTool({
                name: 'upload_file',
                description: 'Upload a file for processing. Input should be JSON with file data and metadata.',
                func: async (input: string) => {
                    try {
                        const { fileData, metadata } = JSON.parse(input);
                        return JSON.stringify(await this.uploadFile(fileData, metadata));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with fileData and metadata.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),

            // Parse Excel File Tool
            new DynamicTool({
                name: 'parse_excel_file',
                description: 'Parse Excel file content. Input should be JSON with fileId.',
                func: async (input: string) => {
                    try {
                        const { fileId } = JSON.parse(input);
                        return JSON.stringify(await this.parseExcelFile(fileId));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with fileId.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),

            // Process Image Tool
            new DynamicTool({
                name: 'process_image',
                description: 'Process image with OCR for text extraction. Input should be JSON with fileId and optional processing options.',
                func: async (input: string) => {
                    try {
                        const { fileId, options = {} } = JSON.parse(input);
                        return JSON.stringify(await this.processImage(fileId, options));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with fileId and optional options.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),
        ];
    }

    private createNotificationTools(): DynamicTool[] {
        return [
            // Send Notification Tool
            new DynamicTool({
                name: 'send_notification',
                description: 'Send notification to user. Input should be JSON with notification content and options.',
                func: async (input: string) => {
                    try {
                        const { content, options = {} } = JSON.parse(input);
                        return JSON.stringify(await this.sendNotification(content, options));
                    } catch (error) {
                        return JSON.stringify({
                            error: 'Invalid input format. Expected JSON with content and optional options.',
                            details: error instanceof Error ? error.message : String(error)
                        });
                    }
                },
            }),
        ];
    }

    // Tool implementation methods using MCP calls
    private async importOrders(fileId: string, platform: string): Promise<any> {
        try {
            this.logger.info('Importing orders from file', { fileId, platform });

            // Validate file exists
            const fileMetadata = await this.mcpManager.callTool('file-storage-server', 'getFileMetadata', {
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
            let parsedData: any;

            if (fileMetadata.data?.mimeType.includes('excel') ||
                fileMetadata.data?.mimeType.includes('spreadsheet') ||
                fileMetadata.data?.originalName.endsWith('.xlsx') ||
                fileMetadata.data?.originalName.endsWith('.xls')) {

                // Parse Excel file
                const excelResult = await this.mcpManager.callTool('file-storage-server', 'parseExcelFile', {
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

            // Normalize data based on platform (simplified implementation)
            const normalizedOrder = this.normalizeOrderData(parsedData, platform);

            if (!normalizedOrder) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: ['Failed to normalize order data'],
                    message: `无法识别${platform}平台的数据格式`,
                };
            }

            // Check for duplicates
            const duplicateCheck = await this.mcpManager.callTool('database-server', 'getOrderDetails', {
                orderId: normalizedOrder.id,
            });

            if (duplicateCheck.success && duplicateCheck.data) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 1,
                    errors: [`Duplicate order detected: ${normalizedOrder.id}`],
                    message: `检测到重复订单: ${normalizedOrder.id}`,
                };
            }

            // Import the order
            const createResult = await this.mcpManager.callTool('database-server', 'createOrder', {
                order: normalizedOrder,
            });

            if (!createResult.success) {
                return {
                    success: false,
                    itemsImported: 0,
                    duplicatesDetected: 0,
                    errors: ['Failed to create order in database'],
                    message: '订单创建失败',
                };
            }

            const itemCount = normalizedOrder.items?.length || 0;

            return {
                success: true,
                orderId: createResult.data,
                itemsImported: itemCount,
                duplicatesDetected: 0,
                errors: [],
                message: `成功导入订单 ${normalizedOrder.id}，包含 ${itemCount} 个商品`,
            };

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

    private async getOrderHistory(filters: any): Promise<any> {
        try {
            this.logger.info('Getting order history', { filters });

            const dbFilters: any = {};

            if (filters.startDate) {
                dbFilters.start_date = new Date(filters.startDate);
            }
            if (filters.endDate) {
                dbFilters.end_date = new Date(filters.endDate);
            }
            if (filters.storeName) {
                dbFilters.store_name = filters.storeName;
            }
            if (filters.platform) {
                dbFilters.purchase_channel = filters.platform;
            }
            if (filters.minAmount) {
                dbFilters.min_amount = filters.minAmount;
            }
            if (filters.maxAmount) {
                dbFilters.max_amount = filters.maxAmount;
            }

            const result = await this.mcpManager.callTool('database-server', 'getOrderHistory', {
                filters: dbFilters,
            });

            return {
                success: result.success,
                orders: result.data || [],
                count: result.data?.length || 0,
            };

        } catch (error) {
            this.logger.error('Failed to get order history', { filters, error });
            return {
                success: false,
                orders: [],
                count: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async getShoppingList(status: string = 'all'): Promise<any> {
        try {
            this.logger.info('Getting shopping list', { status });

            const result = await this.mcpManager.callTool('database-server', 'getShoppingList', {});

            if (!result.success) {
                return {
                    success: false,
                    items: [],
                    count: 0,
                };
            }

            let items = result.data || [];

            // Filter by status if specified
            if (status !== 'all') {
                items = items.filter((item: any) => item.status === status);
            }

            return {
                success: true,
                items,
                count: items.length,
            };

        } catch (error) {
            this.logger.error('Failed to get shopping list', { status, error });
            return {
                success: false,
                items: [],
                count: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async manageShoppingList(action: string, itemId?: string, itemData?: any): Promise<any> {
        try {
            this.logger.info('Managing shopping list', { action, itemId });

            switch (action) {
                case 'add':
                    if (!itemData) {
                        throw new Error('Item data required for add action');
                    }
                    const addResult = await this.mcpManager.callTool('database-server', 'addToShoppingList', {
                        item: itemData,
                    });
                    return {
                        success: addResult.success,
                        message: addResult.success ? '成功添加到购物清单' : '添加失败',
                        data: addResult.data,
                    };

                case 'update':
                    if (!itemId || !itemData) {
                        throw new Error('Item ID and data required for update action');
                    }
                    const updateResult = await this.mcpManager.callTool('database-server', 'updateShoppingListItem', {
                        id: itemId,
                        updates: itemData,
                    });
                    return {
                        success: updateResult.success && updateResult.data,
                        message: updateResult.success ? '成功更新购物清单项' : '更新失败',
                    };

                case 'remove':
                    if (!itemId) {
                        throw new Error('Item ID required for remove action');
                    }
                    const removeResult = await this.mcpManager.callTool('database-server', 'removeFromShoppingList', {
                        id: itemId,
                    });
                    return {
                        success: removeResult.success && removeResult.data,
                        message: removeResult.success ? '成功删除购物清单项' : '删除失败',
                    };

                case 'complete':
                    if (!itemId) {
                        throw new Error('Item ID required for complete action');
                    }
                    const completeResult = await this.mcpManager.callTool('database-server', 'updateShoppingListItem', {
                        id: itemId,
                        updates: { status: 'completed' },
                    });
                    return {
                        success: completeResult.success && completeResult.data,
                        message: completeResult.success ? '成功完成购物清单项' : '完成操作失败',
                    };

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error) {
            this.logger.error('Failed to manage shopping list', { action, itemId, error });
            return {
                success: false,
                message: `操作失败: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    private async getInventoryItems(criteria: any): Promise<any> {
        try {
            const result = await this.mcpManager.callTool('database-server', 'searchInventoryItems', {
                criteria,
            });

            return {
                success: result.success,
                items: result.data || [],
                count: result.data?.length || 0,
            };
        } catch (error) {
            this.logger.error('Failed to get inventory items', { criteria, error });
            return {
                success: false,
                items: [],
                count: 0,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async analyzePurchasePatterns(timeRange: string = 'year', categories?: string[]): Promise<any> {
        try {
            this.logger.info('Analyzing purchase patterns', { timeRange, categories });

            // Calculate date range
            const endDate = new Date();
            const startDate = new Date();

            switch (timeRange) {
                case 'month':
                    startDate.setMonth(endDate.getMonth() - 1);
                    break;
                case 'quarter':
                    startDate.setMonth(endDate.getMonth() - 3);
                    break;
                case 'year':
                default:
                    startDate.setFullYear(endDate.getFullYear() - 1);
                    break;
            }

            // Get order history
            const orderHistory = await this.mcpManager.callTool('database-server', 'getOrderHistory', {
                filters: {
                    start_date: startDate,
                    end_date: endDate,
                },
            });

            if (!orderHistory.success || !orderHistory.data) {
                throw new Error('Failed to fetch order history');
            }

            const orders = orderHistory.data;
            const totalSpending = orders.reduce((sum: number, order: any) => sum + (order.total_price || 0), 0);
            const averageOrderValue = orders.length > 0 ? totalSpending / orders.length : 0;

            // Get spending by category
            const categorySpending = await this.mcpManager.callTool('database-server', 'getSpendingByCategory', {
                dateRange: {
                    start_date: startDate,
                    end_date: endDate,
                },
            });

            return {
                timeRange,
                totalSpending,
                averageOrderValue,
                orderCount: orders.length,
                categoryBreakdown: categorySpending.success ? categorySpending.data : [],
                recommendations: [
                    `过去${timeRange === 'year' ? '一年' : timeRange === 'quarter' ? '三个月' : '一个月'}总支出: ¥${totalSpending.toFixed(2)}`,
                    `平均订单金额: ¥${averageOrderValue.toFixed(2)}`,
                    `订单总数: ${orders.length}`,
                ],
            };

        } catch (error) {
            this.logger.error('Failed to analyze purchase patterns', { error });
            throw error;
        }
    }

    private async generatePurchaseRecommendations(analysisDepthDays: number = 90, categories?: string[]): Promise<any> {
        try {
            this.logger.info('Generating purchase recommendations', { analysisDepthDays, categories });

            const recommendations: any[] = [];

            // Get low stock items
            const lowStockResult = await this.mcpManager.callTool('database-server', 'searchInventoryItems', {
                criteria: {
                    low_stock_threshold: 3,
                    ...(categories && { category: categories[0] }), // Simplified for first category
                },
            });

            if (lowStockResult.success && lowStockResult.data) {
                for (const item of lowStockResult.data) {
                    const recommendation = {
                        itemName: item.item_name,
                        suggestedQuantity: this.calculateSuggestedQuantity(item),
                        priority: this.calculatePriority(item),
                        reason: this.generateRecommendationReason(item),
                    };

                    recommendations.push(recommendation);
                }
            }

            // Sort by priority
            recommendations.sort((a, b) => {
                const priorityOrder: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
                return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
            });

            this.logger.info('Generated purchase recommendations', { count: recommendations.length });
            return recommendations;

        } catch (error) {
            this.logger.error('Failed to generate purchase recommendations', { error });
            return [];
        }
    }

    // File storage tool implementations
    private async uploadFile(fileData: any, metadata: any): Promise<any> {
        try {
            const result = await this.mcpManager.callTool('file-storage-server', 'uploadFile', {
                file: fileData,
                metadata,
            });
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async parseExcelFile(fileId: string): Promise<any> {
        try {
            const result = await this.mcpManager.callTool('file-storage-server', 'parseExcelFile', {
                fileId,
            });
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async processImage(fileId: string, options: any): Promise<any> {
        try {
            const result = await this.mcpManager.callTool('file-storage-server', 'processImage', {
                fileId,
                options,
            });
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // Notification tool implementations
    private async sendNotification(content: any, options: any): Promise<any> {
        try {
            const result = await this.mcpManager.callTool('notification-server', 'sendNotification', {
                notification: {
                    ...content,
                    ...options,
                },
            });
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // Helper methods
    private normalizeOrderData(excelData: any, platform: string): any {
        // Simplified normalization - in a real implementation, this would be more sophisticated
        if (!excelData.sheets || excelData.sheets.length === 0) {
            return null;
        }

        const sheet = excelData.sheets[0];
        if (!sheet.rows || sheet.rows.length === 0) {
            return null;
        }

        // Extract first row as sample order
        const row = sheet.rows[0];
        const orderId = `${platform}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        return {
            id: orderId,
            store_name: row[4] || '未知商家', // Assuming store name is in column 4
            total_price: this.parsePrice(row[2]), // Assuming price is in column 2
            purchase_date: new Date(),
            purchase_channel: platform,
            items: [{
                item_name: row[1] || '未知商品', // Assuming item name is in column 1
                purchase_quantity: 1,
                unit_price: this.parsePrice(row[2]),
            }],
        };
    }

    private parsePrice(priceStr: any): number | null {
        if (typeof priceStr === 'number') {
            return priceStr;
        }

        if (typeof priceStr === 'string') {
            // Remove currency symbols and parse
            const cleaned = priceStr.replace(/[¥￥$,，]/g, '').trim();
            const price = parseFloat(cleaned);
            return isNaN(price) ? null : price;
        }

        return null;
    }

    private calculateSuggestedQuantity(item: any): number {
        const currentStock = item.current_quantity || 0;
        const weeklyConsumption = 1; // Simplified - would analyze historical data

        // Suggest enough for 4 weeks
        const suggestedStock = Math.ceil(weeklyConsumption * 4);

        return Math.max(1, suggestedStock - currentStock);
    }

    private calculatePriority(item: any): 'low' | 'normal' | 'high' | 'urgent' {
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

    private generateRecommendationReason(item: any): string {
        const currentStock = item.current_quantity || 0;

        if (currentStock === 0) {
            return `${item.item_name} 已用完，需要立即购买`;
        } else if (currentStock <= 1) {
            return `${item.item_name} 库存严重不足（剩余 ${currentStock}），建议优先购买`;
        } else {
            return `${item.item_name} 库存偏低（剩余 ${currentStock}），建议补充`;
        }
    }
}
