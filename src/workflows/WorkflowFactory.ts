/**
 * Factory for creating and configuring LangGraph workflows with agents
 */

import { LangGraphStateWorkflow, LangGraphWorkflowConfig } from './LangGraphStateWorkflow';
import { IntelligentAgentRouter, IntelligentRouterConfig } from './IntelligentAgentRouter';
import { AgentStateManager } from '../state/AgentStateManager';
import { InventoryAgent } from '../agents/InventoryAgent';
import { ProcurementAgent } from '../agents/ProcurementAgent';
import { FinanceAgent } from '../agents/FinanceAgent';
import { NotificationAgent } from '../agents/NotificationAgent';
import { Logger } from '../utils/Logger';
import { ChatDeepSeek } from '@langchain/deepseek';

export interface WorkflowFactoryConfig {
    workflowConfig?: Partial<LangGraphWorkflowConfig>;
    routerConfig?: Partial<IntelligentRouterConfig>;
    enableDatabaseTools?: boolean;
    enableFileStorageTools?: boolean;
    enableNotificationTools?: boolean;
}

/**
 * Factory class for creating fully configured LangGraph workflows
 */
export class WorkflowFactory {
    private logger: Logger;

    constructor() {
        this.logger = new Logger({
            component: 'WorkflowFactory',
            level: 'info',
        });
    }

