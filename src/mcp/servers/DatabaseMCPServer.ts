/**
 * Database MCP Server - Provides database operations for the shopping assistant system
 */

import mysql from 'mysql2/promise';
import { BaseMCPServer } from '../base/BaseMCPServer';
import { MCPServerConfig, MCPToolDefinition } from '@/types/mcp.types';

interface DatabaseConnectionConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
    timeout: number;
}

interface InventoryItem {
    id: number;
    item_name: string;
    category?: string;
    current_quantity: number;
    unit?: string;
    storage_location?: string;
    production_date?: Date;
    expiry_date?: Date;
    warranty_period_days: number;
    created_at: Date;
    updated_at: Date;
}

interface CreateInventoryItem {
    item_name: string;
    category?: string;
    current_quantity: number;
    unit?: string;
    storage_location?: string;
    production_date?: Date;
    expiry_date?: Date;
    warranty_period_days?: number;
}

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
}

interface ShoppingListItem {
    id: number;
    item_name: string;
    suggested_quantity?: number;
    priority: number;
    status: string;
    reason?: string;
    added_date: Date;
    completed_date?: Date;
}

interface CreateShoppingListItem {
    item_name: string;
    suggested_quantity?: number;
    priority?: number;
    status?: string;
    reason?: string;
}

interface SearchCriteria {
    category?: string;
    item_name?: string;
    low_stock_threshold?: number;
    expiry_within_days?: number;
}

interface OrderFilters {
    start_date?: Date;
    end_date?: Date;
    store_name?: string;
    purchase_channel?: string;
    min_amount?: number;
    max_amount?: number;
}

interface DateRange {
    start_date: Date;
    end_date: Date;
}

interface CategorySpending {
    category: string;
    total_amount: number;
    item_count: number;
    avg_price: number;
}

interface MonthlyReport {
    month: string;
    total_spending: number;
    total_orders: number;
    categories: CategorySpending[];
    top_stores: Array<{ store_name: string; total_amount: number; order_count: number }>;
}

interface SpendingAnomaly {
    order_id: string;
    store_name: string;
    total_price: number;
    purchase_date: Date;
    anomaly_score: number;
    reason: string;
}

interface DatabaseOperation {
    type: 'insert' | 'update' | 'delete' | 'select';
    table: string;
    data?: any;
    where?: any;
    sql?: string;
    params?: any[];
}

interface TransactionResult {
    success: boolean;
    results: any[];
    error?: string;
}

interface QueryResult {
    rows: any[];
    fields: mysql.FieldPacket[];
    affectedRows?: number;
    insertId?: number;
}

export class DatabaseMCPServer extends BaseMCPServer {
    private pool?: mysql.Pool;
    private connectionConfig: DatabaseConnectionConfig;

    constructor(config: MCPServerConfig) {
        super(config);

        // Parse connection string to extract database configuration
        this.connectionConfig = this.parseConnectionString(config.connectionString);
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Database MCP Server');

        // Create connection pool
        this.pool = mysql.createPool({
            host: this.connectionConfig.host,
            port: this.connectionConfig.port,
            user: this.connectionConfig.user,
            password: this.connectionConfig.password,
            database: this.connectionConfig.database,
            connectionLimit: this.connectionConfig.connectionLimit,
            multipleStatements: false,
            timezone: '+00:00'
        });

        this.logger.info('Database connection pool created');
    }

    protected async onConnect(): Promise<void> {
        if (!this.pool) {
            throw new Error('Database pool not initialized');
        }

        // Test connection
        const connection = await this.pool.getConnection();
        try {
            await connection.ping();
            this.logger.info('Database connection established successfully');
        } finally {
            connection.release();
        }
    }

