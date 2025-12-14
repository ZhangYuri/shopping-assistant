/**
 * LangGraph StateGraph Workflow Implementation
 * Uses LangGraph's native StateGraph for agent orchestration with MemorySaver
 */

import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { Logger } from '../utils/Logger';
import { BaseAgent } from '../agents/base/BaseAgent';
import { IntelligentAgentRouter, IntelligentRoutingResult, RoutingContext, AgentType } from './IntelligentAgentRouter';
import { v4 as uuidv4 } from 'uuid';

// LangGraph workflow state interface
export interface WorkflowState {
    messages: BaseMessage[];
    userInput: string;
    currentAgent: string;
    agentResults: Record<string, any>;
    finalResponse: string;
    routingResult?: IntelligentRoutingResult;
    conversationId: string;
    userId: string;
    metadata: {
        startTime: Date;
        stepCount: number;
        errors: string[];
    };
}

// Configuration for the LangGraph workflow
export interface LangGraphWorkflowConfig {
    enableMemory: boolean;
    maxSteps: number;
    timeout: number;
    retryPolicy: {
        maxRetries: number;
        backoffMs: number;
    };
}

/**
 * LangGraph StateGraph Workflow for agent orchestration
 * Uses LangGraph's built-in state management and error handling
 */
export class LangGraphStateWorkflow {
    private logger: Logger;
    private stateGraph: any; // Use any to avoid complex type issues
    private memorySaver: MemorySaver;
    private agentRouter: IntelligentAgentRouter;
    private agents: Map<string, BaseAgent> = new Map();
    private config: LangGraphWorkflowConfig;
    private compiledGraph: any;

    constructor(
        agentRouter: IntelligentAgentRouter,
        config: Partial<LangGraphWorkflowConfig> = {}
    ) {
        this.agentRouter = agentRouter;
        this.config = {
            enableMemory: true,
            maxSteps: 10,
            timeout: 300000, // 5 minutes
            retryPolicy: {
                maxRetries: 3,
                backoffMs: 1000,
            },
            ...config,
        };

        this.logger = new Logger({
            component: 'LangGraphStateWorkflow',
            level: 'info',
        });

        // Initialize MemorySaver for state persistence
        this.memorySaver = new MemorySaver();

        // Initialize the StateGraph
        this.initializeStateGraph();

        this.logger.info('LangGraph StateGraph Workflow initialized', {
            enableMemory: this.config.enableMemory,
            maxSteps: this.config.maxSteps,
        });
    }

    /**
     * Initialize the LangGraph StateGraph with nodes and edges
     */
    private initializeStateGraph(): void {
        // Create a simplified state graph
        // Note: Using any type to avoid complex LangGraph type issues
        this.stateGraph = new StateGraph({
            channels: {
                messages: {
                    reducer: (existing: BaseMessage[], update: BaseMessage[]) => {
                        return [...(existing || []), ...update];
                    },
                    default: () => [],
                },
                userInput: {
                    default: () => '',
                },
                currentAgent: {
                    default: () => '',
                },
                agentResults: {
                    reducer: (existing: Record<string, any>, update: Record<string, any>) => {
                        return { ...(existing || {}), ...update };
                    },
                    default: () => ({}),
                },
                finalResponse: {
                    default: () => '',
                },
                routingResult: {
                    default: () => undefined,
                },
                conversationId: {
                    default: () => '',
                },
                userId: {
                    default: () => '',
                },
                metadata: {
                    reducer: (existing: any, update: any) => {
                        return { ...(existing || {}), ...update };
                    },
                    default: () => ({
                        startTime: new Date(),
                        stepCount: 0,
                        errors: [],
                    }),
                },
            },
        } as any);

        // Add workflow nodes
        this.stateGraph.addNode('router', this.routerNode.bind(this));
        this.stateGraph.addNode('inventory_agent', this.inventoryAgentNode.bind(this));
        this.stateGraph.addNode('procurement_agent', this.procurementAgentNode.bind(this));
        this.stateGraph.addNode('finance_agent', this.financeAgentNode.bind(this));
        this.stateGraph.addNode('notification_agent', this.notificationAgentNode.bind(this));
        this.stateGraph.addNode('response_formatter', this.responseFormatterNode.bind(this));

        // Set entry point
        this.stateGraph.addEdge(START, 'router');

        // Add conditional routing from router to agents
        this.stateGraph.addConditionalEdges(
            'router',
            this.routingCondition.bind(this),
            {
                inventory: 'inventory_agent',
                procurement: 'procurement_agent',
                finance: 'finance_agent',
                notification: 'notification_agent',
                error: 'response_formatter',
            }
        );

        // All agents route to response formatter
        this.stateGraph.addEdge('inventory_agent', 'response_formatter');
        this.stateGraph.addEdge('procurement_agent', 'response_formatter');
        this.stateGraph.addEdge('finance_agent', 'response_formatter');
        this.stateGraph.addEdge('notification_agent', 'response_formatter');

        // Response formatter routes to end
        this.stateGraph.addEdge('response_formatter', END);

        this.logger.debug('StateGraph nodes and edges configured');
    }

