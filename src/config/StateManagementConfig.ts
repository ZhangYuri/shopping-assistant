/**
 * Configuration for LangChain state management integration
 * Provides factory methods and configuration for AgentStateManager and LangGraph integration
 */

import { AgentStateManager, StateManagerConfig } from '../state/AgentStateManager';
import { LangGraphWorkflowEngine, LangGraphWorkflowConfig } from '../workflows/LangGraphWorkflowEngine';
import { StateManagementService } from '../services/StateManagementService';
import { Logger } from '../utils/Logger';

export interface StateManagementSystemConfig {
    stateManager: Partial<StateManagerConfig>;
    workflowEngine: Partial<LangGraphWorkflowConfig>;
    enablePersistence: boolean;
    enableCaching: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Factory class for creating and configuring the state management system
 */
export class StateManagementFactory {
    private static instance: StateManagementFactory;
    private logger: Logger;
    private stateManager?: AgentStateManager;
    private workflowEngine?: LangGraphWorkflowEngine;

    private constructor() {
        this.logger = new Logger({
            component: 'StateManagementFactory',
            level: 'info',
        });
    }

    static getInstance(): StateManagementFactory {
        if (!StateManagementFactory.instance) {
            StateManagementFactory.instance = new StateManagementFactory();
        }
        return StateManagementFactory.instance;
    }

    /**
     * Create and configure the complete state management system
     */
    createStateManagementSystem(
        config: Partial<StateManagementSystemConfig> = {}
    ): {
        stateManager: AgentStateManager;
        workflowEngine: LangGraphWorkflowEngine;
        stateManagementService: StateManagementService;
    } {
        const fullConfig: StateManagementSystemConfig = {
            stateManager: {
                enableConversationPersistence: true,
                enableGeneralCaching: true,
                defaultCacheTTL: 3600000, // 1 hour
                maxConversationHistory: 100,
                cleanupInterval: 300000, // 5 minutes
            },
            workflowEngine: {
                enableStateManagement: true,
                maxConcurrentWorkflows: 10,
                defaultTimeout: 300000, // 5 minutes
                retryPolicy: {
                    maxRetries: 3,
                    backoffMs: 1000,
                },
            },
            enablePersistence: true,
            enableCaching: true,
            logLevel: 'info',
            ...config,
        };

        this.logger.info('Creating state management system', {
            persistence: fullConfig.enablePersistence,
            caching: fullConfig.enableCaching,
            logLevel: fullConfig.logLevel,
        });

        // Create state manager
        this.stateManager = new AgentStateManager({
            ...fullConfig.stateManager,
            enableConversationPersistence: fullConfig.enablePersistence,
            enableGeneralCaching: fullConfig.enableCaching,
        });

        // Create workflow engine
        this.workflowEngine = new LangGraphWorkflowEngine(
            this.stateManager,
            fullConfig.workflowEngine
        );

        // Initialize the new StateManagementService
        const stateManagementService = StateManagementService.getInstance();
        stateManagementService.initialize().catch(error => {
            this.logger.error('Failed to initialize StateManagementService', { error });
        });

        this.logger.info('State management system created successfully');

        return {
            stateManager: this.stateManager,
            workflowEngine: this.workflowEngine,
            stateManagementService,
        };
    }

    /**
     * Create a standalone state manager
     */
    createStateManager(config: Partial<StateManagerConfig> = {}): AgentStateManager {
        this.logger.info('Creating standalone state manager');

        this.stateManager = new AgentStateManager(config);
        return this.stateManager;
    }

    /**
     * Create a workflow engine with an existing state manager
     */
    createWorkflowEngine(
        stateManager: AgentStateManager,
        config: Partial<LangGraphWorkflowConfig> = {}
    ): LangGraphWorkflowEngine {
        this.logger.info('Creating workflow engine with existing state manager');

        this.workflowEngine = new LangGraphWorkflowEngine(stateManager, config);
        return this.workflowEngine;
    }

    /**
     * Get the current state manager instance
     */
    getStateManager(): AgentStateManager | undefined {
        return this.stateManager;
    }

    /**
     * Get the current workflow engine instance
     */
    getWorkflowEngine(): LangGraphWorkflowEngine | undefined {
        return this.workflowEngine;
    }

    /**
     * Shutdown all components
     */
    async shutdown(): Promise<void> {
        this.logger.info('Shutting down state management system');

        if (this.workflowEngine) {
            await this.workflowEngine.shutdown();
        }

        if (this.stateManager) {
            await this.stateManager.shutdown();
        }

        this.stateManager = undefined;
        this.workflowEngine = undefined;

        this.logger.info('State management system shutdown completed');
    }
}

/**
 * Default configurations for different environments
 */
export const StateManagementConfigs = {
    development: {
        stateManager: {
            enableConversationPersistence: true,
            enableGeneralCaching: true,
            defaultCacheTTL: 1800000, // 30 minutes
            maxConversationHistory: 50,
            cleanupInterval: 60000, // 1 minute
        },
        workflowEngine: {
            enableStateManagement: true,
            maxConcurrentWorkflows: 5,
            defaultTimeout: 120000, // 2 minutes
            retryPolicy: {
                maxRetries: 2,
                backoffMs: 500,
            },
        },
        enablePersistence: true,
        enableCaching: true,
        logLevel: 'debug' as const,
    },

    production: {
        stateManager: {
            enableConversationPersistence: true,
            enableGeneralCaching: true,
            defaultCacheTTL: 7200000, // 2 hours
            maxConversationHistory: 200,
            cleanupInterval: 600000, // 10 minutes
        },
        workflowEngine: {
            enableStateManagement: true,
            maxConcurrentWorkflows: 20,
            defaultTimeout: 600000, // 10 minutes
            retryPolicy: {
                maxRetries: 5,
                backoffMs: 2000,
            },
        },
        enablePersistence: true,
        enableCaching: true,
        logLevel: 'info' as const,
    },

    testing: {
        stateManager: {
            enableConversationPersistence: false,
            enableGeneralCaching: false,
            defaultCacheTTL: 60000, // 1 minute
            maxConversationHistory: 10,
            cleanupInterval: 10000, // 10 seconds
        },
        workflowEngine: {
            enableStateManagement: false,
            maxConcurrentWorkflows: 2,
            defaultTimeout: 30000, // 30 seconds
            retryPolicy: {
                maxRetries: 1,
                backoffMs: 100,
            },
        },
        enablePersistence: false,
        enableCaching: false,
        logLevel: 'warn' as const,
    },
} as const;

/**
 * Utility function to get configuration by environment
 */
export function getStateManagementConfig(
    environment: keyof typeof StateManagementConfigs = 'development'
): StateManagementSystemConfig {
    return StateManagementConfigs[environment];
}

/**
 * Utility function to create a configured state management system
 */
export function createConfiguredStateManagement(
    environment: keyof typeof StateManagementConfigs = 'development'
): {
    stateManager: AgentStateManager;
    workflowEngine: LangGraphWorkflowEngine;
    stateManagementService: StateManagementService;
} {
    const factory = StateManagementFactory.getInstance();
    const config = getStateManagementConfig(environment);
    return factory.createStateManagementSystem(config);
}

/**
 * Utility function to get the StateManagementService instance
 */
export function getStateManagementService(): StateManagementService {
    return StateManagementService.getInstance();
}
