/**
 * Procurement Agent Tests
 */

import { ProcurementAgent } from '@/agents/ProcurementAgent';
import { MCPManager } from '@/mcp/MCPManager';
import { AgentConfig } from '@/types/agent.types';
import * as fc from 'fast-check';

// Mock MCPManager
const mockMCPManager = {
    isServerRegistered: jest.fn(),
    callTool: jest.fn(),
} as unknown as MCPManager;

const mockConfig: AgentConfig = {
    agentId: 'procurement-test',
    agentType: 'procurement',
    name: 'Test Procurement Agent',
    description: 'Test procurement agent',
    capabilities: ['order_import', 'recommendation_generation'],
    retryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 10000,
    },
    maxConcurrentTasks: 5,
    timeoutMs: 30000,
};

describe('ProcurementAgent', () => {
    let agent: ProcurementAgent;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock MCP server availability
        (mockMCPManager.isServerRegistered as jest.Mock).mockImplementation((serverName: string) => {
            return ['database-server', 'file-storage-server'].includes(serverName);
        });

        agent = new ProcurementAgent(mockConfig, mockMCPManager);
    });

    describe('Initialization', () => {
        it('should initialize successfully when MCP servers are available', async () => {
            await expect(agent.initialize()).resolves.not.toThrow();
        });

        it('should throw error when database MCP server is not available', async () => {
            (mockMCPManager.isServerRegistered as jest.Mock).mockImplementation((serverName: string) => {
                return serverName !== 'database-server';
            });

            await expect(agent.initialize()).rejects.toThrow('Database MCP server not available');
        });

        it('should throw error when file storage MCP server is not available', async () => {
            (mockMCPManager.isServerRegistered as jest.Mock).mockImplementation((serverName: string) => {
                return serverName !== 'file-storage-server';
            });

            await expect(agent.initialize()).rejects.toThrow('File Storage MCP server not available');
        });
    });

    describe('Capabilities', () => {
        it('should return correct capabilities', () => {
            const capabilities = agent.getCapabilities();

            expect(capabilities).toHaveLength(3);
            expect(capabilities.map(c => c.name)).toContain('multi_platform_order_import');
            expect(capabilities.map(c => c.name)).toContain('purchase_recommendation_generation');
            expect(capabilities.map(c => c.name)).toContain('shopping_list_management');
        });

        it('should have proper input/output schemas for capabilities', () => {
            const capabilities = agent.getCapabilities();

            capabilities.forEach(capability => {
                expect(capability.inputSchema).toBeDefined();
                expect(capability.outputSchema).toBeDefined();
                expect(capability.description).toBeDefined();
            });
        });
    });

    describe('Order Import', () => {
        beforeEach(() => {
            // Mock successful file metadata call
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            originalName: 'orders.xlsx',
                        },
                    });
                }

                if (serverName === 'file-storage-server' && toolName === 'parseExcelFile') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            sheets: [{
                                name: 'Sheet1',
                                headers: ['订单编号', '商品名称', '实付款', '成交时间', '卖家'],
                                rows: [
                                    ['TB123456789', '测试商品', '¥99.00', '2023-12-01 10:00:00', '测试店铺']
                                ],
                                detectedFormat: 'taobao',
                            }],
                            metadata: {
                                fileName: 'orders.xlsx',
                                totalRows: 1,
                                detectedPlatform: '淘宝',
                                confidence: 0.9,
                            },
                        },
                    });
                }

                if (serverName === 'database-server' && toolName === 'getOrderDetails') {
                    return Promise.resolve({
                        success: false,
                        error: { message: 'Order not found' },
                    });
                }

                if (serverName === 'database-server' && toolName === 'createOrder') {
                    return Promise.resolve({
                        success: true,
                        data: 'TB123456789',
                    });
                }

                return Promise.resolve({ success: false });
            });
        });

        it('should successfully import orders from Excel file', async () => {
            const result = await agent.importOrders('test-file-id', '淘宝');

            expect(result.success).toBe(true);
            expect(result.itemsImported).toBe(1);
            expect(result.duplicatesDetected).toBe(0);
            expect(result.orderId).toBe('TB123456789');
        });

        it('should handle file not found error', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                    return Promise.resolve({
                        success: false,
                        error: { message: 'File not found' },
                    });
                }
                return Promise.resolve({ success: false });
            });

            const result = await agent.importOrders('non-existent-file', '淘宝');

            expect(result.success).toBe(false);
            expect(result.errors).toContain('File not found: non-existent-file');
        });

        it('should handle unsupported file format', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            mimeType: 'text/plain',
                            originalName: 'orders.txt',
                        },
                    });
                }
                return Promise.resolve({ success: false });
            });

            const result = await agent.importOrders('text-file-id', '淘宝');

            expect(result.success).toBe(false);
            expect(result.message).toContain('不支持的文件格式');
        });

        it('should detect duplicate orders', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            originalName: 'orders.xlsx',
                        },
                    });
                }

                if (serverName === 'file-storage-server' && toolName === 'parseExcelFile') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            sheets: [{
                                name: 'Sheet1',
                                headers: ['订单编号', '商品名称', '实付款'],
                                rows: [['TB123456789', '测试商品', '¥99.00']],
                                detectedFormat: 'taobao',
                            }],
                            metadata: {
                                fileName: 'orders.xlsx',
                                totalRows: 1,
                                detectedPlatform: '淘宝',
                                confidence: 0.9,
                            },
                        },
                    });
                }

                if (serverName === 'database-server' && toolName === 'getOrderDetails') {
                    return Promise.resolve({
                        success: true,
                        data: {
                            order: { id: 'TB123456789', store_name: '测试店铺' },
                            items: [],
                        },
                    });
                }

                return Promise.resolve({ success: false });
            });

            const result = await agent.importOrders('duplicate-file-id', '淘宝');

            expect(result.success).toBe(false);
            expect(result.duplicatesDetected).toBe(1);
            expect(result.message).toContain('检测到重复订单');
        });
    });

    describe('Purchase Recommendations', () => {
        beforeEach(() => {
            // Mock database calls for recommendations
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'database-server' && toolName === 'searchInventoryItems') {
                    return Promise.resolve({
                        success: true,
                        data: [
                            {
                                id: 1,
                                item_name: '抽纸',
                                current_quantity: 1,
                                category: '日用品',
                            },
                            {
                                id: 2,
                                item_name: '洗发水',
                                current_quantity: 0,
                                category: '个人护理',
                            },
                        ],
                    });
                }
                return Promise.resolve({ success: true, data: [] });
            });
        });

        it('should generate purchase recommendations for low stock items', async () => {
            const recommendations = await agent.generatePurchaseRecommendations();

            expect(recommendations).toHaveLength(2);

            const urgentItem = recommendations.find(r => r.priority === 'urgent');
            expect(urgentItem).toBeDefined();
            expect(urgentItem?.itemName).toBe('洗发水');

            const highPriorityItem = recommendations.find(r => r.priority === 'high');
            expect(highPriorityItem).toBeDefined();
            expect(highPriorityItem?.itemName).toBe('抽纸');
        });

        it('should return empty array when no low stock items', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation(() => {
                return Promise.resolve({ success: true, data: [] });
            });

            const recommendations = await agent.generatePurchaseRecommendations();

            expect(recommendations).toHaveLength(0);
        });
    });

    describe('Shopping List Management', () => {
        beforeEach(() => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'database-server' && toolName === 'addToShoppingList') {
                    return Promise.resolve({ success: true, data: '1' });
                }
                if (serverName === 'database-server' && toolName === 'updateShoppingListItem') {
                    return Promise.resolve({ success: true, data: true });
                }
                if (serverName === 'database-server' && toolName === 'removeFromShoppingList') {
                    return Promise.resolve({ success: true, data: true });
                }
                return Promise.resolve({ success: false });
            });
        });

        it('should add item to shopping list', async () => {
            const result = await agent.manageTodoList(
                { type: 'add' },
                { item_name: '牛奶', suggested_quantity: 2, priority: 3 }
            );

            expect(result).toBe(true);
            expect(mockMCPManager.callTool).toHaveBeenCalledWith(
                'database-server',
                'addToShoppingList',
                expect.objectContaining({
                    item: expect.objectContaining({
                        item_name: '牛奶',
                        suggested_quantity: 2,
                        priority: 3,
                    }),
                })
            );
        });

        it('should update shopping list item', async () => {
            const result = await agent.manageTodoList(
                { type: 'update', itemId: '1' },
                { item_name: '牛奶', status: 'completed' }
            );

            expect(result).toBe(true);
            expect(mockMCPManager.callTool).toHaveBeenCalledWith(
                'database-server',
                'updateShoppingListItem',
                expect.objectContaining({
                    id: '1',
                    updates: expect.objectContaining({
                        item_name: '牛奶',
                        status: 'completed',
                    }),
                })
            );
        });

        it('should remove item from shopping list', async () => {
            const result = await agent.manageTodoList(
                { type: 'remove', itemId: '1' }
            );

            expect(result).toBe(true);
            expect(mockMCPManager.callTool).toHaveBeenCalledWith(
                'database-server',
                'removeFromShoppingList',
                expect.objectContaining({
                    id: '1',
                })
            );
        });

        it('should complete shopping list item', async () => {
            const result = await agent.manageTodoList(
                { type: 'complete', itemId: '1' }
            );

            expect(result).toBe(true);
            expect(mockMCPManager.callTool).toHaveBeenCalledWith(
                'database-server',
                'updateShoppingListItem',
                expect.objectContaining({
                    id: '1',
                    updates: expect.objectContaining({
                        status: 'completed',
                    }),
                })
            );
        });

        it('should handle missing item data for add action', async () => {
            const result = await agent.manageTodoList({ type: 'add' });

            expect(result).toBe(false);
        });

        it('should handle missing item ID for update action', async () => {
            const result = await agent.manageTodoList(
                { type: 'update' },
                { item_name: '牛奶' }
            );

            expect(result).toBe(false);
        });
    });

    describe('Purchase Pattern Analysis', () => {
        beforeEach(() => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'database-server' && toolName === 'getOrderHistory') {
                    return Promise.resolve({
                        success: true,
                        data: [
                            {
                                id: 'ORDER1',
                                store_name: '测试店铺',
                                total_price: 100.00,
                                purchase_date: new Date('2023-12-01'),
                            },
                            {
                                id: 'ORDER2',
                                store_name: '另一个店铺',
                                total_price: 200.00,
                                purchase_date: new Date('2023-11-15'),
                            },
                        ],
                    });
                }
                return Promise.resolve({ success: true, data: [] });
            });
        });

        it('should analyze purchase patterns successfully', async () => {
            const analysis = await agent.analyzePurchasePatterns();

            expect(analysis.totalSpending).toBe(300.00);
            expect(analysis.averageOrderValue).toBe(150.00);
            expect(analysis.recommendations).toContain('过去一年总支出: ¥300.00');
            expect(analysis.recommendations).toContain('平均订单金额: ¥150.00');
        });

        it('should handle empty order history', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation(() => {
                return Promise.resolve({ success: true, data: [] });
            });

            const analysis = await agent.analyzePurchasePatterns();

            expect(analysis.totalSpending).toBe(0);
            expect(analysis.averageOrderValue).toBe(0);
            expect(analysis.recommendations).toContain('建议增加购买记录以获得更好的分析结果');
        });
    });

    describe('Purchase Timing Optimization', () => {
        it('should optimize purchase timing for items', async () => {
            const items = ['牛奶', '面包', '鸡蛋'];
            const recommendations = await agent.optimizePurchaseTiming(items);

            expect(recommendations).toHaveLength(3);

            recommendations.forEach(rec => {
                expect(rec.itemName).toBeDefined();
                expect(rec.optimalTiming).toBeInstanceOf(Date);
                expect(rec.reason).toBeDefined();
                expect(rec.confidence).toBeGreaterThan(0);
                expect(rec.priceFactors).toBeInstanceOf(Array);
            });
        });

        it('should handle empty items array', async () => {
            const recommendations = await agent.optimizePurchaseTiming([]);

            expect(recommendations).toHaveLength(0);
        });
    });

    describe('Property-Based Tests', () => {
        /**
         * **Feature: shopping-assistant-agents, Property 7: Duplicate data detection**
         * **Validates: Requirements 4.4**
         *
         * For any imported order data, the system should detect and prevent the creation of duplicate entries.
         */
        test('Property 7: Duplicate data detection', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generator for order data that could be duplicated
                    fc.record({
                        orderId: fc.stringOf(fc.char().filter(c => /[A-Z0-9]/.test(c)), { minLength: 8, maxLength: 20 })
                            .filter(s => s.trim().length >= 8),
                        storeName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9\u4e00-\u9fff]/.test(c)), { minLength: 2, maxLength: 30 })
                            .filter(s => s.trim().length >= 2),
                        totalPrice: fc.float({ min: Math.fround(1.0), max: Math.fround(10000), noNaN: true }),
                        platform: fc.constantFrom('淘宝', '1688', '京东', '抖音商城', '中免日上', '拼多多'),
                        items: fc.array(
                            fc.record({
                                itemName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9\u4e00-\u9fff]/.test(c)), { minLength: 2, maxLength: 50 })
                                    .filter(s => s.trim().length >= 2),
                                quantity: fc.integer({ min: 1, max: 100 }),
                                unitPrice: fc.option(fc.float({ min: Math.fround(1.0), max: Math.fround(1000), noNaN: true }), { nil: undefined })
                            }),
                            { minLength: 1, maxLength: 3 }
                        )
                    }),
                    async (orderData) => {
                        // Create mock Excel data for the order
                        const mockExcelData = createMockExcelDataForPlatform(orderData.platform, orderData);

                        // Track whether we're in the first or second import call
                        let isFirstImport = true;
                        let createOrderCallCount = 0;

                        // Mock implementation that handles both first and second import
                        (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                            if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                                return Promise.resolve({
                                    success: true,
                                    data: {
                                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        originalName: `${orderData.platform}_orders.xlsx`,
                                    },
                                });
                            }

                            if (serverName === 'file-storage-server' && toolName === 'parseExcelFile') {
                                return Promise.resolve({
                                    success: true,
                                    data: mockExcelData,
                                });
                            }

                            if (serverName === 'database-server' && toolName === 'getOrderDetails') {
                                if (isFirstImport) {
                                    // First call: order doesn't exist
                                    return Promise.resolve({
                                        success: false,
                                        error: { message: 'Order not found' },
                                    });
                                } else {
                                    // Second call: order exists (duplicate detected)
                                    return Promise.resolve({
                                        success: true,
                                        data: {
                                            order: {
                                                id: orderData.orderId,
                                                store_name: orderData.storeName,
                                                total_price: orderData.totalPrice,
                                                purchase_channel: orderData.platform,
                                            },
                                            items: orderData.items.map(item => ({
                                                item_name: item.itemName,
                                                purchase_quantity: item.quantity,
                                                unit_price: item.unitPrice,
                                            })),
                                        },
                                    });
                                }
                            }

                            if (serverName === 'database-server' && toolName === 'createOrder') {
                                createOrderCallCount++;
                                if (isFirstImport) {
                                    return Promise.resolve({
                                        success: true,
                                        data: orderData.orderId,
                                    });
                                } else {
                                    // Should not reach here for duplicate
                                    throw new Error('createOrder should not be called for duplicate orders');
                                }
                            }

                            return Promise.resolve({ success: false });
                        });

                        // First import should succeed
                        const firstImportResult = await agent.importOrders('test-file-id-1', orderData.platform);

                        // Property assertion: First import should succeed
                        if (!firstImportResult.success) {
                            console.log('First import failed:', firstImportResult.message, firstImportResult.errors);
                            console.log('Order data:', JSON.stringify(orderData, null, 2));
                            console.log('Mock Excel data:', JSON.stringify(mockExcelData, null, 2));
                        }
                        expect(firstImportResult.success).toBe(true);
                        expect(firstImportResult.duplicatesDetected).toBe(0);
                        expect(firstImportResult.orderId).toBe(orderData.orderId);

                        // Switch to second import mode
                        isFirstImport = false;

                        // Second import should detect duplicate and fail
                        const secondImportResult = await agent.importOrders('test-file-id-2', orderData.platform);

                        // Property assertions: Duplicate detection should work
                        expect(secondImportResult.success).toBe(false);
                        expect(secondImportResult.duplicatesDetected).toBe(1);
                        expect(secondImportResult.itemsImported).toBe(0);
                        expect(secondImportResult.message).toContain('检测到重复订单');
                        expect(secondImportResult.message).toContain(orderData.orderId);
                        expect(secondImportResult.errors).toContain(`Duplicate order detected: ${orderData.orderId}`);

                        // Verify that createOrder was only called once (for the first import)
                        expect(createOrderCallCount).toBe(1);
                    }
                ),
                { numRuns: 100 }
            );
        });

        /**
         * **Feature: shopping-assistant-agents, Property 6: Multi-platform data standardization**
         * **Validates: Requirements 4.1, 4.2, 4.3**
         *
         * For any order data from supported platforms, the system should convert it to a unified
         * internal format and correctly update related records.
         */
        test('Property 6: Multi-platform data standardization', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generator for multi-platform order data
                    fc.record({
                        platform: fc.constantFrom('淘宝', '1688', '京东', '抖音商城', '中免日上', '拼多多'),
                        orderData: fc.record({
                            orderId: fc.stringOf(fc.char().filter(c => /[A-Z0-9]/.test(c)), { minLength: 8, maxLength: 20 })
                                .filter(s => s.trim().length >= 8),
                            storeName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9\u4e00-\u9fff]/.test(c)), { minLength: 2, maxLength: 30 })
                                .filter(s => s.trim().length >= 2),
                            totalPrice: fc.float({ min: Math.fround(1.0), max: Math.fround(10000), noNaN: true }),
                            items: fc.array(
                                fc.record({
                                    itemName: fc.stringOf(fc.char().filter(c => /[a-zA-Z0-9\u4e00-\u9fff]/.test(c)), { minLength: 2, maxLength: 50 })
                                        .filter(s => s.trim().length >= 2),
                                    quantity: fc.integer({ min: 1, max: 100 }),
                                    unitPrice: fc.option(fc.float({ min: Math.fround(1.0), max: Math.fround(1000), noNaN: true }), { nil: undefined })
                                }),
                                { minLength: 1, maxLength: 5 }
                            )
                        })
                    }),
                    async (testData) => {
                        // Mock file storage MCP to return platform-specific Excel data
                        const mockExcelData = createMockExcelDataForPlatform(testData.platform, testData.orderData);

                        (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string, params: any) => {
                            if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                                return Promise.resolve({
                                    success: true,
                                    data: {
                                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                        originalName: `${testData.platform}_orders.xlsx`,
                                    },
                                });
                            }

                            if (serverName === 'file-storage-server' && toolName === 'parseExcelFile') {
                                return Promise.resolve({
                                    success: true,
                                    data: mockExcelData,
                                });
                            }

                            if (serverName === 'database-server' && toolName === 'getOrderDetails') {
                                return Promise.resolve({
                                    success: false,
                                    error: { message: 'Order not found' },
                                });
                            }

                            if (serverName === 'database-server' && toolName === 'createOrder') {
                                return Promise.resolve({
                                    success: true,
                                    data: testData.orderData.orderId,
                                });
                            }

                            return Promise.resolve({ success: false });
                        });

                        // Test the import process
                        const result = await agent.importOrders('test-file-id', testData.platform);

                        // Property assertions: Data should be successfully standardized
                        if (!result.success) {
                            console.log('Import failed:', result.message, result.errors);
                            console.log('Test data:', JSON.stringify(testData, null, 2));
                        }
                        expect(result.success).toBe(true);
                        expect(result.orderId).toBe(testData.orderData.orderId);
                        expect(result.itemsImported).toBe(testData.orderData.items.length);
                        expect(result.duplicatesDetected).toBe(0);

                        // Verify that the normalized data maintains essential information
                        expect(result.normalizedData).toBeDefined();
                        expect(result.normalizedData?.platform).toBe(testData.platform);
                        expect(result.normalizedData?.order.id).toBe(testData.orderData.orderId);
                        expect(result.normalizedData?.order.store_name).toBe(testData.orderData.storeName);
                        expect(result.normalizedData?.order.total_price).toBeCloseTo(testData.orderData.totalPrice, 2);
                        expect(result.normalizedData?.order.purchase_channel).toBe(testData.platform);

                        // Verify items are correctly normalized
                        if (result.normalizedData?.order.items) {
                            expect(result.normalizedData.order.items).toHaveLength(testData.orderData.items.length);

                            result.normalizedData.order.items.forEach((normalizedItem, index) => {
                                const originalItem = testData.orderData.items[index];
                                expect(normalizedItem.item_name).toBe(originalItem.itemName);
                                expect(normalizedItem.purchase_quantity).toBe(originalItem.quantity);
                                if (originalItem.unitPrice !== undefined) {
                                    expect(normalizedItem.unit_price).toBeCloseTo(originalItem.unitPrice, 2);
                                }
                            });
                        }

                        // Verify confidence score is reasonable
                        expect(result.normalizedData?.confidence).toBeGreaterThan(0);
                        expect(result.normalizedData?.confidence).toBeLessThanOrEqual(1);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });
});