    /**
     * Register an agent with the workflow
     */
    registerAgent(agentType: string, agent: BaseAgent): void {
        this.agents.set(agentType, agent);
        this.agentRouter.registerAgent(agent);
        this.logger.debug('Agent registered with workflow', {
            agentType,
            agentId: agent.getConfig().agentId,
        });
    }

    /**
     * Compile the StateGraph for execution
     */
    async compile(): Promise<void> {
        try {
            this.compiledGraph = this.stateGraph.compile({
                checkpointer: this.config.enableMemory ? this.memorySaver : undefined,
            });

            this.logger.info('LangGraph StateGraph compiled successfully', {
                enableMemory: this.config.enableMemory,
            });
        } catch (error) {
            this.logger.error('Failed to compile StateGraph', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Execute the workflow with user input
     */
    async execute(
        userInput: string,
        conversationId?: string,
        userId: string = 'default-user'
    ): Promise<{
        success: boolean;
        response: string;
        conversationId: string;
        metadata: any;
        error?: string;
    }> {
        if (!this.compiledGraph) {
            await this.compile();
        }

        const threadId = conversationId || `thread-${uuidv4()}`;
        const startTime = Date.now();

        try {
            this.logger.info('Starting workflow execution', {
                userInput: userInput.substring(0, 100),
                conversationId: threadId,
                userId,
            });

            // Initialize workflow state
            const initialState: WorkflowState = {
                messages: [new HumanMessage(userInput)],
                userInput,
                currentAgent: '',
                agentResults: {},
                finalResponse: '',
                routingResult: undefined,
                conversationId: threadId,
                userId,
                metadata: {
                    startTime: new Date(),
                    stepCount: 0,
                    errors: [],
                },
            };

            // Execute the workflow
            const result = await this.compiledGraph.invoke(initialState, {
                configurable: { thread_id: threadId },
                recursionLimit: this.config.maxSteps,
            });

            const duration = Date.now() - startTime;

            this.logger.info('Workflow execution completed', {
                conversationId: threadId,
                duration,
                stepCount: result.metadata?.stepCount || 0,
                finalAgent: result.currentAgent,
            });

            return {
                success: true,
                response: result.finalResponse || '处理完成，但没有生成响应。',
                conversationId: threadId,
                metadata: {
                    duration,
                    stepCount: result.metadata?.stepCount || 0,
                    agentUsed: result.currentAgent,
                    routingResult: result.routingResult,
                },
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.logger.error('Workflow execution failed', {
                conversationId: threadId,
                userInput: userInput.substring(0, 100),
                error: errorMessage,
                duration,
            });

            return {
                success: false,
                response: '抱歉，处理您的请求时出现了错误。请稍后重试。',
                conversationId: threadId,
                metadata: {
                    duration,
                    error: errorMessage,
                },
                error: errorMessage,
            };
        }
    }

    /**
     * Stream workflow execution
     */
    async stream(
        userInput: string,
        conversationId?: string,
        userId: string = 'default-user'
    ): Promise<AsyncIterable<any>> {
        if (!this.compiledGraph) {
            await this.compile();
        }

        const threadId = conversationId || `thread-${uuidv4()}`;

        try {
            this.logger.info('Starting workflow streaming', {
                userInput: userInput.substring(0, 100),
                conversationId: threadId,
                userId,
            });

            const initialState: WorkflowState = {
                messages: [new HumanMessage(userInput)],
                userInput,
                currentAgent: '',
                agentResults: {},
                finalResponse: '',
                routingResult: undefined,
                conversationId: threadId,
                userId,
                metadata: {
                    startTime: new Date(),
                    stepCount: 0,
                    errors: [],
                },
            };

            return this.compiledGraph.stream(initialState, {
                configurable: { thread_id: threadId },
                recursionLimit: this.config.maxSteps,
            });
        } catch (error) {
            this.logger.error('Failed to start workflow streaming', {
                conversationId: threadId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    // Node implementations

    /**
     * Router node - determines which agent should handle the request
     */
    private async routerNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        try {
            this.logger.debug('Executing router node', {
                conversationId: state.conversationId,
                userInput: state.userInput.substring(0, 100),
            });

            // Get routing context
            const routingContext = await this.agentRouter.getRoutingContext(
                state.conversationId,
                state.userId
            );

            // Update context with current input
            routingContext.currentContext = {
                ...routingContext.currentContext,
                userInput: state.userInput,
                hasPhoto: false, // TODO: Detect photo uploads
                hasFile: false, // TODO: Detect file uploads
            };

            // Perform intelligent routing
            const routingResult = await this.agentRouter.routeIntelligently(state.userInput, routingContext);

            // Update routing context
            await this.agentRouter.updateRoutingContext(routingContext, routingResult, state.userInput);

            return {
                routingResult: routingResult,
                currentAgent: routingResult.targetAgent,
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                },
            };
        } catch (error) {
            this.logger.error('Router node failed', {
                conversationId: state.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                currentAgent: 'error',
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                    errors: [...(state.metadata?.errors || []), error instanceof Error ? error.message : String(error)],
                },
            };
        }
    }

    /**
     * Inventory agent node
     */
    private async inventoryAgentNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        return this.executeAgentNode('inventory', state);
    }

    /**
     * Procurement agent node
     */
    private async procurementAgentNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        return this.executeAgentNode('procurement', state);
    }

    /**
     * Finance agent node
     */
    private async financeAgentNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        return this.executeAgentNode('finance', state);
    }

    /**
     * Notification agent node
     */
    private async notificationAgentNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        return this.executeAgentNode('notification', state);
    }

    /**
     * Generic agent execution node
     */
    private async executeAgentNode(agentType: string, state: WorkflowState): Promise<Partial<WorkflowState>> {
        try {
            this.logger.debug('Executing agent node', {
                agentType,
                conversationId: state.conversationId,
                userInput: state.userInput.substring(0, 100),
            });

            const agent = this.agents.get(agentType);
            if (!agent) {
                throw new Error(`Agent not found: ${agentType}`);
            }

            // Execute agent with conversation context
            const result = await agent.invoke(state.userInput, {
                configurable: { thread_id: state.conversationId },
            });

            // Extract response from agent result
            let agentResponse = '';
            if (result.success && result.messages.length > 0) {
                const lastMessage = result.messages[result.messages.length - 1];
                if (lastMessage.content) {
                    agentResponse = typeof lastMessage.content === 'string'
                        ? lastMessage.content
                        : JSON.stringify(lastMessage.content);
                }
            }

            return {
                agentResults: {
                    [agentType]: {
                        success: result.success,
                        response: agentResponse,
                        duration: result.duration,
                        metadata: result.metadata,
                        error: result.error,
                    },
                },
                messages: result.messages.map(msg => new AIMessage(msg.content || '')),
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                },
            };
        } catch (error) {
            this.logger.error('Agent node execution failed', {
                agentType,
                conversationId: state.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                agentResults: {
                    [agentType]: {
                        success: false,
                        response: '',
                        error: error instanceof Error ? error.message : String(error),
                    },
                },
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                    errors: [...(state.metadata?.errors || []), error instanceof Error ? error.message : String(error)],
                },
            };
        }
    }

    /**
     * Response formatter node - formats the final response
     */
    private async responseFormatterNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
        try {
            this.logger.debug('Executing response formatter node', {
                conversationId: state.conversationId,
                currentAgent: state.currentAgent,
            });

            let finalResponse = '';

            if (state.currentAgent === 'error') {
                finalResponse = '抱歉，处理您的请求时出现了错误。请检查您的输入并重试。';
                if (state.metadata?.errors && state.metadata.errors.length > 0) {
                    this.logger.error('Workflow errors', {
                        conversationId: state.conversationId,
                        errors: state.metadata.errors,
                    });
                }
            } else {
                // Get the result from the current agent
                const agentResult = state.agentResults[state.currentAgent];
                if (agentResult && agentResult.success) {
                    finalResponse = agentResult.response || '操作已完成。';
                } else if (agentResult && agentResult.error) {
                    finalResponse = `处理过程中出现错误：${agentResult.error}`;
                } else {
                    finalResponse = '处理完成，但没有生成具体的响应内容。';
                }
            }

            return {
                finalResponse,
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                },
            };
        } catch (error) {
            this.logger.error('Response formatter node failed', {
                conversationId: state.conversationId,
                error: error instanceof Error ? error.message : String(error),
            });

            return {
                finalResponse: '抱歉，格式化响应时出现了错误。',
                metadata: {
                    ...state.metadata,
                    stepCount: (state.metadata?.stepCount || 0) + 1,
                    errors: [...(state.metadata?.errors || []), error instanceof Error ? error.message : String(error)],
                },
            };
        }
    }

    /**
     * Routing condition function for conditional edges
     */
    private routingCondition(state: WorkflowState): string {
        if (state.currentAgent === 'error') {
            return 'error';
        }

        // Map agent types to routing keys
        const routingMap: Record<string, string> = {
            inventory: 'inventory',
            procurement: 'procurement',
            finance: 'finance',
            notification: 'notification',
        };

        return routingMap[state.currentAgent] || 'error';
    }

    /**
     * Get workflow statistics
     */
    getStats(): {
        registeredAgents: number;
        isCompiled: boolean;
        config: LangGraphWorkflowConfig;
    } {
        return {
            registeredAgents: this.agents.size,
            isCompiled: !!this.compiledGraph,
            config: this.config,
        };
    }

    /**
     * Shutdown the workflow
     */
    async shutdown(): Promise<void> {
        this.agents.clear();
        this.compiledGraph = null;
        this.logger.info('LangGraph StateGraph Workflow shutdown completed');
    }
}
