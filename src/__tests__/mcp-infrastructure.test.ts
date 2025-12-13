/**
 * MCP Infrastructure Tests
 * Tests for the basic MCP server infrastructure components
 */

import { MCPServerFactory } from '@/mcp/MCPServerFactory';
import { MCPServerRegistry } from '@/mcp/MCPServerRegistry';
import { MCPManager } from '@/mcp/MCPManager';
import { DatabaseMCPServer } from '@/mcp/servers/DatabaseMCPServer';
import { MCPServerConfig } from '@/types/mcp.types';

describe('MCP Infrastructure', () => {
    describe('MCPServerFactory', () => {
        test('should validate server configuration correctly', () => {
            const validConfig: MCPServerConfig = {
                serverName: 'test-server',
                serverType: 'database',
                connectionString: 'mysql://localhost:3306/test',
                capabilities: ['inventory_operations', 'order_operations'],
                retryPolicy: {
                    maxRetries: 3,
                    backoffStrategy: 'exponential',
                    baseDelay: 1000,
                    maxDelay: 10000,
                },
                timeout: 30000,
            };

            const validation = MCPServerFactory.validateConfig(validConfig);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        test('should reject invalid server configuration', () => {
            const invalidConfig: MCPServerConfig = {
                serverName: '', // Invalid: empty name
                serverType: 'database',
                connectionString: '', // Invalid: empty connection string
                capabilities: [], // Invalid: no capabilities
                retryPolicy: {
                    maxRetries: -1, // Invalid: negative retries
                    backoffStrategy: 'exponential',
                    baseDelay: 0, // Invalid: zero delay
                    maxDelay: 10000,
                },
                timeout: 30000,
            };

            const validation = MCPServerFactory.validateConfig(invalidConfig);
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        test('should create default configuration', () => {
            const config = MCPServerFactory.createDefaultConfig(
                'test-server',
                'database',
                'mysql://localhost:3306/test'
            );

            expect(config.serverName).toBe('test-server');
            expect(config.serverType).toBe('database');
            expect(config.connectionString).toBe('mysql://localhost:3306/test');
            expect(config.capabilities.length).toBeGreaterThan(0);
            expect(config.retryPolicy).toBeDefined();
            expect(config.timeout).toBeGreaterThan(0);
        });

        test('should get supported server types', () => {
            const types = MCPServerFactory.getSupportedServerTypes();
            expect(types).toContain('database');
            expect(types).toContain('file-storage');
            // Cache server type removed - using LangChain built-in caching
            expect(types).toContain('notification');
        });

        test('should get default capabilities for server types', () => {
            const dbCapabilities = MCPServerFactory.getDefaultCapabilities('database');
            expect(dbCapabilities).toContain('inventory_operations');
            expect(dbCapabilities).toContain('order_operations');

            const fileCapabilities = MCPServerFactory.getDefaultCapabilities('file-storage');
            expect(fileCapabilities).toContain('file_upload');
            expect(fileCapabilities).toContain('file_download');

            // Cache capabilities removed - using LangChain built-in caching

            const notificationCapabilities = MCPServerFactory.getDefaultCapabilities('notification');
            expect(notificationCapabilities).toContain('notification_sending');
        });
    });

    describe('MCPServerRegistry', () => {
        let registry: MCPServerRegistry;

        beforeEach(() => {
            registry = new MCPServerRegistry({
                healthCheckInterval: 30000,
                maxConcurrentCalls: 10,
                defaultTimeout: 30000,
            });
        });

        afterEach(async () => {
            await registry.shutdown();
        });

        test('should initialize registry', () => {
            expect(registry).toBeDefined();
            expect(registry.getRegisteredServerNames()).toHaveLength(0);
        });

        test('should get registry statistics', () => {
            const stats = registry.getRegistryStats();
            expect(stats.totalServers).toBe(0);
            expect(stats.statusCounts).toBeDefined();
            expect(stats.typeCounts).toBeDefined();
            expect(stats.healthyServers).toBe(0);
        });

        test('should check if server is registered', () => {
            expect(registry.isServerRegistered('non-existent')).toBe(false);
        });

        test('should get servers by status', () => {
            const connectedServers = registry.getServersByStatus('connected');
            expect(connectedServers).toHaveLength(0);
        });

        test('should get servers by type', () => {
            const databaseServers = registry.getServersByType('database');
            expect(databaseServers).toHaveLength(0);
        });
    });

    describe('MCPManager', () => {
        let manager: MCPManager;

        beforeEach(() => {
            manager = new MCPManager({
                registry: {
                    healthCheckInterval: 30000,
                    maxConcurrentCalls: 10,
                    defaultTimeout: 30000,
                },
                autoStart: false,
                configValidation: true,
            });
        });

        afterEach(async () => {
            if (manager.isManagerStarted()) {
                await manager.stop();
            }
        });

        test('should initialize manager', () => {
            expect(manager).toBeDefined();
            expect(manager.isManagerStarted()).toBe(false);
        });

        test('should start and stop manager', async () => {
            await manager.start();
            expect(manager.isManagerStarted()).toBe(true);

            await manager.stop();
            expect(manager.isManagerStarted()).toBe(false);
        });

        test('should get manager statistics', () => {
            const stats = manager.getStats();
            expect(stats.isStarted).toBe(false);
            expect(stats.registry).toBeDefined();
            expect(stats.capabilities).toBeDefined();
        });

        test('should get registered server names', () => {
            const names = manager.getRegisteredServerNames();
            expect(names).toHaveLength(0);
        });

        test('should check if server is registered', () => {
            expect(manager.isServerRegistered('non-existent')).toBe(false);
        });

        test('should create default server configurations', () => {
            const configs = MCPManager.createDefaultServerConfigs();
            expect(configs).toHaveLength(3); // Reduced from 4 to 3 (removed cache server)

            const serverTypes = configs.map(c => c.serverType);
            expect(serverTypes).toContain('database');
            expect(serverTypes).toContain('file-storage');
            // Cache server type removed - using LangChain built-in caching
            expect(serverTypes).toContain('notification');
        });

        test('should get servers by capability', () => {
            const servers = manager.getServersByCapability('inventory_operations');
            expect(servers).toHaveLength(0);
        });

        test('should get servers by type', () => {
            const servers = manager.getServersByType('database');
            expect(servers).toHaveLength(0);
        });
    });

    describe('DatabaseMCPServer', () => {
        test('should instantiate with valid configuration', () => {
            const config: MCPServerConfig = {
                serverName: 'test-database',
                serverType: 'database',
                connectionString: 'mysql://testuser:testpass@localhost:3306/testdb',
                capabilities: ['inventory_operations', 'order_operations'],
                retryPolicy: {
                    maxRetries: 3,
                    backoffStrategy: 'exponential',
                    baseDelay: 1000,
                    maxDelay: 10000,
                },
                timeout: 30000,
            };

            const server = new DatabaseMCPServer(config);
            expect(server).toBeDefined();
            expect(server.config).toEqual(config);
            expect(server.status).toBe('disconnected');
        });

        test('should provide available tools', async () => {
            const config: MCPServerConfig = {
                serverName: 'test-database',
                serverType: 'database',
                connectionString: 'mysql://testuser:testpass@localhost:3306/testdb',
                capabilities: ['inventory_operations', 'order_operations'],
                retryPolicy: {
                    maxRetries: 3,
                    backoffStrategy: 'exponential',
                    baseDelay: 1000,
                    maxDelay: 10000,
                },
                timeout: 30000,
            };

            const server = new DatabaseMCPServer(config);
            const tools = await server.getAvailableTools();

            expect(tools.length).toBeGreaterThan(0);

            // Check for key inventory tools
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('getInventoryItem');
            expect(toolNames).toContain('updateInventoryQuantity');
            expect(toolNames).toContain('addInventoryItem');
            expect(toolNames).toContain('searchInventoryItems');

            // Check for order tools
            expect(toolNames).toContain('createOrder');
            expect(toolNames).toContain('getOrderHistory');

            // Check for shopping list tools
            expect(toolNames).toContain('getShoppingList');
            expect(toolNames).toContain('addToShoppingList');

            // Check for financial tools
            expect(toolNames).toContain('getSpendingByCategory');
            expect(toolNames).toContain('getMonthlyReport');
            expect(toolNames).toContain('detectAnomalousSpending');

            // Check for generic tools
            expect(toolNames).toContain('executeQuery');
            expect(toolNames).toContain('executeTransaction');
        });

        test('should have proper tool schemas', async () => {
            const config: MCPServerConfig = {
                serverName: 'test-database',
                serverType: 'database',
                connectionString: 'mysql://testuser:testpass@localhost:3306/testdb',
                capabilities: ['inventory_operations', 'order_operations'],
                retryPolicy: {
                    maxRetries: 3,
                    backoffStrategy: 'exponential',
                    baseDelay: 1000,
                    maxDelay: 10000,
                },
                timeout: 30000,
            };

            const server = new DatabaseMCPServer(config);
            const tools = await server.getAvailableTools();

            // Check getInventoryItem tool schema
            const getInventoryTool = tools.find(t => t.name === 'getInventoryItem');
            expect(getInventoryTool).toBeDefined();
            expect(getInventoryTool!.inputSchema.properties.itemName).toBeDefined();
            expect(getInventoryTool!.inputSchema.required).toContain('itemName');

            // Check addInventoryItem tool schema
            const addInventoryTool = tools.find(t => t.name === 'addInventoryItem');
            expect(addInventoryTool).toBeDefined();
            expect(addInventoryTool!.inputSchema.properties.item).toBeDefined();
            expect(addInventoryTool!.inputSchema.required).toContain('item');
        });
    });
});