    /**
     * Create a complete LangGraph workflow with all agents and routing
     */
    async createCompleteWorkflow(
        stateManager: AgentStateManager,
        config: WorkflowFactoryConfig = {}
    ): Promise<{
        workflow: LangGraphStateWorkflow;
        router: IntelligentAgentRouter;
        agents: {
            inventory: InventoryAgent;
            procurement: ProcurementAgent;
            finance: FinanceAgent;
            notification: NotificationAgent;
        };
    }> {
        try {
            this.logger.info('Creating complete LangGraph workflow', {
                enableDatabaseTools: config.enableDatabaseTools !== false,
                enableFileStorageTools: config.enableFileStorageTools !== false,
                enableNotificationTools: config.enableNotificationTools !== false,
            });

            // Create LLM instance for router
            const llm = new ChatDeepSeek({
                apiKey: process.env.DEEPSEEK_API_KEY,
                model: 'deepseek-chat',
                temperature: 0.1,
            });

            // Create intelligent router
            const router = new IntelligentAgentRouter(stateManager, {
                llmModel: llm,
                enableContextLearning: true,
                confidenceThreshold: 0.7,
                maxContextHistory: 10,
                fallbackAgent: 'inventory',
                enableEntityExtraction: true,
                ...config.routerConfig,
            });

            // Create workflow
            const workflow = new LangGraphStateWorkflow(router, {
                enableMemory: true,
                maxSteps: 10,
                timeout: 300000,
                retryPolicy: {
                    maxRetries: 3,
                    backoffMs: 1000,
                },
                ...config.workflowConfig,
            });

            // Create agents with tools
            const agents = await this.createAgents(config);

            // Register agents with router and workflow
            router.registerAgent(agents.inventory);
            router.registerAgent(agents.procurement);
            router.registerAgent(agents.finance);
            router.registerAgent(agents.notification);

            workflow.registerAgent('inventory', agents.inventory);
            workflow.registerAgent('procurement', agents.procurement);
            workflow.registerAgent('finance', agents.finance);
            workflow.registerAgent('notification', agents.notification);

            // Compile the workflow
            await workflow.compile();

            this.logger.info('Complete LangGraph workflow created successfully', {
                agentsCreated: Object.keys(agents).length,
                workflowCompiled: true,
            });

            return {
                workflow,
                router,
                agents,
            };
        } catch (error) {
            this.logger.error('Failed to create complete workflow', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Create agents with appropriate tools
     */
    private async createAgents(config: WorkflowFactoryConfig): Promise<{
        inventory: InventoryAgent;
        procurement: ProcurementAgent;
        finance: FinanceAgent;
        notification: NotificationAgent;
    }> {
        // Create tool sets
        const inventoryTools = InventoryAgent.createInventoryTools();
        const procurementTools = ProcurementAgent.createProcurementTools();
        const financeTools = FinanceAgent.createFinanceTools();
        const notificationTools = NotificationAgent.createNotificationTools();

        // Create inventory agent
        const inventoryAgent = new InventoryAgent({
            agentId: 'inventory-agent-001',
            name: 'Inventory Management Agent',
            description: '专业的库存管理智能体，处理库存相关的所有操作',
            databaseTools: config.enableDatabaseTools !== false ? inventoryTools.databaseTools : [],
            fileStorageTools: config.enableFileStorageTools !== false ? inventoryTools.fileStorageTools : [],
            notificationTools: config.enableNotificationTools !== false ? inventoryTools.notificationTools : [],
            defaultThresholds: {
                '日用品': 2,
                '食品': 3,
                '清洁用品': 1,
                '个人护理': 2,
            },
        });

        // Create procurement agent
        const procurementAgent = new ProcurementAgent({
            agentId: 'procurement-agent-001',
            name: 'Procurement Management Agent',
            description: '专业的采购管理智能体，处理采购和订单相关的所有操作',
            databaseTools: config.enableDatabaseTools !== false ? procurementTools.databaseTools : [],
            fileStorageTools: config.enableFileStorageTools !== false ? procurementTools.fileStorageTools : [],
            notificationTools: config.enableNotificationTools !== false ? procurementTools.notificationTools : [],
            defaultPlatforms: ['淘宝', '1688', '京东', '抖音商城', '中免日上', '拼多多'],
        });

        // Create finance agent
        const financeAgent = new FinanceAgent({
            agentId: 'finance-agent-001',
            name: 'Finance Management Agent',
            description: '专业的财务管理智能体，处理财务分析和报告相关的所有操作',
            databaseTools: config.enableDatabaseTools !== false ? financeTools.databaseTools : [],
            notificationTools: config.enableNotificationTools !== false ? financeTools.notificationTools : [],
            budgetLimits: {
                '食品': 2000,
                '日用品': 1000,
                '清洁用品': 500,
                '个人护理': 800,
                '其他': 1500
            },
            anomalyThresholds: {
                dailySpendingMultiplier: 3.0,
                categorySpendingMultiplier: 2.5,
                unusualItemThreshold: 500
            }
        });

        // Create notification agent
        const notificationAgent = new NotificationAgent({
            agentId: 'notification-agent-001',
            name: 'Notification Management Agent',
            description: '专业的通知管理智能体，处理智能通知和用户沟通相关的所有操作',
            notificationTools: config.enableNotificationTools !== false ? notificationTools.notificationTools : [],
            databaseTools: config.enableDatabaseTools !== false ? notificationTools.databaseTools : [],
            defaultChannels: ['teams'],
            intelligentTiming: true,
        });

        // Initialize agents
        await inventoryAgent.initialize();
        await procurementAgent.initialize();
        await financeAgent.initialize();
        await notificationAgent.initialize();

        this.logger.info('Agents created and initialized', {
            inventoryAgent: inventoryAgent.getConfig().agentId,
            procurementAgent: procurementAgent.getConfig().agentId,
            financeAgent: financeAgent.getConfig().agentId,
            notificationAgent: notificationAgent.getConfig().agentId,
        });

        return {
            inventory: inventoryAgent,
            procurement: procurementAgent,
            finance: financeAgent,
            notification: notificationAgent,
        };
    }

    /**
     * Create a minimal workflow for testing
     */
    async createTestWorkflow(
        stateManager: AgentStateManager
    ): Promise<{
        workflow: LangGraphStateWorkflow;
        router: IntelligentAgentRouter;
    }> {
        try {
            this.logger.info('Creating test workflow');

            // Create router with minimal config and LLM routing disabled
            const router = new IntelligentAgentRouter(stateManager, {
                enableContextLearning: false,
                confidenceThreshold: 0.5,
                maxContextHistory: 5,
                fallbackAgent: 'inventory',
                enableLLMRouting: false, // Disable LLM routing for testing
            });

            // Create workflow with minimal config
            const workflow = new LangGraphStateWorkflow(router, {
                enableMemory: false,
                maxSteps: 5,
                timeout: 60000,
                retryPolicy: {
                    maxRetries: 1,
                    backoffMs: 500,
                },
            });

            // Create minimal agents for testing all agent types
            const inventoryTools = InventoryAgent.createInventoryTools();
            const procurementTools = ProcurementAgent.createProcurementTools();
            const financeTools = FinanceAgent.createFinanceTools();
            const notificationTools = NotificationAgent.createNotificationTools();

            const testInventoryAgent = new InventoryAgent({
                agentId: 'test-inventory-agent',
                name: 'Test Inventory Agent',
                description: 'Test inventory agent',
                databaseTools: inventoryTools.databaseTools,
                fileStorageTools: [],
                notificationTools: [],
            });

            const testProcurementAgent = new ProcurementAgent({
                agentId: 'test-procurement-agent',
                name: 'Test Procurement Agent',
                description: 'Test procurement agent',
                databaseTools: procurementTools.databaseTools,
                fileStorageTools: [],
                notificationTools: [],
                defaultPlatforms: ['淘宝', '京东'],
            });

            const testFinanceAgent = new FinanceAgent({
                agentId: 'test-finance-agent',
                name: 'Test Finance Agent',
                description: 'Test finance agent',
                databaseTools: financeTools.databaseTools,
                notificationTools: [],
                budgetLimits: { '食品': 1000, '日用品': 500 },
            });

            const testNotificationAgent = new NotificationAgent({
                agentId: 'test-notification-agent',
                name: 'Test Notification Agent',
                description: 'Test notification agent',
                notificationTools: notificationTools.notificationTools,
                databaseTools: [],
                defaultChannels: ['teams'],
            });

            await testInventoryAgent.initialize();
            await testProcurementAgent.initialize();
            await testFinanceAgent.initialize();
            await testNotificationAgent.initialize();

            router.registerAgent(testInventoryAgent);
            router.registerAgent(testProcurementAgent);
            router.registerAgent(testFinanceAgent);
            router.registerAgent(testNotificationAgent);

            workflow.registerAgent('inventory', testInventoryAgent);
            workflow.registerAgent('procurement', testProcurementAgent);
            workflow.registerAgent('finance', testFinanceAgent);
            workflow.registerAgent('notification', testNotificationAgent);

            await workflow.compile();

            this.logger.info('Test workflow created successfully');

            return { workflow, router };
        } catch (error) {
            this.logger.error('Failed to create test workflow', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Create workflow configuration for different environments
     */
    static createProductionConfig(): WorkflowFactoryConfig {
        return {
            workflowConfig: {
                enableMemory: true,
                maxSteps: 15,
                timeout: 600000, // 10 minutes
                retryPolicy: {
                    maxRetries: 5,
                    backoffMs: 2000,
                },
            },
            routerConfig: {
                enableContextLearning: true,
                confidenceThreshold: 0.8,
                maxContextHistory: 20,
                fallbackAgent: 'inventory',
                enableEntityExtraction: true,
            },
            enableDatabaseTools: true,
            enableFileStorageTools: true,
            enableNotificationTools: true,
        };
    }

    static createDevelopmentConfig(): WorkflowFactoryConfig {
        return {
            workflowConfig: {
                enableMemory: true,
                maxSteps: 10,
                timeout: 300000, // 5 minutes
                retryPolicy: {
                    maxRetries: 3,
                    backoffMs: 1000,
                },
            },
            routerConfig: {
                enableContextLearning: true,
                confidenceThreshold: 0.6,
                maxContextHistory: 10,
                fallbackAgent: 'inventory',
                enableEntityExtraction: true,
            },
            enableDatabaseTools: true,
            enableFileStorageTools: true,
            enableNotificationTools: false, // Disable notifications in dev
        };
    }

    static createTestConfig(): WorkflowFactoryConfig {
        return {
            workflowConfig: {
                enableMemory: false,
                maxSteps: 5,
                timeout: 60000, // 1 minute
                retryPolicy: {
                    maxRetries: 1,
                    backoffMs: 500,
                },
            },
            routerConfig: {
                enableContextLearning: false,
                confidenceThreshold: 0.5,
                maxContextHistory: 3,
                fallbackAgent: 'inventory',
                enableEntityExtraction: false,
            },
            enableDatabaseTools: false, // Use mock tools
            enableFileStorageTools: false,
            enableNotificationTools: false,
        };
    }
}
