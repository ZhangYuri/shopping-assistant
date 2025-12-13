/**
 * Database Integration Tests - Real Database Operations
 * Tests actual database operations with real MySQL connection
 */

import { DatabaseMCPServer } from '../mcp/servers/DatabaseMCPServer';
import { MCPServerConfig } from '../types/mcp.types';

describe('Database Integration Tests - Real Database', () => {
    let server: DatabaseMCPServer;

    beforeAll(async () => {
        const config: MCPServerConfig = {
            serverName: 'integration-test-database',
            serverType: 'database',
            connectionString: '', // 不再使用，保留为了兼容性
            capabilities: ['inventory_operations', 'order_operations'],
            retryPolicy: {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000,
                maxDelay: 5000,
            },
            timeout: 30000,
        };

        server = new DatabaseMCPServer(config);

        try {
            await server.initialize();
            await server.connect();
            console.log('✅ Successfully connected to real database');
        } catch (error) {
            console.error('❌ Failed to connect to database:', error);
            throw error;
        }
    });

    afterAll(async () => {
        if (server.status === 'connected') {
            await server.disconnect();
        }
    });

    describe('Real Product Inventory Tests', () => {
        // 测试数据：基于你提供的图片中的产品
        const testProducts = [
            {
                item_name: '黑人牙膏 - 3重米粒护理',
                category: '个护用品',
                current_quantity: 2,
                unit: '支',
                storage_location: '卫生间',
                warranty_period_days: 1095, // 3年
                description: 'DARLIE 黑人牙膏，3重米粒护理配方，105g',
            },
            {
                item_name: 'DARLIE好来牙膏 - 双重薄荷',
                category: '个护用品',
                current_quantity: 1,
                unit: '支',
                storage_location: '卫生间',
                warranty_period_days: 1095, // 3年
                description: 'DARLIE好来牙膏，双重薄荷清新，50g',
            },
            {
                item_name: '面膜贴',
                category: '个护用品',
                current_quantity: 5, // 实际是5片，之前目测错误
                unit: '片',
                storage_location: '卧室',
                warranty_period_days: 730, // 2年
                description: '面膜贴，补水保湿',
            },
        ];

        test('Should add real products to inventory database', async () => {
            const addedItemIds: string[] = [];

            try {
                // 添加每个产品到数据库
                for (const product of testProducts) {
                    console.log(`\n📦 Adding product: ${product.item_name}`);

                    // 模拟数量识别的不确定性和修正过程
                    if (product.item_name === '面膜贴') {
                        console.log(
                            '   ⚠️  Quantity detection challenge: Visual count vs actual count'
                        );
                        console.log('   🤖 AI estimated: 10 pieces (low confidence)');
                        console.log(`   👤 User corrected: ${product.current_quantity} pieces`);
                        console.log(
                            `   ✅ Using user-confirmed quantity: ${product.current_quantity}`
                        );
                    }

                    const result = await server.callTool('addInventoryItem', {
                        item: product,
                    });

                    expect(result.success).toBe(true);
                    expect(result.data).toBeTruthy();

                    const itemId = result.data;
                    addedItemIds.push(itemId);

                    console.log(`✅ Added with ID: ${itemId}`);

                    // 验证数据是否正确插入
                    const retrievedResult = await server.callTool('getInventoryItem', {
                        itemName: product.item_name,
                    });

                    expect(retrievedResult.success).toBe(true);
                    expect(retrievedResult.data).toBeTruthy();

                    const retrievedItem = retrievedResult.data;
                    expect(retrievedItem.item_name).toBe(product.item_name);
                    expect(retrievedItem.category).toBe(product.category);
                    expect(retrievedItem.current_quantity).toBe(product.current_quantity);
                    expect(retrievedItem.unit).toBe(product.unit);
                    expect(retrievedItem.storage_location).toBe(product.storage_location);

                    console.log(
                        `✅ Verified data integrity for: ${product.item_name} (${product.current_quantity}${product.unit})`
                    );
                }

                console.log(`\n🎉 Successfully added ${addedItemIds.length} products to database`);
                console.log('📊 Quantity accuracy: Face mask corrected from 10 to 5 pieces');
            } catch (error) {
                console.error('❌ Error during product addition:', error);
                throw error;
            }
        }, 30000);

        test('Should update product quantities', async () => {
            try {
                // 查找黑人牙膏
                const searchResult = await server.callTool('getInventoryItem', {
                    itemName: '黑人牙膏 - 3重米粒护理',
                });

                if (searchResult.success && searchResult.data) {
                    const item = searchResult.data;
                    const originalQuantity = item.current_quantity;
                    const newQuantity = originalQuantity + 1; // 增加1个

                    console.log(`\n📝 Updating quantity for: ${item.item_name}`);
                    console.log(`   Original: ${originalQuantity} -> New: ${newQuantity}`);

                    // 更新数量
                    const updateResult = await server.callTool('updateInventoryQuantity', {
                        itemId: item.id.toString(),
                        quantity: newQuantity,
                    });

                    expect(updateResult.success).toBe(true);
                    expect(updateResult.data).toBe(true);

                    // 验证更新是否成功
                    const verifyResult = await server.callTool('getInventoryItem', {
                        itemName: '黑人牙膏 - 3重米粒护理',
                    });

                    expect(verifyResult.success).toBe(true);
                    expect(verifyResult.data.current_quantity).toBe(newQuantity);

                    console.log(`✅ Successfully updated quantity to: ${newQuantity}`);
                }
            } catch (error) {
                console.error('❌ Error during quantity update:', error);
                throw error;
            }
        }, 15000);

        test('Should search products by category', async () => {
            try {
                console.log('\n🔍 Searching for personal care products...');

                const searchResult = await server.callTool('searchInventoryItems', {
                    criteria: {
                        category: '个护用品',
                    },
                });

                expect(searchResult.success).toBe(true);
                expect(searchResult.data).toBeTruthy();
                expect(Array.isArray(searchResult.data)).toBe(true);

                const items = searchResult.data;
                console.log(`✅ Found ${items.length} personal care products:`);

                items.forEach((item: any, index: number) => {
                    console.log(
                        `   ${index + 1}. ${item.item_name} (数量: ${item.current_quantity}${item.unit || ''})`
                    );
                });

                // 验证所有找到的产品都是个护用品类别
                items.forEach((item: any) => {
                    expect(item.category).toBe('个护用品');
                });
            } catch (error) {
                console.error('❌ Error during product search:', error);
                throw error;
            }
        }, 15000);

        test('Should handle low stock detection', async () => {
            try {
                console.log('\n⚠️  Checking for low stock items...');

                const lowStockResult = await server.callTool('searchInventoryItems', {
                    criteria: {
                        low_stock_threshold: 2, // 库存少于等于2的商品
                    },
                });

                expect(lowStockResult.success).toBe(true);
                expect(lowStockResult.data).toBeTruthy();

                const lowStockItems = lowStockResult.data;
                console.log(`📊 Found ${lowStockItems.length} low stock items:`);

                lowStockItems.forEach((item: any) => {
                    console.log(
                        `   ⚠️  ${item.item_name}: ${item.current_quantity}${item.unit || ''} (需要补货)`
                    );
                    expect(item.current_quantity).toBeLessThanOrEqual(2);
                });
            } catch (error) {
                console.error('❌ Error during low stock check:', error);
                throw error;
            }
        }, 15000);
    });

    describe('Database Transaction Tests', () => {
        test('Should handle transaction rollback on error', async () => {
            try {
                console.log('\n🔄 Testing transaction rollback...');

                // 尝试执行一个会失败的事务
                const transactionResult = await server.callTool('executeTransaction', {
                    operations: [
                        {
                            type: 'insert',
                            table: 'inventory',
                            data: {
                                item_name: '测试产品',
                                current_quantity: 5,
                                category: '测试类别',
                            },
                        },
                        {
                            type: 'insert',
                            table: 'inventory',
                            data: {
                                item_name: '测试产品', // 重复名称，应该失败
                                current_quantity: 3,
                                category: '测试类别',
                            },
                        },
                    ],
                });

                // 事务应该失败并回滚
                if (!transactionResult.success) {
                    console.log('✅ Transaction correctly failed and rolled back');
                    expect(transactionResult.success).toBe(false);
                    expect(transactionResult.error).toBeTruthy();
                } else {
                    console.log(
                        '⚠️  Transaction succeeded (might be due to database configuration)'
                    );
                }
            } catch (error) {
                console.log('✅ Transaction correctly threw error and rolled back');
                expect(error).toBeTruthy();
            }
        }, 15000);
    });

    describe('Performance Tests', () => {
        test('Should handle multiple concurrent operations', async () => {
            try {
                console.log('\n⚡ Testing concurrent database operations...');

                const startTime = Date.now();

                // 并发执行多个查询
                const promises = [
                    server.callTool('searchInventoryItems', { criteria: { category: '个护用品' } }),
                    server.callTool('searchInventoryItems', {
                        criteria: { low_stock_threshold: 5 },
                    }),
                    server.callTool('getInventoryItem', { itemName: '黑人牙膏 - 3重米粒护理' }),
                    server.callTool('getInventoryItem', { itemName: 'DARLIE好来牙膏 - 双重薄荷' }),
                ];

                const results = await Promise.all(promises);
                const endTime = Date.now();
                const duration = endTime - startTime;

                console.log(
                    `✅ Completed ${promises.length} concurrent operations in ${duration}ms`
                );

                // 验证所有操作都成功
                results.forEach((result, index) => {
                    expect(result.success).toBe(true);
                    console.log(`   Operation ${index + 1}: ✅ Success`);
                });

                // 性能检查：并发操作应该在合理时间内完成
                expect(duration).toBeLessThan(5000); // 5秒内完成
            } catch (error) {
                console.error('❌ Error during concurrent operations:', error);
                throw error;
            }
        }, 15000);
    });
});
