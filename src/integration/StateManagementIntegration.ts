/**
 * Integration helper for connecting state management with MCP servers and agents
 * Demonstrates how to integrate LangChain state management with the existing system
 */

import { AgentStateManager } from '../state/AgentStateManager';
import { LangGraphWorkflowEngine } from '../workflows/LangGraphWorkflowEngine';
import { StateManagementFactory, getStateManagementConfig } from '../config/StateManagementConfig';
import { IAgent, AgentMessage } from '../types/agent.types';
import { IMCPServer } from '../types/mcp.types';
import { WorkflowDefinition } from '../types/workflow.types';
import { Logger } from '../utils/Logger';

export interface StateManagementIntegrationConfig {
    environment: 'development' | 'production' | 'testing';
    enableMCPIntegration: boolean;
    enableAgentIntegration: boolean;
    enableWorkflowIntegration: boolean;
}

/**
 * Integration class that connects state management with existing system components
 */
export class StateManagementIntegration {
    private stateManager: AgentStateManager;
    private workflowEngine: LangGraphWorkflowEngine;
    private logger: Logger;
    private mcpServers: Map<string, IMCPServer> = new Map();
    private agents: Map<string, IAgent> = new Map();

    constructor(config: StateManagementIntegrationConfig) {
        this.logger = new Logger({
            component: 'StateManagementIntegration',
            level: 'info',
        });

        // Create state management system
        const factory = StateManagementFactory.getInstance();
        const systemConfig = getStateManagementConfig(config.environment);

        const { stateManager, workflowEngine } = factory.createStateManagementSystem(systemConfig);
        this.stateManager = stateManager;
        this.workflowEngine = workflowEngine;

        this.logger.info('State management integration initialized', {
            environment: config.environment,
            mcpIntegration: config.enableMCPIntegration,
            agentIntegration: config.enableAgentIntegration,
            workflowIntegration: config.enableWorkflowIntegration,
        });
    }

    /**
     * Register an MCP server with state management integration
     */
    registerMCPServer(server: IMCPServer): void {
        this.mcpServers.set(server.config.serverName, server);

        // Add event listeners for state management
        server.on('toolCallCompleted', async (toolCall) => {
            await this.handleMCPToolCallCompleted(server, toolCall);
        });

        server.on('toolCallFailed', async (toolCall) => {
            await this.handleMCPToolCallFailed(server, toolCall);
        });

        server.on('statusChanged', async (event) => {
            await this.handleMCPStatusChanged(server, event);
        });

        this.logger.info('MCP server registered with state management', {
            serverName: server.config.serverName,
            serverType: server.config.serverType,
        });
    }

    /**
     * Register an agent with state management integration
     */
    registerAgent(agent: IAgent): void {
        this.agents.set(agent.config.agentId, agent);
        this.workflowEngine.registerAgent(agent);

        // Add event listeners for state management (if agent supports events)
        if ('on' in agent && typeof (agent as any).on === 'function') {
            (agent as any).on('stateUpdated', async (state: any) => {
                await this.handleAgentStateUpdated(agent, state);
            });

            (agent as any).on('taskCompleted', async (event: any) => {
                await this.handleAgentTaskCompleted(agent, event);
            });

            (agent as any).on('taskFailed', async (event: any) => {
                await this.handleAgentTaskFailed(agent, event);
            });
        }

        this.logger.info('Agent registered with state management', {
            agentId: agent.config.agentId,
            agentType: agent.config.agentType,
        });
    }

    /**
     * Create a conversation-aware agent wrapper
     */
    createConversationAwareAgent(agent: IAgent): ConversationAwareAgent {
        return new ConversationAwareAgent(agent, this.stateManager);
    }

    /**
     * Create a cached MCP server wrapper
     */
    createCachedMCPServer(server: IMCPServer): CachedMCPServer {
        return new CachedMCPServer(server, this.stateManager);
    }