// Helper function to create mock Excel data for different platforms
function createMockExcelDataForPlatform(platform: string, orderData: any): any {
    const platformMappings: Record<string, { headers: string[], rowMapper: (data: any) => any[][] }> = {
        '淘宝': {
            headers: ['订单编号', '商品名称', '实付款', '交易状态', '成交时间', '卖家', '数量', '单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '交易成功',
                        '2023-12-01 10:00:00',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        },
        '1688': {
            headers: ['订单号', '产品名称', '订单金额', '下单时间', '供应商', '采购数量', '单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '2023-12-01 10:00:00',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        },
        '京东': {
            headers: ['订单号', '商品名称', '订单金额', '下单时间', '商家', '数量', '单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '2023-12-01 10:00:00',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        },
        '抖音商城': {
            headers: ['订单编号', '商品标题', '实付金额', '下单时间', '店铺名称', '购买数量', '商品单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '2023-12-01 10:00:00',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        },
        '中免日上': {
            headers: ['订单号', '商品名称', '订单总额', '下单日期', '商户', '数量', '单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '2023-12-01',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        },
        '拼多多': {
            headers: ['订单编号', '商品名称', '实付金额', '订单状态', '成团时间', '店铺名称', '商品数量', '商品单价'],
            rowMapper: (data) => {
                const rows: any[][] = [];
                for (const item of data.items) {
                    rows.push([
                        data.orderId,
                        item.itemName,
                        `¥${data.totalPrice}`,
                        '已完成',
                        '2023-12-01 10:00:00',
                        data.storeName,
                        item.quantity,
                        item.unitPrice ? `¥${item.unitPrice}` : '¥99.00'
                    ]);
                }
                return rows;
            }
        }
    };

    const mapping = platformMappings[platform];
    if (!mapping) {
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const rows = mapping.rowMapper(orderData);

    return {
        sheets: [{
            name: 'Sheet1',
            headers: mapping.headers,
            rows: rows,
            detectedFormat: platform.toLowerCase(),
        }],
        metadata: {
            fileName: `${platform}_orders.xlsx`,
            totalRows: rows.length,
            detectedPlatform: platform,
            confidence: 0.9,
        },
    };
}
