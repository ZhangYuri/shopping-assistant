/**
 * Database Tools
 * DynamicTool implementations for database operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { DatabaseService } from '@/services/DatabaseService';
import { Logger } from '@/utils/Logger';

const logger = new Logger({
    component: 'DatabaseTools',
    level: 'info'
});

const databaseService = DatabaseService.getInstance();

// Inventory-related tools

export const getInventoryItemTool = new DynamicTool({
    name: 'get_inventory_item',
    description: '根据物品名称查询库存信息。输入: {"itemName": "物品名称"}',
    func: async (input: string) => {
        try {
            const { itemName } = JSON.parse(input);

            if (!itemName) {
                return JSON.stringify({
                    success: false,
                    error: '物品名称不能为空'
                });
            }

            const result = await databaseService.query(
                'SELECT * FROM inventory WHERE item_name LIKE ?',
                [`%${itemName}%`]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data,
                count: Array.isArray(result.data) ? result.data.length : 0
            });

        } catch (error) {
            logger.error('Failed to get inventory item', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const updateInventoryItemTool = new DynamicTool({
    name: 'update_inventory_item',
    description: '更新库存物品数量。输入: {"itemName": "物品名称", "quantityChange": 数量变化(正数为增加，负数为减少), "unit": "单位"}',
    func: async (input: string) => {
        try {
            const { itemName, quantityChange, unit } = JSON.parse(input);

            if (!itemName || quantityChange === undefined) {
                return JSON.stringify({
                    success: false,
                    error: '物品名称和数量变化不能为空'
                });
            }

            const result = await databaseService.transaction(async (connection) => {
                // First, check if item exists
                const [existingItems] = await connection.execute(
                    'SELECT * FROM inventory WHERE item_name = ?',
                    [itemName]
                );

                if (Array.isArray(existingItems) && existingItems.length > 0) {
                    // Update existing item
                    const currentItem = existingItems[0] as any;
                    const newQuantity = Math.max(0, currentItem.current_quantity + quantityChange);

                    await connection.execute(
                        'UPDATE inventory SET current_quantity = ?, unit = COALESCE(?, unit), updated_at = CURRENT_TIMESTAMP WHERE item_name = ?',
                        [newQuantity, unit, itemName]
                    );

                    return {
                        action: 'updated',
                        itemName,
                        previousQuantity: currentItem.current_quantity,
                        newQuantity,
                        quantityChange
                    };
                } else {
                    // Create new item if it doesn't exist and quantityChange is positive
                    if (quantityChange > 0) {
                        await connection.execute(
                            'INSERT INTO inventory (item_name, current_quantity, unit, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                            [itemName, quantityChange, unit || '个']
                        );

                        return {
                            action: 'created',
                            itemName,
                            newQuantity: quantityChange,
                            quantityChange
                        };
                    } else {
                        throw new Error(`物品 "${itemName}" 不存在，无法减少库存`);
                    }
                }
            });

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data
            });

        } catch (error) {
            logger.error('Failed to update inventory item', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const addInventoryItemTool = new DynamicTool({
    name: 'add_inventory_item',
    description: '添加新的库存物品。输入: {"itemName": "物品名称", "quantity": 数量, "unit": "单位", "category": "分类", "storageLocation": "存储位置", "expiryDate": "过期日期(YYYY-MM-DD)", "productionDate": "生产日期(YYYY-MM-DD)"}',
    func: async (input: string) => {
        try {
            const {
                itemName,
                quantity,
                unit,
                category,
                storageLocation,
                expiryDate,
                productionDate
            } = JSON.parse(input);

            if (!itemName || quantity === undefined) {
                return JSON.stringify({
                    success: false,
                    error: '物品名称和数量不能为空'
                });
            }

            const result = await databaseService.query(
                `INSERT INTO inventory
                (item_name, current_quantity, unit, category, storage_location, expiry_date, production_date, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                current_quantity = current_quantity + VALUES(current_quantity),
                unit = COALESCE(VALUES(unit), unit),
                category = COALESCE(VALUES(category), category),
                storage_location = COALESCE(VALUES(storage_location), storage_location),
                expiry_date = COALESCE(VALUES(expiry_date), expiry_date),
                production_date = COALESCE(VALUES(production_date), production_date),
                updated_at = CURRENT_TIMESTAMP`,
                [itemName, quantity, unit || '个', category, storageLocation, expiryDate, productionDate]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    itemName,
                    quantity,
                    unit: unit || '个',
                    category,
                    insertId: result.insertId
                }
            });

        } catch (error) {
            logger.error('Failed to add inventory item', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const checkInventoryThresholdsTool = new DynamicTool({
    name: 'check_inventory_thresholds',
    description: '检查库存阈值，返回低于指定阈值的物品。输入: {"thresholds": {"分类": 阈值数量}} 或 {"defaultThreshold": 默认阈值}',
    func: async (input: string) => {
        try {
            const { thresholds, defaultThreshold = 5 } = JSON.parse(input);

            const result = await databaseService.query(
                'SELECT * FROM inventory WHERE current_quantity > 0 ORDER BY category, item_name'
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            const lowStockItems: any[] = [];
            const items = result.data as any[];

            for (const item of items) {
                const threshold = thresholds?.[item.category] || defaultThreshold;
                if (item.current_quantity <= threshold) {
                    lowStockItems.push({
                        ...item,
                        threshold,
                        shortfall: threshold - item.current_quantity + 1
                    });
                }
            }

            return JSON.stringify({
                success: true,
                data: {
                    lowStockItems,
                    totalItems: items.length,
                    lowStockCount: lowStockItems.length
                }
            });

        } catch (error) {
            logger.error('Failed to check inventory thresholds', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Order-related tools

export const importOrdersTool = new DynamicTool({
    name: 'import_orders',
    description: '导入订单数据到数据库。输入: {"orders": [订单数组], "platform": "平台名称"}',
    func: async (input: string) => {
        try {
            const { orders, platform } = JSON.parse(input);

            if (!orders || !Array.isArray(orders)) {
                return JSON.stringify({
                    success: false,
                    error: '订单数据必须是数组格式'
                });
            }

            const result = await databaseService.transaction(async (connection) => {
                const importedOrders: any[] = [];
                const skippedOrders: any[] = [];

                for (const order of orders) {
                    try {
                        // Check if order already exists
                        const [existingOrders] = await connection.execute(
                            'SELECT id FROM purchase_history WHERE id = ?',
                            [order.id]
                        );

                        if (Array.isArray(existingOrders) && existingOrders.length > 0) {
                            skippedOrders.push({
                                id: order.id,
                                reason: '订单已存在'
                            });
                            continue;
                        }

                        // Insert main order
                        await connection.execute(
                            `INSERT INTO purchase_history
                            (id, store_name, total_price, delivery_cost, pay_fee, purchase_date, purchase_channel, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            [
                                order.id,
                                order.store_name,
                                order.total_price,
                                order.delivery_cost,
                                order.pay_fee,
                                order.purchase_date,
                                platform
                            ]
                        );

                        // Insert order items if provided
                        if (order.items && Array.isArray(order.items)) {
                            for (const item of order.items) {
                                await connection.execute(
                                    `INSERT INTO purchase_sub_list
                                    (parent_id, item_name, purchase_quantity, model, unit_price, category, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                    [
                                        order.id,
                                        item.item_name,
                                        item.purchase_quantity || 1,
                                        item.model,
                                        item.unit_price,
                                        item.category
                                    ]
                                );
                            }
                        }

                        importedOrders.push(order.id);

                    } catch (orderError) {
                        skippedOrders.push({
                            id: order.id,
                            reason: orderError instanceof Error ? orderError.message : String(orderError)
                        });
                    }
                }

                return {
                    importedCount: importedOrders.length,
                    skippedCount: skippedOrders.length,
                    importedOrders,
                    skippedOrders,
                    platform
                };
            });

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data
            });

        } catch (error) {
            logger.error('Failed to import orders', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getOrderHistoryTool = new DynamicTool({
    name: 'get_order_history',
    description: '查询订单历史。输入: {"limit": 限制数量, "offset": 偏移量, "platform": "平台筛选", "startDate": "开始日期", "endDate": "结束日期"}',
    func: async (input: string) => {
        try {
            const {
                limit = 50,
                offset = 0,
                platform,
                startDate,
                endDate
            } = JSON.parse(input);

            let whereClause = '1=1';
            const params: any[] = [];

            if (platform) {
                whereClause += ' AND purchase_channel = ?';
                params.push(platform);
            }

            if (startDate) {
                whereClause += ' AND purchase_date >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND purchase_date <= ?';
                params.push(endDate);
            }

            const result = await databaseService.query(
                `SELECT ph.*,
                GROUP_CONCAT(
                    CONCAT(psl.item_name, '(', psl.purchase_quantity, psl.model, ')')
                    SEPARATOR ', '
                ) as items
                FROM purchase_history ph
                LEFT JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                WHERE ${whereClause}
                GROUP BY ph.id
                ORDER BY ph.purchase_date DESC, ph.created_at DESC
                LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data,
                count: Array.isArray(result.data) ? result.data.length : 0
            });

        } catch (error) {
            logger.error('Failed to get order history', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Shopping list tools

export const addToShoppingListTool = new DynamicTool({
    name: 'add_to_shopping_list',
    description: '添加物品到购物清单。输入: {"itemName": "物品名称", "suggestedQuantity": 建议数量, "priority": 优先级(1-5), "reason": "添加原因"}',
    func: async (input: string) => {
        try {
            const {
                itemName,
                suggestedQuantity = 1,
                priority = 1,
                reason
            } = JSON.parse(input);

            if (!itemName) {
                return JSON.stringify({
                    success: false,
                    error: '物品名称不能为空'
                });
            }

            const result = await databaseService.query(
                `INSERT INTO shopping_list (item_name, suggested_quantity, priority, reason, added_date)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                suggested_quantity = VALUES(suggested_quantity),
                priority = VALUES(priority),
                reason = VALUES(reason),
                status = 'pending',
                added_date = CURRENT_TIMESTAMP`,
                [itemName, suggestedQuantity, priority, reason]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    itemName,
                    suggestedQuantity,
                    priority,
                    reason,
                    insertId: result.insertId
                }
            });

        } catch (error) {
            logger.error('Failed to add to shopping list', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getShoppingListTool = new DynamicTool({
    name: 'get_shopping_list',
    description: '获取购物清单。输入: {"status": "状态筛选(pending/completed)", "priority": "优先级筛选"}',
    func: async (input: string) => {
        try {
            const { status, priority } = JSON.parse(input);

            let whereClause = '1=1';
            const params: any[] = [];

            if (status) {
                whereClause += ' AND status = ?';
                params.push(status);
            }

            if (priority) {
                whereClause += ' AND priority = ?';
                params.push(priority);
            }

            const result = await databaseService.query(
                `SELECT * FROM shopping_list
                WHERE ${whereClause}
                ORDER BY priority DESC, added_date ASC`,
                params
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data,
                count: Array.isArray(result.data) ? result.data.length : 0
            });

        } catch (error) {
            logger.error('Failed to get shopping list', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const updateShoppingListItemTool = new DynamicTool({
    name: 'update_shopping_list_item',
    description: '更新购物清单项目状态。输入: {"itemId": 项目ID, "status": "新状态", "completedDate": "完成日期"}',
    func: async (input: string) => {
        try {
            const { itemId, status, completedDate } = JSON.parse(input);

            if (!itemId || !status) {
                return JSON.stringify({
                    success: false,
                    error: '项目ID和状态不能为空'
                });
            }

            const result = await databaseService.query(
                'UPDATE shopping_list SET status = ?, completed_date = ? WHERE id = ?',
                [status, completedDate || (status === 'completed' ? new Date() : null), itemId]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    itemId,
                    status,
                    affectedRows: result.affectedRows
                }
            });

        } catch (error) {
            logger.error('Failed to update shopping list item', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Financial analysis tools

export const getSpendingAnalysisTool = new DynamicTool({
    name: 'get_spending_analysis',
    description: '获取支出分析。输入: {"startDate": "开始日期", "endDate": "结束日期", "groupBy": "分组方式(month/category/platform)"}',
    func: async (input: string) => {
        try {
            const {
                startDate,
                endDate,
                groupBy = 'month'
            } = JSON.parse(input);

            let groupByClause: string;
            let selectClause: string;

            switch (groupBy) {
                case 'category':
                    selectClause = 'psl.category as group_key, COUNT(DISTINCT ph.id) as order_count';
                    groupByClause = 'psl.category';
                    break;
                case 'platform':
                    selectClause = 'ph.purchase_channel as group_key, COUNT(ph.id) as order_count';
                    groupByClause = 'ph.purchase_channel';
                    break;
                case 'month':
                default:
                    selectClause = 'DATE_FORMAT(ph.purchase_date, "%Y-%m") as group_key, COUNT(ph.id) as order_count';
                    groupByClause = 'DATE_FORMAT(ph.purchase_date, "%Y-%m")';
                    break;
            }

            let whereClause = '1=1';
            const params: any[] = [];

            if (startDate) {
                whereClause += ' AND ph.purchase_date >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND ph.purchase_date <= ?';
                params.push(endDate);
            }

            const query = `
                SELECT
                    ${selectClause},
                    SUM(ph.total_price) as total_amount,
                    SUM(ph.delivery_cost) as total_delivery,
                    SUM(ph.pay_fee) as total_fees,
                    AVG(ph.total_price) as avg_order_value
                FROM purchase_history ph
                LEFT JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                WHERE ${whereClause}
                GROUP BY ${groupByClause}
                ORDER BY total_amount DESC
            `;

            const result = await databaseService.query(query, params);

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data,
                groupBy,
                count: Array.isArray(result.data) ? result.data.length : 0
            });

        } catch (error) {
            logger.error('Failed to get spending analysis', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Tool factory functions for easy integration

export function createInventoryTools(): DynamicTool[] {
    return [
        getInventoryItemTool,
        updateInventoryItemTool,
        addInventoryItemTool,
        checkInventoryThresholdsTool
    ];
}

export function createOrderTools(): DynamicTool[] {
    return [
        importOrdersTool,
        getOrderHistoryTool
    ];
}

export function createShoppingListTools(): DynamicTool[] {
    return [
        addToShoppingListTool,
        getShoppingListTool,
        updateShoppingListItemTool
    ];
}

export function createFinancialTools(): DynamicTool[] {
    return [
        getSpendingAnalysisTool
    ];
}

export function createAllDatabaseTools(): DynamicTool[] {
    return [
        ...createInventoryTools(),
        ...createOrderTools(),
        ...createShoppingListTools(),
        ...createFinancialTools()
    ];
}