    /**
     * Create a sample workflow that demonstrates state management
     */
    async createSampleWorkflow(): Promise<string> {
        const workflowDefinition: WorkflowDefinition = {
            id: 'sample-workflow',
            workflowId: 'sample-state-management-workflow',
            name: 'Sample State Management Workflow',
            description: 'Demonstrates state management integration',
            version: '1.0.0',
            steps: [
                {
                    stepId: 'initialize',
                    stepType: 'agent_task',
                    name: 'Initialize Context',
                    description: 'Initialize workflow context',
                    agentId: 'inventory',
                    taskType: 'initialize_context',
                    nextSteps: ['process'],
                    errorHandling: {
                        strategy: 'retry',
                        maxRetries: 3,
                    },
                },
                {
                    stepId: 'process',
                    stepType: 'agent_task',
                    name: 'Process Request',
                    description: 'Process the main request',
                    agentId: 'inventory',
                    taskType: 'process_request',
                    nextSteps: ['finalize'],
                    errorHandling: {
                        strategy: 'retry',
                        maxRetries: 2,
                    },
                },
                {
                    stepId: 'finalize',
                    stepType: 'agent_task',
                    name: 'Finalize Result',
                    description: 'Finalize and return result',
                    agentId: 'notification',
                    taskType: 'send_notification',
                    nextSteps: [],
                    errorHandling: {
                        strategy: 'continue',
                    },
                },
            ],
            triggers: [
                {
                    triggerId: 'manual',
                    triggerType: 'manual',
                    condition: 'always',
                    parameters: {},
                },
            ],
            metadata: {
                category: 'sample',
                tags: ['state-management', 'demo'],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        return await this.workflowEngine.createWorkflow(workflowDefinition);
    }

    /**
     * Get state management components
     */
    getStateManager(): AgentStateManager {
        return this.stateManager;
    }

    getWorkflowEngine(): LangGraphWorkflowEngine {
        return this.workflowEngine;
    }

    /**
     * Event handlers for MCP servers
     */
    private async handleMCPToolCallCompleted(server: IMCPServer, toolCall: any): Promise<void> {
        try {
            // Cache successful tool call results
            const cacheKey = `mcp:${server.config.serverName}:${toolCall.toolName}:${JSON.stringify(toolCall.parameters)}`;
            await this.stateManager.cacheAnalysisResult(cacheKey, toolCall.result, 300000); // 5 minutes

            this.logger.debug('MCP tool call result cached', {
                serverName: server.config.serverName,
                toolName: toolCall.toolName,
                cacheKey,
            });
        } catch (error) {
            this.logger.error('Failed to cache MCP tool call result', {
                serverName: server.config.serverName,
                toolName: toolCall.toolName,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async handleMCPToolCallFailed(server: IMCPServer, toolCall: any): Promise<void> {
        this.logger.warn('MCP tool call failed', {
            serverName: server.config.serverName,
            toolName: toolCall.toolName,
            error: toolCall.error,
        });
    }

    private async handleMCPStatusChanged(server: IMCPServer, event: any): Promise<void> {
        // Update server status in cache
        const statusKey = `mcp:status:${server.config.serverName}`;
        await this.stateManager.cacheAnalysisResult(statusKey, {
            status: event.status,
            timestamp: new Date(),
            errorMessage: event.errorMessage,
        });

        this.logger.debug('MCP server status cached', {
            serverName: server.config.serverName,
            status: event.status,
        });
    }

    /**
     * Event handlers for agents
     */
    private async handleAgentStateUpdated(agent: IAgent, state: any): Promise<void> {
        try {
            // Save agent context to state manager
            await this.stateManager.saveAgentContext(agent.config.agentId, state.context);

            this.logger.debug('Agent context saved', {
                agentId: agent.config.agentId,
                status: state.status,
            });
        } catch (error) {
            this.logger.error('Failed to save agent context', {
                agentId: agent.config.agentId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async handleAgentTaskCompleted(agent: IAgent, event: any): Promise<void> {
        // Cache task results for potential reuse
        const cacheKey = `agent:${agent.config.agentId}:task:${event.task.taskType}:${JSON.stringify(event.task.input)}`;
        await this.stateManager.cacheAnalysisResult(cacheKey, event.result, 600000); // 10 minutes

        this.logger.debug('Agent task result cached', {
            agentId: agent.config.agentId,
            taskType: event.task.taskType,
            duration: event.duration,
        });
    }

    private async handleAgentTaskFailed(agent: IAgent, event: any): Promise<void> {
        this.logger.warn('Agent task failed', {
            agentId: agent.config.agentId,
            taskType: event.task.taskType,
            error: event.error,
        });
    }

    /**
     * Shutdown integration
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down state management integration');

        await this.workflowEngine.shutdown();
        await this.stateManager.shutdown();

        this.mcpServers.clear();
        this.agents.clear();

        this.logger.info('State management integration shutdown completed');
    }
}

/**
 * Conversation-aware agent wrapper
 */
class ConversationAwareAgent {
    constructor(
        private agent: IAgent,
        private stateManager: AgentStateManager
    ) { }

    async handleMessageWithContext(
        message: AgentMessage,
        conversationId: string
    ): Promise<AgentMessage | null> {
        // Load conversation context
        const conversationState = await this.stateManager.loadConversationState(conversationId);

        // Add context to message
        const contextualMessage = {
            ...message,
            payload: {
                ...message.payload,
                conversationContext: conversationState,
            },
        };

        // Process message
        const response = await this.agent.handleMessage(contextualMessage);

        // Update conversation state if response exists
        if (response && conversationState) {
            conversationState.history.push({
                turnId: message.messageId,
                userInput: message.payload.content || '',
                agentResponse: response.payload.content || '',
                intent: message.payload.intent || 'unknown',
                entities: message.payload.entities || {},
                timestamp: new Date(),
                agentId: this.agent.config.agentId,
            });

            conversationState.lastActivity = new Date();
            await this.stateManager.saveConversationState(conversationId, conversationState);
        }

        return response;
    }
}

/**
 * Cached MCP server wrapper
 */
class CachedMCPServer {
    constructor(
        private server: IMCPServer,
        private stateManager: AgentStateManager
    ) { }

    async callToolWithCache<T>(
        toolName: string,
        parameters: any,
        cacheTTL?: number
    ): Promise<T> {
        // Check cache first
        const cacheKey = `mcp:${this.server.config.serverName}:${toolName}:${JSON.stringify(parameters)}`;
        const cachedResult = await this.stateManager.getCachedResult<T>(cacheKey);

        if (cachedResult) {
            return cachedResult;
        }

        // Call tool and cache result
        const result = await this.server.callTool<T>(toolName, parameters);

        if (result.success && result.data) {
            await this.stateManager.cacheAnalysisResult(cacheKey, result.data, cacheTTL);
        }

        return result.data as T;
    }
}
