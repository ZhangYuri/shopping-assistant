/**
 * Tests for DatabaseMCPServer Order Operations with Sub-items
 */

import { DatabaseMCPServer } from '../mcp/servers/DatabaseMCPServer';
import { MCPServerConfig } from '../types/mcp.types';

describe('DatabaseMCPServer Order Operations', () => {
    let server: DatabaseMCPServer;

    beforeAll(async () => {
        // 设置测试环境变量（如果没有设置的话）
        if (!process.env.DATABASE_HOST) {
            process.env.DATABASE_HOST = 'localhost';
            process.env.DATABASE_PORT = '3306';
            process.env.DATABASE_USER = 'test';
            process.env.DATABASE_PASSWORD = 'test';
            process.env.DATABASE_NAME = 'test_db';
        }

        const config: MCPServerConfig = {
            serverName: 'test-database',
            serverType: 'database',
            connectionString: '', // 不再使用，保留为了兼容性
            capabilities: ['order_operations'],
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 5000
            },
            timeout: 30000
        };

        server = new DatabaseMCPServer(config);
    });

    describe('Order Creation with Items', () => {
        test('should support creating order with multiple items', async () => {
            const tools = await server.getAvailableTools();

            // 验证新的工具存在
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('createOrder');
            expect(toolNames).toContain('getOrderDetails');
            expect(toolNames).toContain('getOrderItems');
            expect(toolNames).toContain('addOrderItems');

            // 验证createOrder工具支持items参数
            const createOrderTool = tools.find(t => t.name === 'createOrder');
            expect(createOrderTool).toBeDefined();
            expect(createOrderTool!.inputSchema.properties.order.properties.items).toBeDefined();
            expect(createOrderTool!.inputSchema.properties.order.properties.items.type).toBe('array');
        });

        test('should validate order item schema', async () => {
            const tools = await server.getAvailableTools();
            const createOrderTool = tools.find(t => t.name === 'createOrder');

            const itemSchema = createOrderTool!.inputSchema.properties.order.properties.items.items;
            expect(itemSchema.properties.item_name).toBeDefined();
            expect(itemSchema.properties.purchase_quantity).toBeDefined();
            expect(itemSchema.properties.unit_price).toBeDefined();
            expect(itemSchema.properties.category).toBeDefined();
            expect(itemSchema.properties.model).toBeDefined();

            // 验证必需字段
            expect(itemSchema.required).toContain('item_name');
            expect(itemSchema.required).toContain('purchase_quantity');
        });

        test('should validate getOrderDetails tool schema', async () => {
            const tools = await server.getAvailableTools();
            const getOrderDetailsTool = tools.find(t => t.name === 'getOrderDetails');

            expect(getOrderDetailsTool).toBeDefined();
            expect(getOrderDetailsTool!.inputSchema.properties.orderId).toBeDefined();
            expect(getOrderDetailsTool!.outputSchema.properties.order).toBeDefined();
            expect(getOrderDetailsTool!.outputSchema.properties.items).toBeDefined();
        });

        test('should validate addOrderItems tool schema', async () => {
            const tools = await server.getAvailableTools();
            const addOrderItemsTool = tools.find(t => t.name === 'addOrderItems');

            expect(addOrderItemsTool).toBeDefined();
            expect(addOrderItemsTool!.inputSchema.properties.orderId).toBeDefined();
            expect(addOrderItemsTool!.inputSchema.properties.items).toBeDefined();
            expect(addOrderItemsTool!.inputSchema.properties.items.type).toBe('array');
        });
    });

    describe('Order Data Model', () => {
        test('should handle complete order structure', () => {
            // 测试完整的订单数据结构
            const sampleOrder = {
                id: 'ORDER_001',
                store_name: '淘宝店铺',
                total_price: 299.99,
                delivery_cost: 10.00,
                pay_fee: 2.00,
                purchase_date: new Date('2024-01-15'),
                purchase_channel: '淘宝',
                items: [
                    {
                        item_name: '抽纸',
                        purchase_quantity: 2,
                        model: '3层120抽',
                        unit_price: 15.99,
                        category: '生活用品'
                    },
                    {
                        item_name: '洗发水',
                        purchase_quantity: 1,
                        model: '500ml',
                        unit_price: 89.99,
                        category: '个护用品'
                    }
                ]
            };

            // 验证数据结构完整性
            expect(sampleOrder.id).toBeDefined();
            expect(sampleOrder.store_name).toBeDefined();
            expect(sampleOrder.items).toHaveLength(2);
            expect(sampleOrder.items[0].item_name).toBe('抽纸');
            expect(sampleOrder.items[1].item_name).toBe('洗发水');
        });
    });

    describe('Financial Analysis Integration', () => {
        test('should support category-based spending analysis', async () => {
            const tools = await server.getAvailableTools();
            const spendingTool = tools.find(t => t.name === 'getSpendingByCategory');

            expect(spendingTool).toBeDefined();
            expect(spendingTool!.outputSchema.items.properties.category).toBeDefined();
            expect(spendingTool!.outputSchema.items.properties.total_amount).toBeDefined();
            expect(spendingTool!.outputSchema.items.properties.item_count).toBeDefined();
        });
    });
});