    protected async onDisconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = undefined;
            this.logger.info('Database connection pool closed');
        }
    }

    protected async onHealthCheck(): Promise<boolean> {
        if (!this.pool) {
            return false;
        }

        try {
            const connection = await this.pool.getConnection();
            try {
                await connection.ping();
                return true;
            } finally {
                connection.release();
            }
        } catch (error) {
            this.logger.error('Database health check failed', { error });
            return false;
        }
    }

    protected async onCallTool<T = any>(toolName: string, parameters: any): Promise<T> {
        if (!this.pool) {
            throw new Error('Database not connected');
        }

        switch (toolName) {
            // Inventory operations
            case 'getInventoryItem':
                return this.getInventoryItem(parameters.itemName) as T;
            case 'updateInventoryQuantity':
                return this.updateInventoryQuantity(parameters.itemId, parameters.quantity) as T;
            case 'addInventoryItem':
                return this.addInventoryItem(parameters.item) as T;
            case 'searchInventoryItems':
                return this.searchInventoryItems(parameters.criteria) as T;

            // Order operations
            case 'createOrder':
                return this.createOrder(parameters.order) as T;
            case 'getOrderHistory':
                return this.getOrderHistory(parameters.filters) as T;
            case 'updateOrderStatus':
                return this.updateOrderStatus(parameters.orderId, parameters.status) as T;

            // Shopping list operations
            case 'getShoppingList':
                return this.getShoppingList() as T;
            case 'addToShoppingList':
                return this.addToShoppingList(parameters.item) as T;
            case 'updateShoppingListItem':
                return this.updateShoppingListItem(parameters.id, parameters.updates) as T;
            case 'removeFromShoppingList':
                return this.removeFromShoppingList(parameters.id) as T;

            // Financial analysis operations
            case 'getSpendingByCategory':
                return this.getSpendingByCategory(parameters.dateRange) as T;
            case 'getMonthlyReport':
                return this.getMonthlyReport(parameters.month) as T;
            case 'detectAnomalousSpending':
                return this.detectAnomalousSpending(parameters.threshold) as T;

            // Generic operations
            case 'executeQuery':
                return this.executeQuery(parameters.sql, parameters.params) as T;
            case 'executeTransaction':
                return this.executeTransaction(parameters.operations) as T;

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    protected async onGetAvailableTools(): Promise<MCPToolDefinition[]> {
        return [
            // Inventory tools
            {
                name: 'getInventoryItem',
                description: 'Get inventory item by name',
                inputSchema: {
                    type: 'object',
                    properties: {
                        itemName: { type: 'string', description: 'Name of the inventory item' }
                    },
                    required: ['itemName']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        id: { type: 'number' },
                        item_name: { type: 'string' },
                        current_quantity: { type: 'number' },
                        unit: { type: 'string' }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'updateInventoryQuantity',
                description: 'Update inventory item quantity',
                inputSchema: {
                    type: 'object',
                    properties: {
                        itemId: { type: 'string', description: 'ID of the inventory item' },
                        quantity: { type: 'number', description: 'New quantity' }
                    },
                    required: ['itemId', 'quantity']
                },
                outputSchema: {
                    type: 'boolean'
                },
                serverName: this.config.serverName
            },
            {
                name: 'addInventoryItem',
                description: 'Add new inventory item',
                inputSchema: {
                    type: 'object',
                    properties: {
                        item: {
                            type: 'object',
                            properties: {
                                item_name: { type: 'string' },
                                category: { type: 'string' },
                                current_quantity: { type: 'number' },
                                unit: { type: 'string' },
                                storage_location: { type: 'string' },
                                production_date: { type: 'string', format: 'date' },
                                expiry_date: { type: 'string', format: 'date' },
                                warranty_period_days: { type: 'number' }
                            },
                            required: ['item_name', 'current_quantity']
                        }
                    },
                    required: ['item']
                },
                outputSchema: {
                    type: 'string'
                },
                serverName: this.config.serverName
            },
            {
                name: 'searchInventoryItems',
                description: 'Search inventory items with criteria',
                inputSchema: {
                    type: 'object',
                    properties: {
                        criteria: {
                            type: 'object',
                            properties: {
                                category: { type: 'string' },
                                item_name: { type: 'string' },
                                low_stock_threshold: { type: 'number' },
                                expiry_within_days: { type: 'number' }
                            }
                        }
                    },
                    required: ['criteria']
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'number' },
                            item_name: { type: 'string' },
                            current_quantity: { type: 'number' }
                        }
                    }
                },
                serverName: this.config.serverName
            },

            // Order tools
            {
                name: 'createOrder',
                description: 'Create new purchase order',
                inputSchema: {
                    type: 'object',
                    properties: {
                        order: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                store_name: { type: 'string' },
                                total_price: { type: 'number' },
                                delivery_cost: { type: 'number' },
                                pay_fee: { type: 'number' },
                                purchase_date: { type: 'string', format: 'date-time' },
                                purchase_channel: { type: 'string' }
                            },
                            required: ['id', 'store_name']
                        }
                    },
                    required: ['order']
                },
                outputSchema: {
                    type: 'string'
                },
                serverName: this.config.serverName
            },
            {
                name: 'getOrderHistory',
                description: 'Get order history with filters',
                inputSchema: {
                    type: 'object',
                    properties: {
                        filters: {
                            type: 'object',
                            properties: {
                                start_date: { type: 'string', format: 'date' },
                                end_date: { type: 'string', format: 'date' },
                                store_name: { type: 'string' },
                                purchase_channel: { type: 'string' },
                                min_amount: { type: 'number' },
                                max_amount: { type: 'number' }
                            }
                        }
                    },
                    required: ['filters']
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            store_name: { type: 'string' },
                            total_price: { type: 'number' },
                            purchase_date: { type: 'string' }
                        }
                    }
                },
                serverName: this.config.serverName
            },

            // Shopping list tools
            {
                name: 'getShoppingList',
                description: 'Get current shopping list',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'number' },
                            item_name: { type: 'string' },
                            suggested_quantity: { type: 'number' },
                            priority: { type: 'number' },
                            status: { type: 'string' }
                        }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'addToShoppingList',
                description: 'Add item to shopping list',
                inputSchema: {
                    type: 'object',
                    properties: {
                        item: {
                            type: 'object',
                            properties: {
                                item_name: { type: 'string' },
                                suggested_quantity: { type: 'number' },
                                priority: { type: 'number' },
                                status: { type: 'string' },
                                reason: { type: 'string' }
                            },
                            required: ['item_name']
                        }
                    },
                    required: ['item']
                },
                outputSchema: {
                    type: 'string'
                },
                serverName: this.config.serverName
            },

            // Financial analysis tools
            {
                name: 'getSpendingByCategory',
                description: 'Get spending analysis by category',
                inputSchema: {
                    type: 'object',
                    properties: {
                        dateRange: {
                            type: 'object',
                            properties: {
                                start_date: { type: 'string', format: 'date' },
                                end_date: { type: 'string', format: 'date' }
                            },
                            required: ['start_date', 'end_date']
                        }
                    },
                    required: ['dateRange']
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            category: { type: 'string' },
                            total_amount: { type: 'number' },
                            item_count: { type: 'number' }
                        }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'getMonthlyReport',
                description: 'Generate monthly financial report',
                inputSchema: {
                    type: 'object',
                    properties: {
                        month: { type: 'string', description: 'Month in YYYY-MM format' }
                    },
                    required: ['month']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        month: { type: 'string' },
                        total_spending: { type: 'number' },
                        total_orders: { type: 'number' },
                        categories: { type: 'array' }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'detectAnomalousSpending',
                description: 'Detect anomalous spending patterns',
                inputSchema: {
                    type: 'object',
                    properties: {
                        threshold: { type: 'number', description: 'Anomaly detection threshold' }
                    },
                    required: ['threshold']
                },
                outputSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            order_id: { type: 'string' },
                            anomaly_score: { type: 'number' },
                            reason: { type: 'string' }
                        }
                    }
                },
                serverName: this.config.serverName
            },

            // Generic tools
            {
                name: 'executeQuery',
                description: 'Execute custom SQL query',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sql: { type: 'string', description: 'SQL query to execute' },
                        params: { type: 'array', description: 'Query parameters' }
                    },
                    required: ['sql', 'params']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        rows: { type: 'array' },
                        affectedRows: { type: 'number' }
                    }
                },
                serverName: this.config.serverName
            },
            {
                name: 'executeTransaction',
                description: 'Execute multiple operations in a transaction',
                inputSchema: {
                    type: 'object',
                    properties: {
                        operations: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['insert', 'update', 'delete', 'select'] },
                                    table: { type: 'string' },
                                    data: { type: 'object' },
                                    where: { type: 'object' },
                                    sql: { type: 'string' },
                                    params: { type: 'array' }
                                }
                            }
                        }
                    },
                    required: ['operations']
                },
                outputSchema: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        results: { type: 'array' }
                    }
                },
                serverName: this.config.serverName
            }
        ];
    }
    // Inventory operations
    private async getInventoryItem(itemName: string): Promise<InventoryItem | null> {
        const [rows] = await this.pool!.execute(
            'SELECT * FROM inventory WHERE item_name = ?',
            [itemName]
        );

        const items = rows as InventoryItem[];
        return items.length > 0 ? items[0] : null;
    }

    private async updateInventoryQuantity(itemId: string, quantity: number): Promise<boolean> {
        const [result] = await this.pool!.execute(
            'UPDATE inventory SET current_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [quantity, itemId]
        );

        const updateResult = result as mysql.ResultSetHeader;
        return updateResult.affectedRows > 0;
    }

    private async addInventoryItem(item: CreateInventoryItem): Promise<string> {
        const [result] = await this.pool!.execute(
            `INSERT INTO inventory (item_name, category, current_quantity, unit, storage_location,
             production_date, expiry_date, warranty_period_days)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.item_name,
                item.category || null,
                item.current_quantity,
                item.unit || null,
                item.storage_location || null,
                item.production_date || null,
                item.expiry_date || null,
                item.warranty_period_days || 0
            ]
        );

        const insertResult = result as mysql.ResultSetHeader;
        return insertResult.insertId.toString();
    }

    private async searchInventoryItems(criteria: SearchCriteria): Promise<InventoryItem[]> {
        let sql = 'SELECT * FROM inventory WHERE 1=1';
        const params: any[] = [];

        if (criteria.category) {
            sql += ' AND category = ?';
            params.push(criteria.category);
        }

        if (criteria.item_name) {
            sql += ' AND item_name LIKE ?';
            params.push(`%${criteria.item_name}%`);
        }

        if (criteria.low_stock_threshold) {
            sql += ' AND current_quantity <= ?';
            params.push(criteria.low_stock_threshold);
        }

        if (criteria.expiry_within_days) {
            sql += ' AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)';
            params.push(criteria.expiry_within_days);
        }

        sql += ' ORDER BY item_name';

        const [rows] = await this.pool!.execute(sql, params);
        return rows as InventoryItem[];
    }

    // Order operations
    private async createOrder(order: CreateOrder): Promise<string> {
        await this.pool!.execute(
            `INSERT INTO purchase_history (id, store_name, total_price, delivery_cost, pay_fee,
             purchase_date, purchase_channel) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                order.id,
                order.store_name,
                order.total_price || null,
                order.delivery_cost || null,
                order.pay_fee || null,
                order.purchase_date || null,
                order.purchase_channel || null
            ]
        );

        return order.id;
    }

    private async getOrderHistory(filters: OrderFilters): Promise<Order[]> {
        let sql = 'SELECT * FROM purchase_history WHERE 1=1';
        const params: any[] = [];

        if (filters.start_date) {
            sql += ' AND purchase_date >= ?';
            params.push(filters.start_date);
        }

        if (filters.end_date) {
            sql += ' AND purchase_date <= ?';
            params.push(filters.end_date);
        }

        if (filters.store_name) {
            sql += ' AND store_name LIKE ?';
            params.push(`%${filters.store_name}%`);
        }

        if (filters.purchase_channel) {
            sql += ' AND purchase_channel = ?';
            params.push(filters.purchase_channel);
        }

        if (filters.min_amount) {
            sql += ' AND total_price >= ?';
            params.push(filters.min_amount);
        }

        if (filters.max_amount) {
            sql += ' AND total_price <= ?';
            params.push(filters.max_amount);
        }

        sql += ' ORDER BY purchase_date DESC';

        const [rows] = await this.pool!.execute(sql, params);
        return rows as Order[];
    }

    private async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
        // Note: The current schema doesn't have a status field in purchase_history
        // This is a placeholder implementation that could be extended
        this.logger.warn('Order status update not implemented - schema missing status field', {
            orderId,
            status
        });
        return true;
    }

    // Shopping list operations
    private async getShoppingList(): Promise<ShoppingListItem[]> {
        const [rows] = await this.pool!.execute(
            'SELECT * FROM shopping_list ORDER BY priority DESC, added_date ASC'
        );

        return rows as ShoppingListItem[];
    }

    private async addToShoppingList(item: CreateShoppingListItem): Promise<string> {
        const [result] = await this.pool!.execute(
            `INSERT INTO shopping_list (item_name, suggested_quantity, priority, status, reason)
             VALUES (?, ?, ?, ?, ?)`,
            [
                item.item_name,
                item.suggested_quantity || null,
                item.priority || 1,
                item.status || 'pending',
                item.reason || null
            ]
        );

        const insertResult = result as mysql.ResultSetHeader;
        return insertResult.insertId.toString();
    }

    private async updateShoppingListItem(id: string, updates: Partial<ShoppingListItem>): Promise<boolean> {
        const fields: string[] = [];
        const params: any[] = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && value !== undefined) {
                fields.push(`${key} = ?`);
                params.push(value);
            }
        });

        if (fields.length === 0) {
            return false;
        }

        fields.push('completed_date = CASE WHEN status = "completed" THEN CURRENT_TIMESTAMP ELSE completed_date END');
        params.push(id);

        const [result] = await this.pool!.execute(
            `UPDATE shopping_list SET ${fields.join(', ')} WHERE id = ?`,
            params
        );

        const updateResult = result as mysql.ResultSetHeader;
        return updateResult.affectedRows > 0;
    }

    private async removeFromShoppingList(id: string): Promise<boolean> {
        const [result] = await this.pool!.execute(
            'DELETE FROM shopping_list WHERE id = ?',
            [id]
        );

        const deleteResult = result as mysql.ResultSetHeader;
        return deleteResult.affectedRows > 0;
    }
    // Financial analysis operations
    private async getSpendingByCategory(dateRange: DateRange): Promise<CategorySpending[]> {
        const [rows] = await this.pool!.execute(
            `SELECT
                psl.category,
                SUM(psl.unit_price * psl.purchase_quantity) as total_amount,
                COUNT(*) as item_count,
                AVG(psl.unit_price) as avg_price
             FROM purchase_sub_list psl
             JOIN purchase_history ph ON psl.parent_id = ph.id
             WHERE ph.purchase_date >= ? AND ph.purchase_date <= ?
             AND psl.category IS NOT NULL
             GROUP BY psl.category
             ORDER BY total_amount DESC`,
            [dateRange.start_date, dateRange.end_date]
        );

        return rows as CategorySpending[];
    }

    private async getMonthlyReport(month: string): Promise<MonthlyReport> {
        const startDate = `${month}-01`;
        const endDate = `${month}-31`;

        // Get total spending and order count
        const [totals] = await this.pool!.execute(
            `SELECT
                SUM(total_price) as total_spending,
                COUNT(*) as total_orders
             FROM purchase_history
             WHERE DATE_FORMAT(purchase_date, '%Y-%m') = ?`,
            [month]
        );

        const totalData = (totals as any[])[0];

        // Get category breakdown
        const categories = await this.getSpendingByCategory({
            start_date: new Date(startDate),
            end_date: new Date(endDate)
        });

        // Get top stores
        const [stores] = await this.pool!.execute(
            `SELECT
                store_name,
                SUM(total_price) as total_amount,
                COUNT(*) as order_count
             FROM purchase_history
             WHERE DATE_FORMAT(purchase_date, '%Y-%m') = ?
             GROUP BY store_name
             ORDER BY total_amount DESC
             LIMIT 10`,
            [month]
        );

        return {
            month,
            total_spending: totalData.total_spending || 0,
            total_orders: totalData.total_orders || 0,
            categories,
            top_stores: stores as Array<{ store_name: string; total_amount: number; order_count: number }>
        };
    }

    private async detectAnomalousSpending(threshold: number): Promise<SpendingAnomaly[]> {
        // Simple anomaly detection based on spending amount deviation
        const [rows] = await this.pool!.execute(
            `SELECT
                id as order_id,
                store_name,
                total_price,
                purchase_date,
                (total_price - avg_price) / stddev_price as anomaly_score,
                CASE
                    WHEN total_price > avg_price + (? * stddev_price) THEN 'Unusually high spending'
                    WHEN total_price < avg_price - (? * stddev_price) THEN 'Unusually low spending'
                    ELSE 'Normal spending'
                END as reason
             FROM (
                SELECT *,
                    AVG(total_price) OVER() as avg_price,
                    STDDEV(total_price) OVER() as stddev_price
                FROM purchase_history
                WHERE total_price IS NOT NULL
                AND purchase_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
             ) t
             WHERE ABS((total_price - avg_price) / stddev_price) > ?
             ORDER BY ABS(anomaly_score) DESC`,
            [threshold, threshold, threshold]
        );

        return rows as SpendingAnomaly[];
    }

    // Generic operations
    private async executeQuery(sql: string, params: any[]): Promise<QueryResult> {
        const [rows, fields] = await this.pool!.execute(sql, params);

        return {
            rows: rows as any[],
            fields: fields as mysql.FieldPacket[],
            affectedRows: (rows as any).affectedRows,
            insertId: (rows as any).insertId
        };
    }

    private async executeTransaction(operations: DatabaseOperation[]): Promise<TransactionResult> {
        const connection = await this.pool!.getConnection();

        try {
            await connection.beginTransaction();

            const results: any[] = [];

            for (const operation of operations) {
                let result;

                if (operation.sql) {
                    // Custom SQL
                    [result] = await connection.execute(operation.sql, operation.params || []);
                } else {
                    // Generated SQL based on operation type
                    switch (operation.type) {
                        case 'insert':
                            result = await this.generateInsertQuery(connection, operation);
                            break;
                        case 'update':
                            result = await this.generateUpdateQuery(connection, operation);
                            break;
                        case 'delete':
                            result = await this.generateDeleteQuery(connection, operation);
                            break;
                        case 'select':
                            result = await this.generateSelectQuery(connection, operation);
                            break;
                        default:
                            throw new Error(`Unsupported operation type: ${operation.type}`);
                    }
                }

                results.push(result);
            }

            await connection.commit();

            return {
                success: true,
                results
            };

        } catch (error) {
            await connection.rollback();

            return {
                success: false,
                results: [],
                error: error instanceof Error ? error.message : String(error)
            };
        } finally {
            connection.release();
        }
    }

    // Helper methods for transaction operations
    private async generateInsertQuery(connection: mysql.PoolConnection, operation: DatabaseOperation): Promise<any> {
        const fields = Object.keys(operation.data!);
        const values = Object.values(operation.data!);
        const placeholders = fields.map(() => '?').join(', ');

        const sql = `INSERT INTO ${operation.table} (${fields.join(', ')}) VALUES (${placeholders})`;
        const [result] = await connection.execute(sql, values);

        return result;
    }

    private async generateUpdateQuery(connection: mysql.PoolConnection, operation: DatabaseOperation): Promise<any> {
        const setFields = Object.keys(operation.data!).map(field => `${field} = ?`).join(', ');
        const setValues = Object.values(operation.data!);

        const whereFields = Object.keys(operation.where!).map(field => `${field} = ?`).join(' AND ');
        const whereValues = Object.values(operation.where!);

        const sql = `UPDATE ${operation.table} SET ${setFields} WHERE ${whereFields}`;
        const [result] = await connection.execute(sql, [...setValues, ...whereValues]);

        return result;
    }

    private async generateDeleteQuery(connection: mysql.PoolConnection, operation: DatabaseOperation): Promise<any> {
        const whereFields = Object.keys(operation.where!).map(field => `${field} = ?`).join(' AND ');
        const whereValues = Object.values(operation.where!);

        const sql = `DELETE FROM ${operation.table} WHERE ${whereFields}`;
        const [result] = await connection.execute(sql, whereValues);

        return result;
    }

    private async generateSelectQuery(connection: mysql.PoolConnection, operation: DatabaseOperation): Promise<any> {
        let sql = `SELECT * FROM ${operation.table}`;
        let params: any[] = [];

        if (operation.where && Object.keys(operation.where).length > 0) {
            const whereFields = Object.keys(operation.where).map(field => `${field} = ?`).join(' AND ');
            const whereValues = Object.values(operation.where);

            sql += ` WHERE ${whereFields}`;
            params = whereValues;
        }

        const [rows] = await connection.execute(sql, params);
        return rows;
    }

    private parseConnectionString(connectionString: string): DatabaseConnectionConfig {
        // Parse MySQL connection string format: mysql://user:password@host:port/database
        const url = new URL(connectionString);

        return {
            host: url.hostname,
            port: parseInt(url.port) || 3306,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1), // Remove leading slash
            connectionLimit: 10,
            timeout: 60000
        };
    }
}
