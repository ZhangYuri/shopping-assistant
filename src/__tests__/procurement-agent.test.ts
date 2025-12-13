/**
 * Procurement Agent Tests - Updated for tool-based architecture
 */

import { ProcurementAgent } from '@/agents/ProcurementAgent';
import { ProcurementToolsFactory } from '@/agents/tools/ProcurementTools';
import { MCPManager } from '@/mcp/MCPManager';
import { ChatDeepSeek } from '@langchain/deepseek';
import { DynamicTool } from '@langchain/core/tools';

// Mock MCPManager
const mockMCPManager = {
    callTool: jest.fn(),
} as unknown as MCPManager;

// Mock ChatDeepSeek
const mockModel = {
    invoke: jest.fn(),
    bindTools: jest.fn().mockReturnThis(),
    withConfig: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnThis(),
} as unknown as ChatDeepSeek;

describe('ProcurementAgent', () => {
    let agent: ProcurementAgent;
    let toolsFactory: ProcurementToolsFactory;
    let tools: DynamicTool[];

    beforeEach(() => {
        jest.clearAllMocks();

        toolsFactory = new ProcurementToolsFactory(mockMCPManager);
        tools = toolsFactory.createAllTools();

        // Create tools using the static factory method
        const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

        agent = new ProcurementAgent({
            agentId: 'procurement-test',
            name: 'TestProcurementAgent',
            description: 'Test procurement agent',
            databaseTools,
            fileStorageTools,
            notificationTools,
            mcpManager: mockMCPManager,
            model: mockModel,
            systemPrompt: 'Test system prompt',
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully with provided tools', () => {
            expect(agent).toBeInstanceOf(ProcurementAgent);
            expect(agent.getAvailableTools().length).toBeGreaterThan(0);
        });

        it('should initialize with default model when not provided', () => {
            const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

            const agentWithDefaultModel = new ProcurementAgent({
                agentId: 'procurement-default',
                name: 'DefaultProcurementAgent',
                description: 'Default procurement agent',
                databaseTools,
                fileStorageTools,
                notificationTools,
                mcpManager: mockMCPManager,
            });
            expect(agentWithDefaultModel).toBeInstanceOf(ProcurementAgent);
        });

        it('should have correct number of tools', () => {
            expect(agent.getAvailableTools().length).toBe(tools.length);
        });

        it('should provide tool information', () => {
            const toolNames = agent.getAvailableTools();
            expect(toolNames).toContain('import_orders');
            expect(toolNames).toContain('generate_purchase_recommendations');
            expect(toolNames).toContain('manage_shopping_list');
            expect(toolNames).toContain('get_order_history');
            expect(toolNames).toContain('get_shopping_list');
            expect(toolNames).toContain('get_inventory_items');
            expect(toolNames).toContain('analyze_purchase_patterns');
        });

        it('should provide tool descriptions', () => {
            const description = agent.getToolDescription('import_orders');
            expect(description).toBeDefined();
            expect(description).toContain('Import orders from Excel files');
        });
    });

    describe('Tools Factory', () => {
        it('should create all required tools', () => {
            const createdTools = toolsFactory.createAllTools();

            expect(createdTools.length).toBeGreaterThan(0);

            const toolNames = createdTools.map(tool => tool.name);
            expect(toolNames).toContain('import_orders');
            expect(toolNames).toContain('get_order_history');
            expect(toolNames).toContain('manage_shopping_list');
            expect(toolNames).toContain('upload_file');
            expect(toolNames).toContain('parse_excel_file');
            expect(toolNames).toContain('send_notification');
        });

        it('should create tools with proper descriptions', () => {
            const createdTools = toolsFactory.createAllTools();

            createdTools.forEach(tool => {
                expect(tool.name).toBeDefined();
                expect(tool.description).toBeDefined();
                expect(typeof tool.func).toBe('function');
            });
        });
    });

    describe('Order Import Tool', () => {
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

        it('should successfully import orders through tool', async () => {
            const importTool = tools.find(tool => tool.name === 'import_orders');
            expect(importTool).toBeDefined();

            const input = JSON.stringify({ fileId: 'test-file-id', platform: '淘宝' });
            const result = await importTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(true);
            expect(parsedResult.itemsImported).toBe(1);
            expect(parsedResult.duplicatesDetected).toBe(0);
        });

        it('should handle file not found error through tool', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation((serverName: string, toolName: string) => {
                if (serverName === 'file-storage-server' && toolName === 'getFileMetadata') {
                    return Promise.resolve({
                        success: false,
                        error: { message: 'File not found' },
                    });
                }
                return Promise.resolve({ success: false });
            });

            const importTool = tools.find(tool => tool.name === 'import_orders');
            const input = JSON.stringify({ fileId: 'non-existent-file', platform: '淘宝' });
            const result = await importTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(false);
            expect(parsedResult.errors).toContain('File not found: non-existent-file');
        });

        it('should handle invalid input format', async () => {
            const importTool = tools.find(tool => tool.name === 'import_orders');
            const result = await importTool!.func('invalid json');
            const parsedResult = JSON.parse(result);

            expect(parsedResult.error).toContain('Invalid input format');
        });
    });

    describe('Purchase Recommendations Tool', () => {
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

        it('should generate purchase recommendations through tool', async () => {
            const recommendationTool = tools.find(tool => tool.name === 'generate_purchase_recommendations');
            expect(recommendationTool).toBeDefined();

            const input = JSON.stringify({ analysisDepthDays: 90 });
            const result = await recommendationTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(Array.isArray(parsedResult)).toBe(true);
            expect(parsedResult).toHaveLength(2);

            const urgentItem = parsedResult.find((r: any) => r.priority === 'urgent');
            expect(urgentItem).toBeDefined();
            expect(urgentItem?.itemName).toBe('洗发水');

            const highPriorityItem = parsedResult.find((r: any) => r.priority === 'high');
            expect(highPriorityItem).toBeDefined();
            expect(highPriorityItem?.itemName).toBe('抽纸');
        });

        it('should handle empty input for recommendations', async () => {
            const recommendationTool = tools.find(tool => tool.name === 'generate_purchase_recommendations');
            const result = await recommendationTool!.func('');
            const parsedResult = JSON.parse(result);

            expect(Array.isArray(parsedResult)).toBe(true);
        });
    });

    describe('Shopping List Management Tool', () => {
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
                if (serverName === 'database-server' && toolName === 'getShoppingList') {
                    return Promise.resolve({
                        success: true,
                        data: [
                            { id: 1, item_name: '牛奶', status: 'pending' },
                            { id: 2, item_name: '面包', status: 'completed' }
                        ]
                    });
                }
                return Promise.resolve({ success: false });
            });
        });

        it('should add item to shopping list through tool', async () => {
            const manageTool = tools.find(tool => tool.name === 'manage_shopping_list');
            expect(manageTool).toBeDefined();

            const input = JSON.stringify({
                action: 'add',
                itemData: { item_name: '牛奶', suggested_quantity: 2, priority: 3 }
            });
            const result = await manageTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(true);
            expect(parsedResult.message).toContain('成功添加到购物清单');
        });

        it('should get shopping list through tool', async () => {
            const getTool = tools.find(tool => tool.name === 'get_shopping_list');
            expect(getTool).toBeDefined();

            const input = JSON.stringify({ status: 'all' });
            const result = await getTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(true);
            expect(parsedResult.items).toHaveLength(2);
            expect(parsedResult.count).toBe(2);
        });

        it('should filter shopping list by status', async () => {
            const getTool = tools.find(tool => tool.name === 'get_shopping_list');
            const input = JSON.stringify({ status: 'pending' });
            const result = await getTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(true);
            expect(parsedResult.items).toHaveLength(1);
            expect(parsedResult.items[0].status).toBe('pending');
        });
    });

    describe('File Storage Tools', () => {
        it('should have file upload tool', () => {
            const uploadTool = tools.find(tool => tool.name === 'upload_file');
            expect(uploadTool).toBeDefined();
            expect(uploadTool?.description).toContain('Upload a file for processing');
        });

        it('should have excel parsing tool', () => {
            const parseTool = tools.find(tool => tool.name === 'parse_excel_file');
            expect(parseTool).toBeDefined();
            expect(parseTool?.description).toContain('Parse Excel file content');
        });

        it('should have image processing tool', () => {
            const imageTool = tools.find(tool => tool.name === 'process_image');
            expect(imageTool).toBeDefined();
            expect(imageTool?.description).toContain('Process image with OCR');
        });
    });

    describe('Notification Tools', () => {
        it('should have notification sending tool', () => {
            const notifyTool = tools.find(tool => tool.name === 'send_notification');
            expect(notifyTool).toBeDefined();
            expect(notifyTool?.description).toContain('Send notification to user');
        });

        it('should send notification through tool', async () => {
            (mockMCPManager.callTool as jest.Mock).mockImplementation(() => {
                return Promise.resolve({ success: true, data: 'notification-sent' });
            });

            const notifyTool = tools.find(tool => tool.name === 'send_notification');
            const input = JSON.stringify({
                content: { message: 'Test notification' },
                options: { priority: 'high' }
            });
            const result = await notifyTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(true);
        });
    });

    describe('Agent Invocation', () => {
        it('should handle invoke method', async () => {
            // Mock the LangChain agent's invoke method
            const mockAgentInvoke = jest.fn().mockResolvedValue({
                messages: [{ content: 'Test response' }],
            });

            // Mock the createReactAgent to return our mock
            jest.doMock('@langchain/langgraph/prebuilt', () => ({
                createReactAgent: jest.fn().mockReturnValue({
                    invoke: mockAgentInvoke,
                    stream: jest.fn(),
                }),
            }));

            // Create a new agent instance for this test
            const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

            const testAgent = new ProcurementAgent({
                agentId: 'test-invoke',
                name: 'TestInvokeAgent',
                description: 'Test agent for invoke',
                databaseTools,
                fileStorageTools,
                notificationTools,
                mcpManager: mockMCPManager,
                model: mockModel,
            });

            // Manually set the mocked agent
            (testAgent as any).agent = { invoke: mockAgentInvoke };
            (testAgent as any).isInitialized = true;

            const result = await testAgent.invoke('Test input');

            expect(mockAgentInvoke).toHaveBeenCalledWith(
                { messages: expect.any(Array) },
                { configurable: { thread_id: expect.any(String) } }
            );
            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should handle stream method', async () => {
            // Mock the agent's stream method
            const mockAgentStream = jest.fn().mockResolvedValue('stream-result');

            // Create a new agent instance for this test
            const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

            const testAgent = new ProcurementAgent({
                agentId: 'test-stream',
                name: 'TestStreamAgent',
                description: 'Test agent for stream',
                databaseTools,
                fileStorageTools,
                notificationTools,
                mcpManager: mockMCPManager,
                model: mockModel,
            });

            // Manually set the mocked agent
            (testAgent as any).agent = { stream: mockAgentStream };
            (testAgent as any).isInitialized = true;

            const result = await testAgent.stream('Test input');

            expect(mockAgentStream).toHaveBeenCalledWith(
                { messages: expect.any(Array) },
                { configurable: { thread_id: expect.any(String) } }
            );
            expect(result).toBe('stream-result');
        });

        it('should handle custom thread configuration', async () => {
            const mockAgentInvoke = jest.fn().mockResolvedValue({
                messages: [{ content: 'Test response' }],
            });

            // Create a new agent instance for this test
            const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

            const testAgent = new ProcurementAgent({
                agentId: 'test-custom-thread',
                name: 'TestCustomThreadAgent',
                description: 'Test agent for custom thread',
                databaseTools,
                fileStorageTools,
                notificationTools,
                mcpManager: mockMCPManager,
                model: mockModel,
            });

            // Manually set the mocked agent
            (testAgent as any).agent = { invoke: mockAgentInvoke };
            (testAgent as any).isInitialized = true;

            const result = await testAgent.invoke('Test input', { configurable: { thread_id: 'custom-thread' } });

            expect(mockAgentInvoke).toHaveBeenCalledWith(
                { messages: expect.any(Array) },
                { configurable: { thread_id: 'custom-thread' } }
            );
            expect(result.success).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle tool execution errors gracefully', async () => {
            const errorTool = tools.find(tool => tool.name === 'import_orders');

            // Mock MCP call to throw error
            (mockMCPManager.callTool as jest.Mock).mockRejectedValue(new Error('MCP connection failed'));

            const input = JSON.stringify({ fileId: 'test-file', platform: '淘宝' });
            const result = await errorTool!.func(input);
            const parsedResult = JSON.parse(result);

            expect(parsedResult.success).toBe(false);
            expect(parsedResult.message).toContain('导入订单时出错');
        });

        it('should handle agent invocation errors', async () => {
            // Create a new agent instance for this test
            const { databaseTools, fileStorageTools, notificationTools } = ProcurementAgent.createProcurementTools(mockMCPManager);

            const testAgent = new ProcurementAgent({
                agentId: 'test-error',
                name: 'TestErrorAgent',
                description: 'Test agent for error handling',
                databaseTools,
                fileStorageTools,
                notificationTools,
                mcpManager: mockMCPManager,
                model: mockModel,
            });

            // Mock the agent to throw error
            (testAgent as any).agent = {
                invoke: jest.fn().mockRejectedValue(new Error('Agent error'))
            };
            (testAgent as any).isInitialized = true;

            const result = await testAgent.invoke('Test input');

            // The BaseAgent now catches errors and returns them in the result
            expect(result.success).toBe(false);
            expect(result.error).toContain('Agent error');
        });
    });
});
