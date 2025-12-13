/**
 * Base abstract class for all agents in the shopping assistant system
 * Uses LangChain's createReactAgent as the core "brain" with LLM integration
 */

import { EventEmitter } from 'events';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatDeepSeek } from '@langchain/deepseek';
import { DynamicTool } from '@langchain/core/tools';
import { Logger } from '@/utils/Logger';

// Simplified agent configuration
export interface BaseAgentConfig {
    agentId: string;
    name: string;
    description: string;
    systemPrompt?: string;
    model?: ChatDeepSeek;
    tools: DynamicTool[];
    memoryEnabled?: boolean;
}

// Agent metrics for monitoring
export interface AgentMetrics {
    agentId: string;
    tasksCompleted: number;
    tasksFailedCount: number;
    averageResponseTime: number;
    lastActiveTime: Date;
    errorRate: number;
}

// Agent execution result
export interface AgentResult {
    success: boolean;
    messages: any[];
    error?: string;
    duration: number;
    metadata?: Record<string, any>;
}

export abstract class BaseAgent extends EventEmitter {
    protected logger: Logger;
    protected config: BaseAgentConfig;
    protected model: ChatDeepSeek;
    protected agent: any;
    protected memory?: MemorySaver;
    protected tools: DynamicTool[];
    protected systemPrompt: string;
    protected _metrics: AgentMetrics;
    protected isInitialized = false;

    constructor(config: BaseAgentConfig) {
        super();
        this.config = config;
        this.tools = config.tools;

        this.logger = new Logger({
            component: `Agent:${config.name}`,
            level: 'info',
        });

        // Initialize LLM model
        this.model = config.model || new ChatDeepSeek({
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: 'deepseek-chat',
            temperature: 0.1, // Lower temperature for more consistent responses
        });

        // Initialize metrics
        this._metrics = {
            agentId: config.agentId,
            tasksCompleted: 0,
            tasksFailedCount: 0,
            averageResponseTime: 0,
            lastActiveTime: new Date(),
            errorRate: 0,
        };

        // Set system prompt
        this.systemPrompt = config.systemPrompt || this.getDefaultSystemPrompt();

        // Initialize memory if enabled
        if (config.memoryEnabled !== false) {
            this.memory = new MemorySaver();
        }
    }

    /**
     * Initialize the agent with LangChain's createReactAgent
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            this.logger.info('Initializing LangChain agent', {
                agentId: this.config.agentId,
                toolCount: this.tools.length,
                hasMemory: !!this.memory
            });

            // Create the LangChain React agent
            this.agent = createReactAgent({
                llm: this.model,
                tools: this.tools,
                checkpointSaver: this.memory,
            });

            // Perform any custom initialization
            await this.onInitialize();

            this.isInitialized = true;
            this.logger.info('Agent initialized successfully', { agentId: this.config.agentId });
            this.emit('initialized', this.config.agentId);

        } catch (error) {
            this.logger.error('Failed to initialize agent', {
                agentId: this.config.agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Process user input using the LangChain agent
     */
    async invoke(
        input: string,
        config?: { configurable?: { thread_id: string } }
    ): Promise<AgentResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const startTime = Date.now();

