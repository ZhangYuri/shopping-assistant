/**
 * Database Tools
 * DynamicTool implementations for database operations
 */

import { DynamicTool } from '@langchain/core/tools';
import { DatabaseService } from '../services/DatabaseService';
import { Logger } from '../utils/Logger';

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

// Procurement recommendation tools

export const generatePurchaseRecommendationsTool = new DynamicTool({
    name: 'generate_purchase_recommendations',
    description: '基于历史数据和库存水平生成采购建议。输入: {"analysisDepthDays": 分析天数, "categories": ["分类筛选"], "includeSeasonality": 是否考虑季节性}',
    func: async (input: string) => {
        try {
            const {
                analysisDepthDays = 90,
                categories,
                includeSeasonality = true
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                // 1. Get current inventory levels
                let inventoryQuery = 'SELECT * FROM inventory WHERE current_quantity >= 0';
                const inventoryParams: any[] = [];

                if (categories && categories.length > 0) {
                    inventoryQuery += ' AND category IN (' + categories.map(() => '?').join(',') + ')';
                    inventoryParams.push(...categories);
                }

                const [inventoryItems] = await connection.execute(inventoryQuery, inventoryParams);

                // 2. Get historical purchase data for analysis
                const analysisStartDate = new Date();
                analysisStartDate.setDate(analysisStartDate.getDate() - analysisDepthDays);

                let historyQuery = `
                    SELECT
                        psl.item_name,
                        psl.category,
                        SUM(psl.purchase_quantity) as total_purchased,
                        COUNT(DISTINCT ph.id) as purchase_frequency,
                        AVG(psl.unit_price) as avg_price,
                        MAX(ph.purchase_date) as last_purchase_date,
                        MIN(ph.purchase_date) as first_purchase_date
                    FROM purchase_sub_list psl
                    JOIN purchase_history ph ON psl.parent_id = ph.id
                    WHERE ph.purchase_date >= ?
                `;
                const historyParams: any[] = [analysisStartDate];

                if (categories && categories.length > 0) {
                    historyQuery += ' AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                    historyParams.push(...categories);
                }

                historyQuery += ' GROUP BY psl.item_name, psl.category ORDER BY total_purchased DESC';

                const [historicalData] = await connection.execute(historyQuery, historyParams);

                // 3. Get current shopping list to avoid duplicates
                const [shoppingListItems] = await connection.execute(
                    'SELECT item_name FROM shopping_list WHERE status = "pending"'
                );
                const existingShoppingItems = new Set(
                    (shoppingListItems as any[]).map(item => item.item_name)
                );

                // 4. Generate recommendations
                const recommendations: any[] = [];
                const inventoryMap = new Map();

                // Create inventory lookup map
                (inventoryItems as any[]).forEach(item => {
                    inventoryMap.set(item.item_name, item);
                });

                // Analyze each historical item
                for (const histItem of historicalData as any[]) {
                    const inventoryItem = inventoryMap.get(histItem.item_name);
                    const currentQuantity = inventoryItem ? inventoryItem.current_quantity : 0;

                    // Calculate consumption rate (items per day)
                    const daysSinceFirst = Math.max(1,
                        (new Date().getTime() - new Date(histItem.first_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const consumptionRate = histItem.total_purchased / daysSinceFirst;

                    // Calculate days since last purchase
                    const daysSinceLastPurchase = Math.max(0,
                        (new Date().getTime() - new Date(histItem.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)
                    );

                    // Estimate days until stock runs out
                    const daysUntilEmpty = consumptionRate > 0 ? currentQuantity / consumptionRate : Infinity;

                    // Calculate priority based on multiple factors
                    let priority = 1;
                    let reason = '';

                    if (currentQuantity === 0) {
                        priority = 5;
                        reason = '库存为零，急需补货';
                    } else if (daysUntilEmpty <= 7) {
                        priority = 4;
                        reason = `预计${Math.ceil(daysUntilEmpty)}天内用完`;
                    } else if (daysUntilEmpty <= 14) {
                        priority = 3;
                        reason = `预计${Math.ceil(daysUntilEmpty)}天内用完`;
                    } else if (daysSinceLastPurchase > 30 && consumptionRate > 0) {
                        priority = 2;
                        reason = `已${Math.ceil(daysSinceLastPurchase)}天未购买，消费频率较高`;
                    }

                    // Apply seasonal adjustments if enabled
                    if (includeSeasonality) {
                        const currentMonth = new Date().getMonth() + 1;
                        const seasonalMultiplier = calculateSeasonalMultiplier(histItem.category, currentMonth);

                        if (seasonalMultiplier > 1.2) {
                            priority = Math.min(5, priority + 1);
                            reason += ' (季节性需求增加)';
                        }
                    }

                    // Calculate suggested quantity based on consumption pattern
                    const suggestedQuantity = Math.max(1, Math.ceil(consumptionRate * 30)); // 30 days supply

                    // Only recommend if priority is high enough and not already in shopping list
                    if (priority >= 2 && !existingShoppingItems.has(histItem.item_name)) {
                        recommendations.push({
                            item_name: histItem.item_name,
                            category: histItem.category,
                            current_quantity: currentQuantity,
                            suggested_quantity: suggestedQuantity,
                            priority,
                            reason,
                            consumption_rate: Math.round(consumptionRate * 100) / 100,
                            days_until_empty: Math.ceil(daysUntilEmpty),
                            days_since_last_purchase: Math.ceil(daysSinceLastPurchase),
                            avg_price: histItem.avg_price,
                            estimated_cost: histItem.avg_price * suggestedQuantity
                        });
                    }
                }

                // Sort by priority (high to low) and then by days until empty
                recommendations.sort((a, b) => {
                    if (a.priority !== b.priority) {
                        return b.priority - a.priority;
                    }
                    return a.days_until_empty - b.days_until_empty;
                });

                return {
                    recommendations: recommendations.slice(0, 20), // Limit to top 20
                    analysis_period_days: analysisDepthDays,
                    total_items_analyzed: (historicalData as any[]).length,
                    recommendations_generated: recommendations.length
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
            logger.error('Failed to generate purchase recommendations', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

function calculateSeasonalMultiplier(category: string, currentMonth: number): number {
    // Seasonal multipliers based on category and month
    const seasonalPatterns: Record<string, Record<number, number>> = {
        '食品': {
            1: 1.3, 2: 1.2, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.1,
            7: 1.2, 8: 1.2, 9: 1.0, 10: 1.0, 11: 1.1, 12: 1.4
        },
        '日用品': {
            1: 1.2, 2: 1.1, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0,
            7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0, 11: 1.1, 12: 1.2
        },
        '清洁用品': {
            1: 1.1, 2: 1.0, 3: 1.2, 4: 1.1, 5: 1.0, 6: 1.0,
            7: 1.0, 8: 1.0, 9: 1.0, 10: 1.0, 11: 1.0, 12: 1.1
        }
    };

    return seasonalPatterns[category]?.[currentMonth] || 1.0;
}

export const analyzePurchasePatternsDetailedTool = new DynamicTool({
    name: 'analyze_purchase_patterns_detailed',
    description: '详细分析购买模式和趋势。输入: {"timeRange": "时间范围(days)", "categories": ["分类"], "includeSeasonality": 是否包含季节性分析}',
    func: async (input: string) => {
        try {
            const {
                timeRange = 365,
                categories,
                includeSeasonality = true
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                const analysisStartDate = new Date();
                analysisStartDate.setDate(analysisStartDate.getDate() - timeRange);

                // 1. Overall spending trends by month
                let monthlyQuery = `
                    SELECT
                        DATE_FORMAT(ph.purchase_date, '%Y-%m') as month,
                        COUNT(ph.id) as order_count,
                        SUM(ph.total_price) as total_spent,
                        AVG(ph.total_price) as avg_order_value,
                        COUNT(DISTINCT psl.item_name) as unique_items
                    FROM purchase_history ph
                    LEFT JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ?
                `;
                const monthlyParams: any[] = [analysisStartDate];

                if (categories && categories.length > 0) {
                    monthlyQuery += ' AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                    monthlyParams.push(...categories);
                }

                monthlyQuery += ' GROUP BY DATE_FORMAT(ph.purchase_date, "%Y-%m") ORDER BY month';

                const [monthlyTrends] = await connection.execute(monthlyQuery, monthlyParams);

                // 2. Category analysis
                let categoryQuery = `
                    SELECT
                        psl.category,
                        COUNT(DISTINCT psl.item_name) as unique_items,
                        SUM(psl.purchase_quantity) as total_quantity,
                        SUM(psl.unit_price * psl.purchase_quantity) as total_spent,
                        AVG(psl.unit_price) as avg_unit_price,
                        COUNT(DISTINCT ph.id) as order_frequency
                    FROM purchase_sub_list psl
                    JOIN purchase_history ph ON psl.parent_id = ph.id
                    WHERE ph.purchase_date >= ?
                `;
                const categoryParams: any[] = [analysisStartDate];

                if (categories && categories.length > 0) {
                    categoryQuery += ' AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                    categoryParams.push(...categories);
                }

                categoryQuery += ' GROUP BY psl.category ORDER BY total_spent DESC';

                const [categoryAnalysis] = await connection.execute(categoryQuery, categoryParams);

                // 3. Top purchased items
                let topItemsQuery = `
                    SELECT
                        psl.item_name,
                        psl.category,
                        SUM(psl.purchase_quantity) as total_purchased,
                        COUNT(DISTINCT ph.id) as purchase_frequency,
                        AVG(psl.unit_price) as avg_price,
                        SUM(psl.unit_price * psl.purchase_quantity) as total_spent,
                        MAX(ph.purchase_date) as last_purchase_date
                    FROM purchase_sub_list psl
                    JOIN purchase_history ph ON psl.parent_id = ph.id
                    WHERE ph.purchase_date >= ?
                `;
                const topItemsParams: any[] = [analysisStartDate];

                if (categories && categories.length > 0) {
                    topItemsQuery += ' AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                    topItemsParams.push(...categories);
                }

                topItemsQuery += ' GROUP BY psl.item_name, psl.category ORDER BY total_purchased DESC LIMIT 20';

                const [topItems] = await connection.execute(topItemsQuery, topItemsParams);

                // 4. Seasonal analysis if requested
                let seasonalAnalysis = null;
                if (includeSeasonality) {
                    let seasonalQuery = `
                        SELECT
                            MONTH(ph.purchase_date) as month,
                            psl.category,
                            SUM(psl.purchase_quantity) as total_quantity,
                            SUM(psl.unit_price * psl.purchase_quantity) as total_spent,
                            COUNT(DISTINCT ph.id) as order_count
                        FROM purchase_sub_list psl
                        JOIN purchase_history ph ON psl.parent_id = ph.id
                        WHERE ph.purchase_date >= ?
                    `;
                    const seasonalParams: any[] = [analysisStartDate];

                    if (categories && categories.length > 0) {
                        seasonalQuery += ' AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                        seasonalParams.push(...categories);
                    }

                    seasonalQuery += ' GROUP BY MONTH(ph.purchase_date), psl.category ORDER BY month, total_spent DESC';

                    const [seasonalData] = await connection.execute(seasonalQuery, seasonalParams);
                    seasonalAnalysis = seasonalData;
                }

                return {
                    monthly_trends: monthlyTrends,
                    category_analysis: categoryAnalysis,
                    top_items: topItems,
                    seasonal_analysis: seasonalAnalysis,
                    analysis_period_days: timeRange,
                    analysis_start_date: analysisStartDate.toISOString().split('T')[0]
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
            logger.error('Failed to analyze purchase patterns', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const manageShoppingListAdvancedTool = new DynamicTool({
    name: 'manage_shopping_list_advanced',
    description: '高级购物清单管理，支持批量操作和智能优先级调整。输入: {"action": "操作类型", "items": [物品数组], "autoAddFromRecommendations": 是否自动添加推荐}',
    func: async (input: string) => {
        try {
            const {
                action,
                items,
                autoAddFromRecommendations = false
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                let results: any[] = [];

                if (action === 'bulk_add' && items && Array.isArray(items)) {
                    // Bulk add items to shopping list
                    for (const item of items) {
                        const [existingItem] = await connection.execute(
                            'SELECT id FROM shopping_list WHERE item_name = ? AND status = "pending"',
                            [item.item_name]
                        );

                        if (Array.isArray(existingItem) && existingItem.length > 0) {
                            // Update existing item
                            await connection.execute(
                                'UPDATE shopping_list SET suggested_quantity = ?, priority = ?, reason = ?, added_date = CURRENT_TIMESTAMP WHERE item_name = ? AND status = "pending"',
                                [item.suggested_quantity, item.priority, item.reason, item.item_name]
                            );
                            results.push({ action: 'updated', item_name: item.item_name });
                        } else {
                            // Add new item
                            await connection.execute(
                                'INSERT INTO shopping_list (item_name, suggested_quantity, priority, reason, status, added_date) VALUES (?, ?, ?, ?, "pending", CURRENT_TIMESTAMP)',
                                [item.item_name, item.suggested_quantity, item.priority, item.reason]
                            );
                            results.push({ action: 'added', item_name: item.item_name });
                        }
                    }
                } else if (action === 'auto_add_recommendations' || autoAddFromRecommendations) {
                    // Get current recommendations and add high priority ones
                    const recommendationsResult = await generatePurchaseRecommendationsTool.func(
                        JSON.stringify({ analysisDepthDays: 90, includeSeasonality: true })
                    );

                    const recommendations = JSON.parse(recommendationsResult);
                    if (recommendations.success && recommendations.data.recommendations) {
                        const highPriorityItems = recommendations.data.recommendations.filter(
                            (rec: any) => rec.priority >= 3
                        );

                        for (const rec of highPriorityItems) {
                            const [existingItem] = await connection.execute(
                                'SELECT id FROM shopping_list WHERE item_name = ? AND status = "pending"',
                                [rec.item_name]
                            );

                            if (Array.isArray(existingItem) && existingItem.length === 0) {
                                await connection.execute(
                                    'INSERT INTO shopping_list (item_name, suggested_quantity, priority, reason, status, added_date) VALUES (?, ?, ?, ?, "pending", CURRENT_TIMESTAMP)',
                                    [rec.item_name, rec.suggested_quantity, rec.priority, `自动添加: ${rec.reason}`]
                                );
                                results.push({ action: 'auto_added', item_name: rec.item_name, priority: rec.priority });
                            }
                        }
                    }
                } else if (action === 'prioritize') {
                    // Re-prioritize shopping list based on current inventory levels
                    const [shoppingItems] = await connection.execute(
                        'SELECT sl.*, i.current_quantity FROM shopping_list sl LEFT JOIN inventory i ON sl.item_name = i.item_name WHERE sl.status = "pending"'
                    );

                    for (const item of shoppingItems as any[]) {
                        let newPriority = item.priority;

                        if (item.current_quantity === 0) {
                            newPriority = 5;
                        } else if (item.current_quantity <= 2) {
                            newPriority = Math.max(newPriority, 4);
                        } else if (item.current_quantity <= 5) {
                            newPriority = Math.max(newPriority, 3);
                        }

                        if (newPriority !== item.priority) {
                            await connection.execute(
                                'UPDATE shopping_list SET priority = ? WHERE id = ?',
                                [newPriority, item.id]
                            );
                            results.push({
                                action: 'prioritized',
                                item_name: item.item_name,
                                old_priority: item.priority,
                                new_priority: newPriority
                            });
                        }
                    }
                } else if (action === 'cleanup') {
                    // Remove completed items older than 30 days
                    const cleanupDate = new Date();
                    cleanupDate.setDate(cleanupDate.getDate() - 30);

                    const cleanupResult = await connection.execute(
                        'DELETE FROM shopping_list WHERE status = "completed" AND completed_date < ?',
                        [cleanupDate]
                    );

                    results.push({
                        action: 'cleanup',
                        deleted_count: (cleanupResult as any).affectedRows
                    });
                }

                return {
                    action,
                    results,
                    processed_count: results.length
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
            logger.error('Failed to manage shopping list', { error });
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

export function createProcurementTools(): DynamicTool[] {
    return [
        generatePurchaseRecommendationsTool,
        analyzePurchasePatternsDetailedTool,
        manageShoppingListAdvancedTool
    ];
}

// Financial analysis tools

export const generateFinancialReportTool = new DynamicTool({
    name: 'generate_financial_report',
    description: '生成财务报告。输入: {"period": "报告期间(month/quarter/year)", "startDate": "开始日期", "endDate": "结束日期", "includeComparison": 是否包含对比分析}',
    func: async (input: string) => {
        try {
            const {
                period = 'month',
                startDate,
                endDate,
                includeComparison = true
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                // Calculate date range based on period
                let reportStartDate: string;
                let reportEndDate: string;
                let comparisonStartDate: string = '';
                let comparisonEndDate: string = '';

                const now = new Date();

                if (startDate && endDate) {
                    reportStartDate = startDate;
                    reportEndDate = endDate;
                } else {
                    switch (period) {
                        case 'quarter':
                            const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                            reportStartDate = quarterStart.toISOString().split('T')[0];
                            reportEndDate = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0).toISOString().split('T')[0];
                            break;
                        case 'year':
                            reportStartDate = `${now.getFullYear()}-01-01`;
                            reportEndDate = `${now.getFullYear()}-12-31`;
                            break;
                        case 'month':
                        default:
                            reportStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                            reportEndDate = monthEnd.toISOString().split('T')[0];
                            break;
                    }
                }

                // Calculate comparison period (previous period)
                if (includeComparison) {
                    const startDateObj = new Date(reportStartDate);
                    const endDateObj = new Date(reportEndDate);
                    const periodLength = endDateObj.getTime() - startDateObj.getTime();

                    comparisonEndDate = new Date(startDateObj.getTime() - 1).toISOString().split('T')[0];
                    comparisonStartDate = new Date(startDateObj.getTime() - periodLength).toISOString().split('T')[0];
                }

                // Get current period data
                const [currentPeriodData] = await connection.execute(`
                    SELECT
                        COUNT(ph.id) as total_orders,
                        SUM(ph.total_price) as total_spending,
                        SUM(ph.delivery_cost) as total_delivery,
                        SUM(ph.pay_fee) as total_fees,
                        AVG(ph.total_price) as avg_order_value,
                        MAX(ph.total_price) as max_order_value,
                        MIN(ph.total_price) as min_order_value
                    FROM purchase_history ph
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                `, [reportStartDate, reportEndDate]);

                // Get category breakdown
                const [categoryBreakdown] = await connection.execute(`
                    SELECT
                        psl.category,
                        COUNT(DISTINCT ph.id) as order_count,
                        SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as category_spending,
                        SUM(psl.purchase_quantity) as total_quantity,
                        AVG(psl.unit_price) as avg_unit_price
                    FROM purchase_history ph
                    JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    GROUP BY psl.category
                    ORDER BY category_spending DESC
                `, [reportStartDate, reportEndDate]);

                // Get platform breakdown
                const [platformBreakdown] = await connection.execute(`
                    SELECT
                        ph.purchase_channel as platform,
                        COUNT(ph.id) as order_count,
                        SUM(ph.total_price) as platform_spending,
                        AVG(ph.total_price) as avg_order_value
                    FROM purchase_history ph
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    GROUP BY ph.purchase_channel
                    ORDER BY platform_spending DESC
                `, [reportStartDate, reportEndDate]);

                // Get top spending items
                const [topItems] = await connection.execute(`
                    SELECT
                        psl.item_name,
                        psl.category,
                        SUM(psl.purchase_quantity) as total_quantity,
                        SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as total_spending,
                        AVG(psl.unit_price) as avg_price,
                        COUNT(DISTINCT ph.id) as purchase_frequency
                    FROM purchase_history ph
                    JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    GROUP BY psl.item_name, psl.category
                    ORDER BY total_spending DESC
                    LIMIT 10
                `, [reportStartDate, reportEndDate]);

                let comparisonData = null;
                if (includeComparison) {
                    const [comparisonPeriodData] = await connection.execute(`
                        SELECT
                            COUNT(ph.id) as total_orders,
                            SUM(ph.total_price) as total_spending,
                            SUM(ph.delivery_cost) as total_delivery,
                            SUM(ph.pay_fee) as total_fees,
                            AVG(ph.total_price) as avg_order_value
                        FROM purchase_history ph
                        WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    `, [comparisonStartDate, comparisonEndDate]);

                    comparisonData = (comparisonPeriodData as any[])[0];
                }

                return {
                    reportPeriod: {
                        period,
                        startDate: reportStartDate,
                        endDate: reportEndDate
                    },
                    summary: (currentPeriodData as any[])[0],
                    categoryBreakdown: categoryBreakdown,
                    platformBreakdown: platformBreakdown,
                    topItems: topItems,
                    comparison: comparisonData ? {
                        data: comparisonData,
                        period: {
                            startDate: comparisonStartDate,
                            endDate: comparisonEndDate
                        }
                    } : null
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
            logger.error('Failed to generate financial report', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const detectAnomalousSpendingTool = new DynamicTool({
    name: 'detect_anomalous_spending',
    description: '检测异常消费行为。输入: {"analysisDepthDays": 分析天数, "dailyThresholdMultiplier": 日支出异常倍数, "categoryThresholdMultiplier": 类别异常倍数, "unusualItemThreshold": 单项异常金额}',
    func: async (input: string) => {
        try {
            const {
                analysisDepthDays = 30,
                dailyThresholdMultiplier = 3.0,
                categoryThresholdMultiplier = 2.5,
                unusualItemThreshold = 500
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                const analysisStartDate = new Date();
                analysisStartDate.setDate(analysisStartDate.getDate() - analysisDepthDays);

                // Calculate baseline daily spending
                const [dailyBaseline] = await connection.execute(`
                    SELECT
                        AVG(daily_spending) as avg_daily_spending,
                        STDDEV(daily_spending) as stddev_daily_spending
                    FROM (
                        SELECT
                            DATE(ph.purchase_date) as purchase_day,
                            SUM(ph.total_price) as daily_spending
                        FROM purchase_history ph
                        WHERE ph.purchase_date >= DATE_SUB(?, INTERVAL 90 DAY)
                        AND ph.purchase_date < ?
                        GROUP BY DATE(ph.purchase_date)
                    ) daily_stats
                `, [analysisStartDate, analysisStartDate]);

                const baseline = (dailyBaseline as any[])[0] as any;
                const dailyThreshold = baseline.avg_daily_spending + (baseline.stddev_daily_spending * dailyThresholdMultiplier);

                // Detect daily spending anomalies
                const [dailyAnomalies] = await connection.execute(`
                    SELECT
                        DATE(ph.purchase_date) as anomaly_date,
                        SUM(ph.total_price) as daily_spending,
                        COUNT(ph.id) as order_count,
                        GROUP_CONCAT(CONCAT(ph.store_name, '(', ph.total_price, ')') SEPARATOR ', ') as orders
                    FROM purchase_history ph
                    WHERE ph.purchase_date >= ?
                    GROUP BY DATE(ph.purchase_date)
                    HAVING daily_spending > ?
                    ORDER BY daily_spending DESC
                `, [analysisStartDate, dailyThreshold]);

                // Calculate category baselines
                const [categoryBaselines] = await connection.execute(`
                    SELECT
                        psl.category,
                        AVG(category_daily_spending) as avg_category_spending,
                        STDDEV(category_daily_spending) as stddev_category_spending
                    FROM (
                        SELECT
                            psl.category,
                            DATE(ph.purchase_date) as purchase_day,
                            SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as category_daily_spending
                        FROM purchase_history ph
                        JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                        WHERE ph.purchase_date >= DATE_SUB(?, INTERVAL 90 DAY)
                        AND ph.purchase_date < ?
                        GROUP BY psl.category, DATE(ph.purchase_date)
                    ) category_daily_stats
                    GROUP BY psl.category
                `, [analysisStartDate, analysisStartDate]);

                // Detect category spending anomalies
                const categoryAnomalies: any[] = [];
                for (const categoryBaseline of categoryBaselines as any[]) {
                    const categoryThreshold = categoryBaseline.avg_category_spending +
                        (categoryBaseline.stddev_category_spending * categoryThresholdMultiplier);

                    const [categoryAnomaly] = await connection.execute(`
                        SELECT
                            psl.category,
                            DATE(ph.purchase_date) as anomaly_date,
                            SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as category_spending,
                            COUNT(DISTINCT psl.item_name) as item_count,
                            GROUP_CONCAT(DISTINCT psl.item_name SEPARATOR ', ') as items
                        FROM purchase_history ph
                        JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                        WHERE ph.purchase_date >= ?
                        AND psl.category = ?
                        GROUP BY psl.category, DATE(ph.purchase_date)
                        HAVING category_spending > ?
                        ORDER BY category_spending DESC
                    `, [analysisStartDate, categoryBaseline.category, categoryThreshold]);

                    if ((categoryAnomaly as any[]).length > 0) {
                        categoryAnomalies.push(...(categoryAnomaly as any[]));
                    }
                }

                // Detect unusual high-value items
                const [unusualItems] = await connection.execute(`
                    SELECT
                        psl.item_name,
                        psl.category,
                        psl.unit_price,
                        psl.purchase_quantity,
                        (psl.unit_price * psl.purchase_quantity) as total_item_cost,
                        ph.store_name,
                        ph.purchase_date
                    FROM purchase_history ph
                    JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ?
                    AND (psl.unit_price > ? OR (psl.unit_price * psl.purchase_quantity) > ?)
                    ORDER BY total_item_cost DESC
                `, [analysisStartDate, unusualItemThreshold, unusualItemThreshold]);

                // Detect frequency anomalies (unusual purchase patterns)
                const [frequencyAnomalies] = await connection.execute(`
                    SELECT
                        psl.item_name,
                        psl.category,
                        COUNT(*) as recent_purchases,
                        SUM(psl.purchase_quantity) as total_quantity,
                        AVG(psl.unit_price) as avg_price,
                        MIN(ph.purchase_date) as first_purchase,
                        MAX(ph.purchase_date) as last_purchase,
                        DATEDIFF(MAX(ph.purchase_date), MIN(ph.purchase_date)) as purchase_span_days
                    FROM purchase_history ph
                    JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ?
                    GROUP BY psl.item_name, psl.category
                    HAVING recent_purchases >= 5 AND purchase_span_days <= 7
                    ORDER BY recent_purchases DESC, total_quantity DESC
                `, [analysisStartDate]);

                return {
                    analysisParameters: {
                        analysisDepthDays,
                        dailyThresholdMultiplier,
                        categoryThresholdMultiplier,
                        unusualItemThreshold
                    },
                    baseline: {
                        avgDailySpending: baseline.avg_daily_spending,
                        dailyThreshold
                    },
                    anomalies: {
                        dailySpending: dailyAnomalies,
                        categorySpending: categoryAnomalies,
                        unusualItems: unusualItems,
                        frequencyAnomalies: frequencyAnomalies
                    },
                    summary: {
                        totalAnomalies: (dailyAnomalies as any[]).length + categoryAnomalies.length +
                            (unusualItems as any[]).length + (frequencyAnomalies as any[]).length,
                        riskLevel: calculateRiskLevel(dailyAnomalies as any[], categoryAnomalies, unusualItems as any[], frequencyAnomalies as any[])
                    }
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
            logger.error('Failed to detect anomalous spending', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getBudgetStatusTool = new DynamicTool({
    name: 'get_budget_status',
    description: '获取预算执行状况。输入: {"budgetLimits": {"类别": 预算金额}, "period": "预算期间(month/quarter)", "startDate": "开始日期", "endDate": "结束日期"}',
    func: async (input: string) => {
        try {
            const {
                budgetLimits,
                period = 'month',
                startDate,
                endDate
            } = JSON.parse(input);

            if (!budgetLimits || typeof budgetLimits !== 'object') {
                return JSON.stringify({
                    success: false,
                    error: '预算限制必须是对象格式'
                });
            }

            const result = await databaseService.transaction(async (connection) => {
                // Calculate period dates
                let periodStartDate: string;
                let periodEndDate: string;

                if (startDate && endDate) {
                    periodStartDate = startDate;
                    periodEndDate = endDate;
                } else {
                    const now = new Date();
                    if (period === 'quarter') {
                        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        periodStartDate = quarterStart.toISOString().split('T')[0];
                        periodEndDate = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0).toISOString().split('T')[0];
                    } else {
                        periodStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        periodEndDate = monthEnd.toISOString().split('T')[0];
                    }
                }

                // Get actual spending by category
                const [actualSpending] = await connection.execute(`
                    SELECT
                        COALESCE(psl.category, '其他') as category,
                        SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as actual_spending,
                        COUNT(DISTINCT ph.id) as order_count,
                        COUNT(DISTINCT psl.item_name) as item_count,
                        AVG(psl.unit_price) as avg_item_price
                    FROM purchase_history ph
                    JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    GROUP BY COALESCE(psl.category, '其他')
                `, [periodStartDate, periodEndDate]);

                // Calculate budget status for each category
                const budgetStatus: any[] = [];
                const spendingMap = new Map();

                (actualSpending as any[]).forEach(spending => {
                    spendingMap.set(spending.category, spending);
                });

                for (const [category, budgetLimit] of Object.entries(budgetLimits)) {
                    const spending = spendingMap.get(category) || {
                        actual_spending: 0,
                        order_count: 0,
                        item_count: 0,
                        avg_item_price: 0
                    };

                    const utilizationRate = spending.actual_spending / (budgetLimit as number);
                    const remainingBudget = (budgetLimit as number) - spending.actual_spending;

                    budgetStatus.push({
                        category,
                        budgetLimit: budgetLimit,
                        actualSpending: spending.actual_spending,
                        remainingBudget,
                        utilizationRate,
                        status: utilizationRate > 1 ? 'exceeded' :
                            utilizationRate > 0.9 ? 'warning' :
                                utilizationRate > 0.7 ? 'caution' : 'normal',
                        orderCount: spending.order_count,
                        itemCount: spending.item_count,
                        avgItemPrice: spending.avg_item_price
                    });
                }

                // Calculate overall budget metrics
                const totalBudget = Object.values(budgetLimits).reduce((sum: number, limit) => sum + (limit as number), 0);
                const totalSpending = budgetStatus.reduce((sum, status) => sum + status.actualSpending, 0);
                const overallUtilization = totalSpending / totalBudget;

                // Get spending trend for the period
                const [spendingTrend] = await connection.execute(`
                    SELECT
                        DATE(ph.purchase_date) as spending_date,
                        SUM(ph.total_price) as daily_spending
                    FROM purchase_history ph
                    WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
                    GROUP BY DATE(ph.purchase_date)
                    ORDER BY spending_date
                `, [periodStartDate, periodEndDate]);

                return {
                    period: {
                        type: period,
                        startDate: periodStartDate,
                        endDate: periodEndDate
                    },
                    overall: {
                        totalBudget,
                        totalSpending,
                        remainingBudget: totalBudget - totalSpending,
                        utilizationRate: overallUtilization,
                        status: overallUtilization > 1 ? 'exceeded' :
                            overallUtilization > 0.9 ? 'warning' :
                                overallUtilization > 0.7 ? 'caution' : 'normal'
                    },
                    categoryStatus: budgetStatus.sort((a, b) => b.utilizationRate - a.utilizationRate),
                    spendingTrend: spendingTrend,
                    alerts: budgetStatus.filter(status => status.status === 'exceeded' || status.status === 'warning')
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
            logger.error('Failed to get budget status', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const analyzeSpendingTrendsTool = new DynamicTool({
    name: 'analyze_spending_trends',
    description: '分析支出趋势。输入: {"timeRange": 时间范围天数, "granularity": "粒度(daily/weekly/monthly)", "categories": ["分类筛选"], "includeForecasting": 是否包含预测}',
    func: async (input: string) => {
        try {
            const {
                timeRange = 90,
                granularity = 'weekly',
                categories,
                includeForecasting = true
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                const analysisStartDate = new Date();
                analysisStartDate.setDate(analysisStartDate.getDate() - timeRange);

                // Build date grouping based on granularity
                let dateFormat: string;
                let dateGroupBy: string;

                switch (granularity) {
                    case 'daily':
                        dateFormat = '%Y-%m-%d';
                        dateGroupBy = 'DATE(ph.purchase_date)';
                        break;
                    case 'monthly':
                        dateFormat = '%Y-%m';
                        dateGroupBy = 'DATE_FORMAT(ph.purchase_date, "%Y-%m")';
                        break;
                    case 'weekly':
                    default:
                        dateFormat = '%Y-%u';
                        dateGroupBy = 'YEARWEEK(ph.purchase_date)';
                        break;
                }

                // Build category filter
                let categoryFilter = '';
                const params: any[] = [analysisStartDate];

                if (categories && categories.length > 0) {
                    categoryFilter = 'AND psl.category IN (' + categories.map(() => '?').join(',') + ')';
                    params.push(...categories);
                }

                // Get spending trends
                const [spendingTrends] = await connection.execute(`
                    SELECT
                        ${dateGroupBy} as period,
                        DATE_FORMAT(ph.purchase_date, '${dateFormat}') as period_label,
                        SUM(ph.total_price) as total_spending,
                        COUNT(ph.id) as order_count,
                        AVG(ph.total_price) as avg_order_value,
                        SUM(ph.delivery_cost) as total_delivery,
                        COUNT(DISTINCT psl.category) as category_diversity
                    FROM purchase_history ph
                    LEFT JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                    WHERE ph.purchase_date >= ?
                    ${categoryFilter}
                    GROUP BY ${dateGroupBy}, DATE_FORMAT(ph.purchase_date, '${dateFormat}')
                    ORDER BY period
                `, params);

                // Calculate trend statistics
                const trends = spendingTrends as any[];
                const spendingValues = trends.map(t => t.total_spending);

                const trendStats = {
                    totalPeriods: trends.length,
                    avgSpending: spendingValues.reduce((sum, val) => sum + val, 0) / spendingValues.length,
                    maxSpending: Math.max(...spendingValues),
                    minSpending: Math.min(...spendingValues),
                    spendingVariance: calculateVariance(spendingValues),
                    trendDirection: calculateTrendDirection(spendingValues)
                };

                // Get category trends if no specific categories were requested
                let categoryTrends: any[] = [];
                if (!categories || categories.length === 0) {
                    const [categoryTrendData] = await connection.execute(`
                        SELECT
                            psl.category,
                            ${dateGroupBy} as period,
                            SUM(psl.purchase_quantity * COALESCE(psl.unit_price, 0)) as category_spending,
                            COUNT(DISTINCT psl.item_name) as item_diversity
                        FROM purchase_history ph
                        JOIN purchase_sub_list psl ON ph.id = psl.parent_id
                        WHERE ph.purchase_date >= ?
                        GROUP BY psl.category, ${dateGroupBy}
                        ORDER BY psl.category, period
                    `, [analysisStartDate]);

                    // Group by category
                    const categoryMap = new Map();
                    (categoryTrendData as any[]).forEach(item => {
                        if (!categoryMap.has(item.category)) {
                            categoryMap.set(item.category, []);
                        }
                        categoryMap.get(item.category).push(item);
                    });

                    categoryTrends = Array.from(categoryMap.entries()).map(([category, data]) => ({
                        category,
                        trends: data,
                        totalSpending: (data as any[]).reduce((sum, item) => sum + item.category_spending, 0),
                        avgSpending: (data as any[]).reduce((sum, item) => sum + item.category_spending, 0) / (data as any[]).length,
                        trendDirection: calculateTrendDirection((data as any[]).map(item => item.category_spending))
                    }));
                }

                // Simple forecasting if requested
                let forecast = null;
                if (includeForecasting && trends.length >= 3) {
                    forecast = generateSimpleForecast(spendingValues, granularity);
                }

                return {
                    analysisParameters: {
                        timeRange,
                        granularity,
                        categories: categories || 'all',
                        includeForecasting
                    },
                    trends: trends,
                    statistics: trendStats,
                    categoryTrends: categoryTrends,
                    forecast: forecast,
                    insights: generateTrendInsights(trends, trendStats, categoryTrends)
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
            logger.error('Failed to analyze spending trends', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Helper functions for financial analysis

function calculateRiskLevel(dailyAnomalies: any[], categoryAnomalies: any[], unusualItems: any[], frequencyAnomalies: any[]): string {
    const totalAnomalies = dailyAnomalies.length + categoryAnomalies.length + unusualItems.length + frequencyAnomalies.length;

    if (totalAnomalies >= 10) return 'high';
    if (totalAnomalies >= 5) return 'medium';
    if (totalAnomalies >= 1) return 'low';
    return 'normal';
}

function calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateTrendDirection(values: number[]): string {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
}

function generateSimpleForecast(values: number[], granularity: string): any {
    // Simple linear regression for forecasting
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = values;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Forecast next 3 periods
    const forecastPeriods = 3;
    const forecasts = [];

    for (let i = 1; i <= forecastPeriods; i++) {
        const nextX = n + i;
        const forecastValue = slope * nextX + intercept;
        forecasts.push({
            period: nextX,
            forecastValue: Math.max(0, forecastValue), // Ensure non-negative
            confidence: Math.max(0.3, 1 - (i * 0.2)) // Decreasing confidence
        });
    }

    return {
        method: 'linear_regression',
        slope,
        intercept,
        forecasts,
        granularity
    };
}

function generateTrendInsights(trends: any[], stats: any, categoryTrends: any[]): string[] {
    const insights: string[] = [];

    // Spending level insights
    if (stats.trendDirection === 'increasing') {
        insights.push('支出呈上升趋势，建议关注预算控制');
    } else if (stats.trendDirection === 'decreasing') {
        insights.push('支出呈下降趋势，财务状况良好');
    } else {
        insights.push('支出相对稳定，保持良好的消费习惯');
    }

    // Variability insights
    const coefficientOfVariation = Math.sqrt(stats.spendingVariance) / stats.avgSpending;
    if (coefficientOfVariation > 0.5) {
        insights.push('支出波动较大，建议制定更稳定的消费计划');
    } else if (coefficientOfVariation < 0.2) {
        insights.push('支出模式稳定，消费习惯良好');
    }

    // Category insights
    if (categoryTrends.length > 0) {
        const increasingCategories = categoryTrends.filter(ct => ct.trendDirection === 'increasing');
        if (increasingCategories.length > 0) {
            insights.push(`以下类别支出增长较快：${increasingCategories.map(ct => ct.category).join('、')}`);
        }
    }

    return insights;
}

export function createFinancialAnalysisTools(): DynamicTool[] {
    return [
        getSpendingAnalysisTool,
        generateFinancialReportTool,
        detectAnomalousSpendingTool,
        getBudgetStatusTool,
        analyzeSpendingTrendsTool
    ];
}

export function createFinancialTools(): DynamicTool[] {
    return createFinancialAnalysisTools();
}

// User feedback learning tools

export const recordUserFeedbackTool = new DynamicTool({
    name: 'record_user_feedback',
    description: '记录用户对采购建议的反馈。输入: {"recommendationId": "推荐ID", "itemName": "物品名称", "userAction": "accepted/rejected/modified/ignored", "userFeedback": "反馈内容", "actualQuantity": 实际数量, "actualPriority": 实际优先级, "contextData": {上下文数据}}',
    func: async (input: string) => {
        try {
            const {
                recommendationId,
                itemName,
                category,
                recommendedQuantity,
                recommendedPriority,
                recommendationReason,
                userAction,
                userFeedback,
                actualQuantity,
                actualPriority,
                recommendationDate,
                contextData
            } = JSON.parse(input);

            if (!recommendationId || !itemName || !userAction) {
                return JSON.stringify({
                    success: false,
                    error: '推荐ID、物品名称和用户行为不能为空'
                });
            }

            const validActions = ['accepted', 'rejected', 'modified', 'ignored'];
            if (!validActions.includes(userAction)) {
                return JSON.stringify({
                    success: false,
                    error: `用户行为必须是以下之一: ${validActions.join(', ')}`
                });
            }

            const result = await databaseService.query(
                `INSERT INTO user_feedback
                (recommendation_id, item_name, category, recommended_quantity, recommended_priority,
                 recommendation_reason, user_action, user_feedback, actual_quantity, actual_priority,
                 recommendation_date, context_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    recommendationId,
                    itemName,
                    category,
                    recommendedQuantity,
                    recommendedPriority,
                    recommendationReason,
                    userAction,
                    userFeedback,
                    actualQuantity,
                    actualPriority,
                    recommendationDate || new Date(),
                    contextData ? JSON.stringify(contextData) : null
                ]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            // Update user preferences based on feedback
            await updateUserPreferencesFromFeedback({
                itemName,
                category,
                userAction,
                recommendedQuantity,
                actualQuantity,
                recommendedPriority,
                actualPriority
            });

            return JSON.stringify({
                success: true,
                data: {
                    feedbackId: result.insertId,
                    recommendationId,
                    itemName,
                    userAction,
                    message: '用户反馈已记录，学习算法将根据此反馈进行优化'
                }
            });

        } catch (error) {
            logger.error('Failed to record user feedback', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const processRecommendationFeedbackTool = new DynamicTool({
    name: 'process_recommendation_feedback',
    description: '批量处理推荐反馈并更新学习模型。输入: {"feedbackList": [反馈列表], "updatePreferences": 是否更新偏好}',
    func: async (input: string) => {
        try {
            const { feedbackList, updatePreferences = true } = JSON.parse(input);

            if (!feedbackList || !Array.isArray(feedbackList)) {
                return JSON.stringify({
                    success: false,
                    error: '反馈列表必须是数组格式'
                });
            }

            const result = await databaseService.transaction(async (connection) => {
                const processedFeedback: any[] = [];
                const learningUpdates: any[] = [];

                for (const feedback of feedbackList) {
                    try {
                        // Record individual feedback
                        await connection.execute(
                            `INSERT INTO user_feedback
                            (recommendation_id, item_name, category, recommended_quantity, recommended_priority,
                             recommendation_reason, user_action, user_feedback, actual_quantity, actual_priority,
                             recommendation_date, context_data)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                feedback.recommendationId,
                                feedback.itemName,
                                feedback.category,
                                feedback.recommendedQuantity,
                                feedback.recommendedPriority,
                                feedback.recommendationReason,
                                feedback.userAction,
                                feedback.userFeedback,
                                feedback.actualQuantity,
                                feedback.actualPriority,
                                feedback.recommendationDate || new Date(),
                                feedback.contextData ? JSON.stringify(feedback.contextData) : null
                            ]
                        );

                        processedFeedback.push({
                            recommendationId: feedback.recommendationId,
                            itemName: feedback.itemName,
                            userAction: feedback.userAction,
                            status: 'processed'
                        });

                        // Collect learning updates
                        if (updatePreferences) {
                            const updates = await generateLearningUpdates(feedback);
                            learningUpdates.push(...updates);
                        }

                    } catch (feedbackError) {
                        processedFeedback.push({
                            recommendationId: feedback.recommendationId,
                            itemName: feedback.itemName,
                            status: 'failed',
                            error: feedbackError instanceof Error ? feedbackError.message : String(feedbackError)
                        });
                    }
                }

                // Apply learning updates
                if (updatePreferences && learningUpdates.length > 0) {
                    for (const update of learningUpdates) {
                        await connection.execute(
                            `INSERT INTO user_preferences (preference_type, preference_key, preference_value, confidence_score, sample_count)
                            VALUES (?, ?, ?, ?, 1)
                            ON DUPLICATE KEY UPDATE
                            preference_value = (preference_value * sample_count + VALUES(preference_value)) / (sample_count + 1),
                            confidence_score = LEAST(1.0, confidence_score + 0.1),
                            sample_count = sample_count + 1`,
                            [update.preferenceType, update.preferenceKey, update.preferenceValue, update.confidenceScore]
                        );
                    }
                }

                return {
                    processedCount: processedFeedback.filter(f => f.status === 'processed').length,
                    failedCount: processedFeedback.filter(f => f.status === 'failed').length,
                    learningUpdatesApplied: learningUpdates.length,
                    processedFeedback
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
            logger.error('Failed to process recommendation feedback', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getPersonalizedRecommendationsTool = new DynamicTool({
    name: 'get_personalized_recommendations',
    description: '基于用户反馈历史生成个性化采购建议。输入: {"analysisDepthDays": 分析天数, "categories": ["分类"], "applyLearning": 是否应用学习算法}',
    func: async (input: string) => {
        try {
            const {
                analysisDepthDays = 90,
                categories,
                applyLearning = true
            } = JSON.parse(input);

            const result = await databaseService.transaction(async (connection) => {
                // Get user preferences if learning is enabled
                let userPreferences: Map<string, any> = new Map();

                if (applyLearning) {
                    const [preferences] = await connection.execute(
                        'SELECT * FROM user_preferences WHERE confidence_score >= 0.3'
                    );

                    (preferences as any[]).forEach(pref => {
                        const key = `${pref.preference_type}:${pref.preference_key}`;
                        userPreferences.set(key, {
                            value: pref.preference_value,
                            confidence: pref.confidence_score,
                            sampleCount: pref.sample_count
                        });
                    });
                }

                // Get historical feedback patterns
                const [feedbackHistory] = await connection.execute(`
                    SELECT
                        item_name,
                        category,
                        user_action,
                        AVG(CASE WHEN actual_quantity IS NOT NULL THEN actual_quantity ELSE recommended_quantity END) as avg_preferred_quantity,
                        AVG(CASE WHEN actual_priority IS NOT NULL THEN actual_priority ELSE recommended_priority END) as avg_preferred_priority,
                        COUNT(*) as feedback_count,
                        SUM(CASE WHEN user_action = 'accepted' THEN 1 ELSE 0 END) / COUNT(*) as acceptance_rate
                    FROM user_feedback
                    WHERE feedback_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                    ${categories && categories.length > 0 ? 'AND category IN (' + categories.map(() => '?').join(',') + ')' : ''}
                    GROUP BY item_name, category
                    HAVING feedback_count >= 2
                `, [analysisDepthDays, ...(categories || [])]);

                // Generate base recommendations using existing logic
                const baseRecommendations = await generateBaseRecommendations(connection, {
                    analysisDepthDays,
                    categories
                });

                // Apply personalization based on learning
                const personalizedRecommendations = baseRecommendations.map((rec: any) => {
                    let adjustedRec = { ...rec };

                    if (applyLearning) {
                        // Apply category-specific preferences
                        const categoryPref = userPreferences.get(`category_priority:${rec.category}`);
                        if (categoryPref) {
                            adjustedRec.priority = Math.min(5, Math.max(1,
                                Math.round(rec.priority * categoryPref.value)
                            ));
                            adjustedRec.reason += ` (基于用户偏好调整，置信度: ${Math.round(categoryPref.confidence * 100)}%)`;
                        }

                        // Apply item-specific learning from feedback history
                        const itemFeedback = (feedbackHistory as any[]).find(f => f.item_name === rec.item_name);
                        if (itemFeedback) {
                            if (itemFeedback.acceptance_rate < 0.3) {
                                // Low acceptance rate - reduce priority
                                adjustedRec.priority = Math.max(1, adjustedRec.priority - 1);
                                adjustedRec.reason += ` (历史接受率较低: ${Math.round(itemFeedback.acceptance_rate * 100)}%)`;
                            } else if (itemFeedback.acceptance_rate > 0.8) {
                                // High acceptance rate - increase priority
                                adjustedRec.priority = Math.min(5, adjustedRec.priority + 1);
                                adjustedRec.reason += ` (历史接受率较高: ${Math.round(itemFeedback.acceptance_rate * 100)}%)`;
                            }

                            // Adjust quantity based on user preferences
                            if (itemFeedback.avg_preferred_quantity !== rec.suggested_quantity) {
                                adjustedRec.suggested_quantity = Math.round(
                                    (rec.suggested_quantity + itemFeedback.avg_preferred_quantity) / 2
                                );
                                adjustedRec.reason += ` (基于历史偏好调整数量)`;
                            }
                        }

                        // Apply seasonal learning adjustments
                        const currentMonth = new Date().getMonth() + 1;
                        const seasonalPref = userPreferences.get(`seasonal_adjustment:${rec.category}:${currentMonth}`);
                        if (seasonalPref && seasonalPref.confidence > 0.5) {
                            adjustedRec.suggested_quantity = Math.round(
                                adjustedRec.suggested_quantity * seasonalPref.value
                            );
                            adjustedRec.reason += ` (季节性学习调整)`;
                        }
                    }

                    // Add personalization metadata
                    adjustedRec.personalization_applied = applyLearning;
                    adjustedRec.learning_confidence = applyLearning ?
                        calculateOverallConfidence(rec, userPreferences, feedbackHistory as any[]) : 0;

                    return adjustedRec;
                });

                // Sort by priority and learning confidence
                personalizedRecommendations.sort((a, b) => {
                    if (a.priority !== b.priority) {
                        return b.priority - a.priority;
                    }
                    return b.learning_confidence - a.learning_confidence;
                });

                return {
                    recommendations: personalizedRecommendations.slice(0, 20),
                    personalization_applied: applyLearning,
                    user_preferences_count: userPreferences.size,
                    feedback_patterns_used: (feedbackHistory as any[]).length,
                    analysis_period_days: analysisDepthDays
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
            logger.error('Failed to get personalized recommendations', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const updateRecommendationMetricsTool = new DynamicTool({
    name: 'update_recommendation_metrics',
    description: '更新推荐性能指标。输入: {"date": "统计日期(YYYY-MM-DD)", "forceRecalculate": 是否强制重新计算}',
    func: async (input: string) => {
        try {
            const { date, forceRecalculate = false } = JSON.parse(input);
            const targetDate = date || new Date().toISOString().split('T')[0];

            const result = await databaseService.transaction(async (connection) => {
                // Check if metrics already exist for this date
                const [existingMetrics] = await connection.execute(
                    'SELECT * FROM recommendation_metrics WHERE metric_date = ?',
                    [targetDate]
                );

                if (!forceRecalculate && Array.isArray(existingMetrics) && existingMetrics.length > 0) {
                    return {
                        message: '指标已存在，使用 forceRecalculate: true 强制重新计算',
                        existingMetrics: existingMetrics[0]
                    };
                }

                // Calculate metrics for the date
                const [feedbackStats] = await connection.execute(`
                    SELECT
                        COUNT(*) as total_recommendations,
                        SUM(CASE WHEN user_action = 'accepted' THEN 1 ELSE 0 END) as accepted_recommendations,
                        SUM(CASE WHEN user_action = 'rejected' THEN 1 ELSE 0 END) as rejected_recommendations,
                        SUM(CASE WHEN user_action = 'modified' THEN 1 ELSE 0 END) as modified_recommendations,
                        AVG(CASE
                            WHEN user_action IN ('accepted', 'modified') AND actual_priority IS NOT NULL
                            THEN ABS(recommended_priority - actual_priority)
                            ELSE NULL
                        END) as avg_priority_diff,
                        AVG(CASE
                            WHEN user_action IN ('accepted', 'modified') AND actual_quantity IS NOT NULL
                            THEN ABS(recommended_quantity - actual_quantity) / recommended_quantity
                            ELSE NULL
                        END) as avg_quantity_diff_ratio
                    FROM user_feedback
                    WHERE DATE(feedback_date) = ?
                `, [targetDate]);

                const stats = (feedbackStats as any[])[0];
                const acceptanceRate = stats.total_recommendations > 0 ?
                    (stats.accepted_recommendations / stats.total_recommendations) * 100 : 0;

                const priorityAccuracy = stats.avg_priority_diff !== null ?
                    Math.max(0, 100 - (stats.avg_priority_diff * 25)) : 0; // 25% penalty per priority level difference

                const quantityAccuracy = stats.avg_quantity_diff_ratio !== null ?
                    Math.max(0, 100 - (stats.avg_quantity_diff_ratio * 100)) : 0;

                // Insert or update metrics
                await connection.execute(`
                    INSERT INTO recommendation_metrics
                    (metric_date, total_recommendations, accepted_recommendations, rejected_recommendations,
                     modified_recommendations, acceptance_rate, avg_priority_accuracy, avg_quantity_accuracy)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    total_recommendations = VALUES(total_recommendations),
                    accepted_recommendations = VALUES(accepted_recommendations),
                    rejected_recommendations = VALUES(rejected_recommendations),
                    modified_recommendations = VALUES(modified_recommendations),
                    acceptance_rate = VALUES(acceptance_rate),
                    avg_priority_accuracy = VALUES(avg_priority_accuracy),
                    avg_quantity_accuracy = VALUES(avg_quantity_accuracy),
                    updated_at = CURRENT_TIMESTAMP
                `, [
                    targetDate,
                    stats.total_recommendations,
                    stats.accepted_recommendations,
                    stats.rejected_recommendations,
                    stats.modified_recommendations,
                    acceptanceRate,
                    priorityAccuracy,
                    quantityAccuracy
                ]);

                return {
                    date: targetDate,
                    metrics: {
                        total_recommendations: stats.total_recommendations,
                        accepted_recommendations: stats.accepted_recommendations,
                        rejected_recommendations: stats.rejected_recommendations,
                        modified_recommendations: stats.modified_recommendations,
                        acceptance_rate: Math.round(acceptanceRate * 100) / 100,
                        avg_priority_accuracy: Math.round(priorityAccuracy * 100) / 100,
                        avg_quantity_accuracy: Math.round(quantityAccuracy * 100) / 100
                    }
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
            logger.error('Failed to update recommendation metrics', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

// Helper functions for user feedback learning

async function updateUserPreferencesFromFeedback(feedback: {
    itemName: string;
    category?: string;
    userAction: string;
    recommendedQuantity?: number;
    actualQuantity?: number;
    recommendedPriority?: number;
    actualPriority?: number;
}): Promise<void> {
    try {
        const updates = await generateLearningUpdates(feedback);

        for (const update of updates) {
            await databaseService.query(
                `INSERT INTO user_preferences (preference_type, preference_key, preference_value, confidence_score, sample_count)
                VALUES (?, ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE
                preference_value = (preference_value * sample_count + VALUES(preference_value)) / (sample_count + 1),
                confidence_score = LEAST(1.0, confidence_score + 0.05),
                sample_count = sample_count + 1`,
                [update.preferenceType, update.preferenceKey, update.preferenceValue, update.confidenceScore]
            );
        }
    } catch (error) {
        logger.error('Failed to update user preferences from feedback', { error });
    }
}

async function generateLearningUpdates(feedback: any): Promise<any[]> {
    const updates: any[] = [];

    // Category preference learning
    if (feedback.category) {
        let categoryWeight = 1.0;

        if (feedback.userAction === 'accepted') {
            categoryWeight = 1.2; // Increase preference for this category
        } else if (feedback.userAction === 'rejected') {
            categoryWeight = 0.8; // Decrease preference for this category
        }

        updates.push({
            preferenceType: 'category_priority',
            preferenceKey: feedback.category,
            preferenceValue: categoryWeight,
            confidenceScore: 0.6
        });
    }

    // Quantity preference learning
    if (feedback.actualQuantity && feedback.recommendedQuantity) {
        const quantityRatio = feedback.actualQuantity / feedback.recommendedQuantity;

        updates.push({
            preferenceType: 'quantity_adjustment',
            preferenceKey: feedback.itemName,
            preferenceValue: quantityRatio,
            confidenceScore: 0.7
        });
    }

    // Priority preference learning
    if (feedback.actualPriority && feedback.recommendedPriority) {
        const priorityRatio = feedback.actualPriority / feedback.recommendedPriority;

        updates.push({
            preferenceType: 'priority_adjustment',
            preferenceKey: feedback.category || 'general',
            preferenceValue: priorityRatio,
            confidenceScore: 0.5
        });
    }

    // Seasonal learning (based on current month)
    const currentMonth = new Date().getMonth() + 1;
    if (feedback.category && feedback.userAction === 'accepted') {
        updates.push({
            preferenceType: 'seasonal_adjustment',
            preferenceKey: `${feedback.category}:${currentMonth}`,
            preferenceValue: 1.1, // Slight increase for accepted items in current season
            confidenceScore: 0.4
        });
    }

    return updates;
}

async function generateBaseRecommendations(connection: any, options: {
    analysisDepthDays: number;
    categories?: string[];
}): Promise<any[]> {
    // This is a simplified version of the existing recommendation logic
    // In a real implementation, this would call the existing generatePurchaseRecommendationsTool logic

    const { analysisDepthDays, categories } = options;

    // Get current inventory levels
    let inventoryQuery = 'SELECT * FROM inventory WHERE current_quantity >= 0';
    const inventoryParams: any[] = [];

    if (categories && categories.length > 0) {
        inventoryQuery += ' AND category IN (' + categories.map(() => '?').join(',') + ')';
        inventoryParams.push(...categories);
    }

    const [inventoryItems] = await connection.execute(inventoryQuery, inventoryParams);

    // Generate basic recommendations (simplified)
    const recommendations = (inventoryItems as any[])
        .filter(item => item.current_quantity <= 5) // Low stock items
        .map(item => ({
            item_name: item.item_name,
            category: item.category,
            current_quantity: item.current_quantity,
            suggested_quantity: Math.max(1, 10 - item.current_quantity),
            priority: item.current_quantity === 0 ? 5 : item.current_quantity <= 2 ? 4 : 3,
            reason: `库存较低 (当前: ${item.current_quantity})`,
            learning_confidence: 0
        }));

    return recommendations;
}

function calculateOverallConfidence(recommendation: any, userPreferences: Map<string, any>, feedbackHistory: any[]): number {
    let confidence = 0.5; // Base confidence

    // Category preference confidence
    const categoryPref = userPreferences.get(`category_priority:${recommendation.category}`);
    if (categoryPref) {
        confidence += categoryPref.confidence * 0.3;
    }

    // Item-specific feedback confidence
    const itemFeedback = feedbackHistory.find((f: any) => f.item_name === recommendation.item_name);
    if (itemFeedback && itemFeedback.feedback_count >= 3) {
        confidence += Math.min(0.4, itemFeedback.feedback_count * 0.1);
    }

    return Math.min(1.0, confidence);
}

export function createUserFeedbackTools(): DynamicTool[] {
    return [
        recordUserFeedbackTool,
        processRecommendationFeedbackTool,
        getPersonalizedRecommendationsTool,
        updateRecommendationMetricsTool
    ];
}

export function createAllDatabaseTools(): DynamicTool[] {
    return [
        ...createInventoryTools(),
        ...createOrderTools(),
        ...createShoppingListTools(),
        ...createProcurementTools(),
        ...createFinancialTools(),
        ...createUserFeedbackTools()
    ];
}

// Notification-related database tools

export const getUserPreferencesTool = new DynamicTool({
    name: 'get_user_preferences',
    description: '获取用户通知偏好设置。输入: {"userId": "用户ID"}',
    func: async (input: string) => {
        try {
            const { userId } = JSON.parse(input);

            if (!userId) {
                return JSON.stringify({
                    success: false,
                    error: '用户ID不能为空'
                });
            }

            const result = await databaseService.query(
                'SELECT * FROM user_preferences WHERE user_id = ?',
                [userId]
            );

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data && result.data.length > 0 ? result.data[0] : null
            });

        } catch (error) {
            logger.error('Failed to get user preferences', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const saveUserPreferencesTool = new DynamicTool({
    name: 'save_user_preferences',
    description: '保存用户通知偏好设置。输入: {"userId": "用户ID", "preferences": {"enabledChannels": ["渠道"], "quietHours": {"start": "22:00", "end": "08:00"}, "categoryPreferences": {"类别": true/false}, "language": "zh-CN"}}',
    func: async (input: string) => {
        try {
            const { userId, preferences } = JSON.parse(input);

            if (!userId || !preferences) {
                return JSON.stringify({
                    success: false,
                    error: '用户ID和偏好设置不能为空'
                });
            }

            // Check if preferences exist
            const existingResult = await databaseService.query(
                'SELECT id FROM user_preferences WHERE user_id = ?',
                [userId]
            );

            let result;
            if (existingResult.success && existingResult.data && existingResult.data.length > 0) {
                // Update existing preferences
                result = await databaseService.query(
                    `UPDATE user_preferences SET
                     enabled_channels = ?,
                     quiet_hours = ?,
                     category_preferences = ?,
                     language = ?,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = ?`,
                    [
                        JSON.stringify(preferences.enabledChannels || []),
                        JSON.stringify(preferences.quietHours || {}),
                        JSON.stringify(preferences.categoryPreferences || {}),
                        preferences.language || 'zh-CN',
                        userId
                    ]
                );
            } else {
                // Insert new preferences
                result = await databaseService.query(
                    `INSERT INTO user_preferences
                     (user_id, enabled_channels, quiet_hours, category_preferences, language, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    [
                        userId,
                        JSON.stringify(preferences.enabledChannels || []),
                        JSON.stringify(preferences.quietHours || {}),
                        JSON.stringify(preferences.categoryPreferences || {}),
                        preferences.language || 'zh-CN'
                    ]
                );
            }

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: {
                    userId,
                    preferences,
                    message: '用户偏好设置已保存'
                }
            });

        } catch (error) {
            logger.error('Failed to save user preferences', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getNotificationHistoryTool = new DynamicTool({
    name: 'get_notification_history',
    description: '获取用户通知历史记录。输入: {"userId": "用户ID", "limit": 限制数量, "offset": 偏移量, "type": "通知类型筛选"}',
    func: async (input: string) => {
        try {
            const { userId, limit = 50, offset = 0, type } = JSON.parse(input);

            if (!userId) {
                return JSON.stringify({
                    success: false,
                    error: '用户ID不能为空'
                });
            }

            let query = 'SELECT * FROM notification_history WHERE user_id = ?';
            const params = [userId];

            if (type) {
                query += ' AND notification_type = ?';
                params.push(type);
            }

            query += ' ORDER BY sent_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            const result = await databaseService.query(query, params);

            if (!result.success) {
                return JSON.stringify({
                    success: false,
                    error: result.error
                });
            }

            return JSON.stringify({
                success: true,
                data: result.data || [],
                count: Array.isArray(result.data) ? result.data.length : 0
            });

        } catch (error) {
            logger.error('Failed to get notification history', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const saveNotificationHistoryTool = new DynamicTool({
    name: 'save_notification_history',
    description: '保存通知历史记录。输入: {"userId": "用户ID", "notificationId": "通知ID", "type": "通知类型", "channel": "发送渠道", "title": "标题", "content": "内容", "wasRead": 是否已读, "wasActioned": 是否已操作}',
    func: async (input: string) => {
        try {
            const {
                userId,
                notificationId,
                type,
                channel,
                title,
                content,
                wasRead = false,
                wasActioned = false
            } = JSON.parse(input);

            if (!userId || !notificationId || !type || !channel) {
                return JSON.stringify({
                    success: false,
                    error: '用户ID、通知ID、类型和渠道不能为空'
                });
            }

            const result = await databaseService.query(
                `INSERT INTO notification_history
                 (user_id, notification_id, notification_type, channel, title, content, was_read, was_actioned, sent_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [userId, notificationId, type, channel, title, content, wasRead, wasActioned]
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
                    userId,
                    notificationId,
                    type,
                    channel,
                    message: '通知历史记录已保存'
                }
            });

        } catch (error) {
            logger.error('Failed to save notification history', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const updateNotificationStatusTool = new DynamicTool({
    name: 'update_notification_status',
    description: '更新通知状态（已读、已操作等）。输入: {"notificationId": "通知ID", "wasRead": 是否已读, "wasActioned": 是否已操作, "actionData": "操作数据"}',
    func: async (input: string) => {
        try {
            const { notificationId, wasRead, wasActioned, actionData } = JSON.parse(input);

            if (!notificationId) {
                return JSON.stringify({
                    success: false,
                    error: '通知ID不能为空'
                });
            }

            const updates = [];
            const params = [];

            if (wasRead !== undefined) {
                updates.push('was_read = ?');
                params.push(wasRead);
            }

            if (wasActioned !== undefined) {
                updates.push('was_actioned = ?');
                params.push(wasActioned);
            }

            if (actionData !== undefined) {
                updates.push('action_data = ?');
                params.push(JSON.stringify(actionData));
            }

            if (updates.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: '没有提供要更新的状态'
                });
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(notificationId);

            const result = await databaseService.query(
                `UPDATE notification_history SET ${updates.join(', ')} WHERE notification_id = ?`,
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
                data: {
                    notificationId,
                    updatedFields: updates.length - 1, // Exclude updated_at
                    message: '通知状态已更新'
                }
            });

        } catch (error) {
            logger.error('Failed to update notification status', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});

export const getNotificationAnalyticsTool = new DynamicTool({
    name: 'get_notification_analytics',
    description: '获取通知分析数据。输入: {"startDate": "开始日期", "endDate": "结束日期", "userId": "用户ID(可选)", "type": "通知类型(可选)", "channel": "渠道(可选)"}',
    func: async (input: string) => {
        try {
            const { startDate, endDate, userId, type, channel } = JSON.parse(input);

            if (!startDate || !endDate) {
                return JSON.stringify({
                    success: false,
                    error: '开始日期和结束日期不能为空'
                });
            }

            let whereClause = 'WHERE sent_at BETWEEN ? AND ?';
            const params = [startDate, endDate];

            if (userId) {
                whereClause += ' AND user_id = ?';
                params.push(userId);
            }

            if (type) {
                whereClause += ' AND notification_type = ?';
                params.push(type);
            }

            if (channel) {
                whereClause += ' AND channel = ?';
                params.push(channel);
            }

            // Get overall statistics
            const statsResult = await databaseService.query(
                `SELECT
                    COUNT(*) as total_notifications,
                    SUM(CASE WHEN was_read = 1 THEN 1 ELSE 0 END) as read_notifications,
                    SUM(CASE WHEN was_actioned = 1 THEN 1 ELSE 0 END) as actioned_notifications,
                    COUNT(DISTINCT user_id) as unique_users
                 FROM notification_history ${whereClause}`,
                params
            );

            // Get channel breakdown
            const channelResult = await databaseService.query(
                `SELECT
                    channel,
                    COUNT(*) as count,
                    SUM(CASE WHEN was_read = 1 THEN 1 ELSE 0 END) as read_count,
                    SUM(CASE WHEN was_actioned = 1 THEN 1 ELSE 0 END) as action_count
                 FROM notification_history ${whereClause}
                 GROUP BY channel`,
                params
            );

            // Get type breakdown
            const typeResult = await databaseService.query(
                `SELECT
                    notification_type,
                    COUNT(*) as count,
                    SUM(CASE WHEN was_read = 1 THEN 1 ELSE 0 END) as read_count,
                    SUM(CASE WHEN was_actioned = 1 THEN 1 ELSE 0 END) as action_count
                 FROM notification_history ${whereClause}
                 GROUP BY notification_type`,
                params
            );

            if (!statsResult.success || !channelResult.success || !typeResult.success) {
                return JSON.stringify({
                    success: false,
                    error: '查询通知分析数据失败'
                });
            }

            const stats = statsResult.data && statsResult.data.length > 0 ? statsResult.data[0] : {};
            const totalNotifications = stats.total_notifications || 0;

            return JSON.stringify({
                success: true,
                data: {
                    period: { startDate, endDate },
                    overall: {
                        totalNotifications,
                        readNotifications: stats.read_notifications || 0,
                        actionedNotifications: stats.actioned_notifications || 0,
                        uniqueUsers: stats.unique_users || 0,
                        readRate: totalNotifications > 0 ? ((stats.read_notifications || 0) / totalNotifications * 100).toFixed(2) : '0.00',
                        actionRate: totalNotifications > 0 ? ((stats.actioned_notifications || 0) / totalNotifications * 100).toFixed(2) : '0.00'
                    },
                    byChannel: channelResult.data || [],
                    byType: typeResult.data || []
                }
            });

        } catch (error) {
            logger.error('Failed to get notification analytics', { error });
            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
});