        try {
            this.logger.info('Processing user input', {
                agentId: this.config.agentId,
                input: input.substring(0, 100) + (input.length > 100 ? '...' : '')
            });

            const threadConfig = config || {
                configurable: { thread_id: `${this.config.agentId}-${Date.now()}` }
            };

            // Create messages with system prompt and user input
            const messages = [
                new SystemMessage(this.systemPrompt),
                new HumanMessage(input)
            ];

            const result = await this.agent.invoke(
                { messages },
                threadConfig
            );

            const duration = Date.now() - startTime;
            this.updateMetrics(true, duration);

            this.logger.info('Agent response generated successfully', {
                agentId: this.config.agentId,
                duration,
                messageCount: result.messages?.length || 0
            });

            this.emit('taskCompleted', { input, result, duration });

            return {
                success: true,
                messages: result.messages || [],
                duration,
                metadata: {
                    threadId: threadConfig.configurable?.thread_id,
                    toolsUsed: this.extractToolsUsed(result),
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            this.updateMetrics(false, duration);

            const errorMessage = error instanceof Error ? error.message : String(error);

            this.logger.error('Agent processing failed', {
                agentId: this.config.agentId,
                input: input.substring(0, 100),
                error: errorMessage,
                duration,
            });

            this.emit('taskFailed', { input, error: errorMessage, duration });

            return {
                success: false,
                messages: [],
                error: errorMessage,
                duration,
            };
        }
    }

    /**
     * Stream responses from the agent
     */
    async stream(
        input: string,
        config?: { configurable?: { thread_id: string } }
    ): Promise<AsyncIterable<any>> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            this.logger.info('Starting streaming response', {
                agentId: this.config.agentId,
                input: input.substring(0, 100) + (input.length > 100 ? '...' : '')
            });

            const threadConfig = config || {
                configurable: { thread_id: `${this.config.agentId}-stream-${Date.now()}` }
            };

            const messages = [
                new SystemMessage(this.systemPrompt),
                new HumanMessage(input)
            ];

            return this.agent.stream(
                { messages },
                threadConfig
            );

        } catch (error) {
            this.logger.error('Failed to start streaming response', {
                agentId: this.config.agentId,
                input: input.substring(0, 100),
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Add a new tool to the agent
     */
    addTool(tool: DynamicTool): void {
        this.tools.push(tool);
        this.logger.info('Tool added to agent', {
            agentId: this.config.agentId,
            toolName: tool.name,
            totalTools: this.tools.length
        });

        // If agent is already initialized, we need to reinitialize with new tools
        if (this.isInitialized) {
            this.isInitialized = false;
            this.initialize().catch(error => {
                this.logger.error('Failed to reinitialize agent after adding tool', { error });
            });
        }
    }

    /**
     * Remove a tool from the agent
     */
    removeTool(toolName: string): boolean {
        const initialLength = this.tools.length;
        this.tools = this.tools.filter(tool => tool.name !== toolName);

        if (this.tools.length < initialLength) {
            this.logger.info('Tool removed from agent', {
                agentId: this.config.agentId,
                toolName,
                totalTools: this.tools.length
            });

            // Reinitialize if agent was already initialized
            if (this.isInitialized) {
                this.isInitialized = false;
                this.initialize().catch(error => {
                    this.logger.error('Failed to reinitialize agent after removing tool', { error });
                });
            }
            return true;
        }
        return false;
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return this.tools.map(tool => tool.name);
    }

    /**
     * Get tool description
     */
    getToolDescription(toolName: string): string | undefined {
        const tool = this.tools.find(t => t.name === toolName);
        return tool?.description;
    }

    /**
     * Get agent metrics
     */
    getMetrics(): AgentMetrics {
        return { ...this._metrics };
    }

    /**
     * Get agent configuration
     */
    getConfig(): BaseAgentConfig {
        return { ...this.config };
    }

    /**
     * Update system prompt
     */
    updateSystemPrompt(newPrompt: string): void {
        this.systemPrompt = newPrompt;
        this.logger.info('System prompt updated', { agentId: this.config.agentId });
    }

    // Protected methods for subclasses to override
    protected abstract getDefaultSystemPrompt(): string;

    protected async onInitialize(): Promise<void> {
        // Override in subclasses for custom initialization
    }

    // Private helper methods
    private updateMetrics(success: boolean, duration: number): void {
        if (success) {
            this._metrics.tasksCompleted++;
        } else {
            this._metrics.tasksFailedCount++;
        }

        const totalTasks = this._metrics.tasksCompleted + this._metrics.tasksFailedCount;
        this._metrics.errorRate = totalTasks > 0 ? this._metrics.tasksFailedCount / totalTasks : 0;

        // Update average response time
        const currentAvg = this._metrics.averageResponseTime;
        const completedTasks = this._metrics.tasksCompleted;

        if (completedTasks > 0) {
            this._metrics.averageResponseTime =
                (currentAvg * (completedTasks - 1) + duration) / completedTasks;
        }

        this._metrics.lastActiveTime = new Date();
    }

    private extractToolsUsed(result: any): string[] {
        // Extract tool usage information from the result
        // This is a simplified implementation
        const toolsUsed: string[] = [];

        if (result.messages) {
            for (const message of result.messages) {
                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        if (toolCall.name && !toolsUsed.includes(toolCall.name)) {
                            toolsUsed.push(toolCall.name);
                        }
                    }
                }
            }
        }

        return toolsUsed;
    }
}
