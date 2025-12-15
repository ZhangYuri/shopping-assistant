/**
 * System Monitoring and Metrics Collection
 * Provides performance monitoring, health checks, and metrics collection
 */

import { Logger } from '../utils/Logger';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { cpuUsage, memoryUsage } from 'process';

// Metrics interfaces
export interface SystemMetrics {
    timestamp: string;
    uptime: number;
    memory: {
        used: number;
        total: number;
        percentage: number;
        heap: {
            used: number;
            total: number;
            percentage: number;
        };
    };
    cpu: {
        user: number;
        system: number;
        percentage: number;
    };
    eventLoop: {
        delay: number;
        utilization: number;
    };
    gc: {
        collections: number;
        duration: number;
        lastCollection: string | null;
    };
}

export interface AgentMetrics {
    agentId: string;
    agentType: string;
    metrics: {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        averageResponseTime: number;
        lastRequestTime: string | null;
        errorRate: number;
        uptime: number;
    };
    performance: {
        averageProcessingTime: number;
        maxProcessingTime: number;
        minProcessingTime: number;
        totalProcessingTime: number;
    };
    resources: {
        memoryUsage: number;
        cpuUsage: number;
    };
}

export interface ToolMetrics {
    toolName: string;
    toolCategory: string;
    metrics: {
        totalCalls: number;
        successfulCalls: number;
        failedCalls: number;
        averageResponseTime: number;
        lastCallTime: string | null;
        errorRate: number;
        retryCount: number;
    };
    performance: {
        averageExecutionTime: number;
        maxExecutionTime: number;
        minExecutionTime: number;
        totalExecutionTime: number;
    };
    errors: {
        connectionErrors: number;
        timeoutErrors: number;
        validationErrors: number;
        otherErrors: number;
    };
}

export interface ConversationMetrics {
    totalConversations: number;
    activeConversations: number;
    averageConversationLength: number;
    totalMessages: number;
    averageResponseTime: number;
    clarificationRate: number;
    languageDistribution: Record<string, number>;
    intentDistribution: Record<string, number>;
    agentRoutingDistribution: Record<string, number>;
}

export interface HealthCheckResult {
    component: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    responseTime: number;
    timestamp: string;
    details?: Record<string, any>;
}

export interface SystemHealth {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: HealthCheckResult[];
    timestamp: string;
    uptime: number;
}

export interface AlertRule {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    metric: string;
    condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
    threshold: number;
    duration: number; // in milliseconds
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: string[];
}

export interface Alert {
    id: string;
    ruleId: string;
    ruleName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    metric: string;
    value: number;
    threshold: number;
    timestamp: string;
    resolved: boolean;
    resolvedAt?: string;
}

/**
 * System Monitor for comprehensive system monitoring and alerting
 */
export class SystemMonitor extends EventEmitter {
    private logger: Logger;
    private isRunning = false;
    private metricsInterval?: NodeJS.Timeout;
    private healthCheckInterval?: NodeJS.Timeout;
    private alertCheckInterval?: NodeJS.Timeout;

    // Metrics storage
    private systemMetrics: SystemMetrics[] = [];
    private agentMetrics: Map<string, AgentMetrics> = new Map();
    private toolMetrics: Map<string, ToolMetrics> = new Map();
    private conversationMetrics: ConversationMetrics = {
        totalConversations: 0,
        activeConversations: 0,
        averageConversationLength: 0,
        totalMessages: 0,
        averageResponseTime: 0,
        clarificationRate: 0,
        languageDistribution: {},
        intentDistribution: {},
        agentRoutingDistribution: {},
    };

    // Health checks
    private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
    private lastHealthCheck?: SystemHealth;

    // Alerting
    private alertRules: Map<string, AlertRule> = new Map();
    private activeAlerts: Map<string, Alert> = new Map();
    private alertHistory: Alert[] = [];

    // Configuration
    private config = {
        metricsInterval: 60000, // 1 minute
        healthCheckInterval: 30000, // 30 seconds
        alertCheckInterval: 10000, // 10 seconds
        maxMetricsHistory: 1440, // 24 hours at 1-minute intervals
        maxAlertHistory: 1000,
        enableGCMetrics: true,
        enableEventLoopMetrics: true,
    };

    // Performance tracking
    private gcStats = {
        collections: 0,
        duration: 0,
        lastCollection: null as string | null,
    };

    private eventLoopStats = {
        delay: 0,
        utilization: 0,
    };

    constructor(config: Partial<typeof SystemMonitor.prototype.config> = {}) {
        super();

        this.config = { ...this.config, ...config };

        this.logger = new Logger({
            component: 'SystemMonitor',
            level: 'info',
        });

        this.setupGCMonitoring();
        this.setupEventLoopMonitoring();
        this.setupDefaultHealthChecks();
        this.setupDefaultAlertRules();
    }

    /**
     * Setup garbage collection monitoring
     */
    private setupGCMonitoring(): void {
        if (!this.config.enableGCMetrics) return;

        try {
            // Note: In production, you might want to use a more sophisticated GC monitoring library
            const originalGC = global.gc;
            if (originalGC) {
                global.gc = (() => {
                    const start = performance.now();
                    originalGC();
                    const duration = performance.now() - start;

                    this.gcStats.collections++;
                    this.gcStats.duration += duration;
                    this.gcStats.lastCollection = new Date().toISOString();

                    this.emit('gc', {
                        duration,
                        totalCollections: this.gcStats.collections,
                        totalDuration: this.gcStats.duration,
                    });
                }) as any;
            }
        } catch (error) {
            this.logger.warn('Failed to setup GC monitoring', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Setup event loop monitoring
     */
    private setupEventLoopMonitoring(): void {
        if (!this.config.enableEventLoopMetrics) return;

        setInterval(() => {
            const start = performance.now();
            setImmediate(() => {
                const delay = performance.now() - start;
                this.eventLoopStats.delay = delay;

                // Calculate utilization (simplified)
                this.eventLoopStats.utilization = Math.min(delay / 10, 1); // Normalize to 0-1

                if (delay > 100) { // Alert if event loop delay > 100ms
                    this.emit('eventLoopDelay', { delay, utilization: this.eventLoopStats.utilization });
                }
            });
        }, 5000); // Check every 5 seconds
    }

    /**
     * Setup default health checks
     */
    private setupDefaultHealthChecks(): void {
        // System health check
        this.registerHealthCheck('system', async () => {
            const start = performance.now();
            const memory = memoryUsage();
            const responseTime = performance.now() - start;

            const memoryUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;

            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            let message = 'System is operating normally';

            if (memoryUsagePercent > 90) {
                status = 'unhealthy';
                message = 'High memory usage detected';
            } else if (memoryUsagePercent > 75) {
                status = 'degraded';
                message = 'Elevated memory usage';
            }

            return {
                component: 'system',
                status,
                message,
                responseTime,
                timestamp: new Date().toISOString(),
                details: {
                    memoryUsagePercent,
                    uptime: process.uptime(),
                    eventLoopDelay: this.eventLoopStats.delay,
                },
            };
        });

        // Database health check (placeholder)
        this.registerHealthCheck('database', async () => {
            const start = performance.now();

            try {
                // This would be replaced with actual database ping
                await new Promise(resolve => setTimeout(resolve, 10));

                return {
                    component: 'database',
                    status: 'healthy' as const,
                    message: 'Database connection is healthy',
                    responseTime: performance.now() - start,
                    timestamp: new Date().toISOString(),
                };
            } catch (error) {
                return {
                    component: 'database',
                    status: 'unhealthy' as const,
                    message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
                    responseTime: performance.now() - start,
                    timestamp: new Date().toISOString(),
                };
            }
        });
    }

    /**
     * Setup default alert rules
     */
    private setupDefaultAlertRules(): void {
        // High memory usage alert
        this.addAlertRule({
            id: 'high-memory-usage',
            name: 'High Memory Usage',
            description: 'Alert when memory usage exceeds 80%',
            enabled: true,
            metric: 'memory.percentage',
            condition: 'greater_than',
            threshold: 80,
            duration: 60000, // 1 minute
            severity: 'high',
            actions: ['log', 'notify'],
        });

        // High event loop delay alert
        this.addAlertRule({
            id: 'high-event-loop-delay',
            name: 'High Event Loop Delay',
            description: 'Alert when event loop delay exceeds 100ms',
            enabled: true,
            metric: 'eventLoop.delay',
            condition: 'greater_than',
            threshold: 100,
            duration: 30000, // 30 seconds
            severity: 'medium',
            actions: ['log'],
        });

        // High error rate alert
        this.addAlertRule({
            id: 'high-error-rate',
            name: 'High Error Rate',
            description: 'Alert when error rate exceeds 10%',
            enabled: true,
            metric: 'agents.errorRate',
            condition: 'greater_than',
            threshold: 10,
            duration: 300000, // 5 minutes
            severity: 'high',
            actions: ['log', 'notify'],
        });
    }

    /**
     * Start monitoring
     */
    start(): void {
        if (this.isRunning) {
            this.logger.warn('System monitor is already running');
            return;
        }

        this.logger.info('Starting system monitor', {
            metricsInterval: this.config.metricsInterval,
            healthCheckInterval: this.config.healthCheckInterval,
            alertCheckInterval: this.config.alertCheckInterval,
        });

        // Start metrics collection
        this.metricsInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.metricsInterval);

        // Start health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);

        // Start alert checking
        this.alertCheckInterval = setInterval(() => {
            this.checkAlerts();
        }, this.config.alertCheckInterval);

        this.isRunning = true;
        this.emit('started');
    }

    /**
     * Stop monitoring
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Stopping system monitor');

        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }

        if (this.alertCheckInterval) {
            clearInterval(this.alertCheckInterval);
            this.alertCheckInterval = undefined;
        }

        this.isRunning = false;
        this.emit('stopped');
    }

    /**
     * Collect system metrics
     */
    private collectSystemMetrics(): void {
        try {
            const memory = memoryUsage();
            const cpu = cpuUsage();

            const metrics: SystemMetrics = {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: {
                    used: memory.heapUsed,
                    total: memory.heapTotal,
                    percentage: (memory.heapUsed / memory.heapTotal) * 100,
                    heap: {
                        used: memory.heapUsed,
                        total: memory.heapTotal,
                        percentage: (memory.heapUsed / memory.heapTotal) * 100,
                    },
                },
                cpu: {
                    user: cpu.user,
                    system: cpu.system,
                    percentage: ((cpu.user + cpu.system) / 1000000) * 100, // Convert to percentage
                },
                eventLoop: {
                    delay: this.eventLoopStats.delay,
                    utilization: this.eventLoopStats.utilization,
                },
                gc: {
                    collections: this.gcStats.collections,
                    duration: this.gcStats.duration,
                    lastCollection: this.gcStats.lastCollection,
                },
            };

            this.systemMetrics.push(metrics);

            // Limit history size
            if (this.systemMetrics.length > this.config.maxMetricsHistory) {
                this.systemMetrics = this.systemMetrics.slice(-this.config.maxMetricsHistory);
            }

            this.emit('systemMetrics', metrics);
        } catch (error) {
            this.logger.error('Failed to collect system metrics', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Perform health checks
     */
    private async performHealthChecks(): Promise<void> {
        try {
            const results: HealthCheckResult[] = [];

            for (const [component, healthCheck] of this.healthChecks) {
                try {
                    const result = await healthCheck();
                    results.push(result);
                } catch (error) {
                    results.push({
                        component,
                        status: 'unhealthy',
                        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
                        responseTime: 0,
                        timestamp: new Date().toISOString(),
                    });
                }
            }

            // Determine overall health
            let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            if (results.some(r => r.status === 'unhealthy')) {
                overall = 'unhealthy';
            } else if (results.some(r => r.status === 'degraded')) {
                overall = 'degraded';
            }

            const health: SystemHealth = {
                overall,
                components: results,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
            };

            this.lastHealthCheck = health;
            this.emit('healthCheck', health);

            // Log health status changes
            if (this.lastHealthCheck && this.lastHealthCheck.overall !== overall) {
                this.logger.info('System health status changed', {
                    from: this.lastHealthCheck.overall,
                    to: overall,
                    components: results.filter(r => r.status !== 'healthy').map(r => ({
                        component: r.component,
                        status: r.status,
                        message: r.message,
                    })),
                });
            }
        } catch (error) {
            this.logger.error('Failed to perform health checks', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Check alerts
     */
    private checkAlerts(): void {
        try {
            const currentMetrics = this.getCurrentMetrics();

            for (const [ruleId, rule] of this.alertRules) {
                if (!rule.enabled) continue;

                const value = this.getMetricValue(currentMetrics, rule.metric);
                if (value === undefined) continue;

                const shouldAlert = this.evaluateCondition(value, rule.condition, rule.threshold);

                if (shouldAlert) {
                    this.triggerAlert(rule, value);
                } else {
                    this.resolveAlert(ruleId);
                }
            }
        } catch (error) {
            this.logger.error('Failed to check alerts', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Get current metrics for alert evaluation
     */
    private getCurrentMetrics(): any {
        const latestSystemMetrics = this.systemMetrics[this.systemMetrics.length - 1];

        return {
            system: latestSystemMetrics,
            memory: latestSystemMetrics?.memory,
            cpu: latestSystemMetrics?.cpu,
            eventLoop: latestSystemMetrics?.eventLoop,
            agents: this.getAggregatedAgentMetrics(),
            tools: this.getAggregatedToolMetrics(),
            conversations: this.conversationMetrics,
        };
    }

    /**
     * Get aggregated agent metrics
     */
    private getAggregatedAgentMetrics(): any {
        const agents = Array.from(this.agentMetrics.values());
        if (agents.length === 0) return {};

        const totalRequests = agents.reduce((sum, agent) => sum + agent.metrics.totalRequests, 0);
        const failedRequests = agents.reduce((sum, agent) => sum + agent.metrics.failedRequests, 0);

        return {
            totalRequests,
            failedRequests,
            errorRate: totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
            averageResponseTime: agents.reduce((sum, agent) => sum + agent.metrics.averageResponseTime, 0) / agents.length,
        };
    }

    /**
     * Get aggregated tool metrics
     */
    private getAggregatedToolMetrics(): any {
        const tools = Array.from(this.toolMetrics.values());
        if (tools.length === 0) return {};

        const totalCalls = tools.reduce((sum, tool) => sum + tool.metrics.totalCalls, 0);
        const failedCalls = tools.reduce((sum, tool) => sum + tool.metrics.failedCalls, 0);

        return {
            totalCalls,
            failedCalls,
            errorRate: totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0,
            averageResponseTime: tools.reduce((sum, tool) => sum + tool.metrics.averageResponseTime, 0) / tools.length,
        };
    }

    /**
     * Get metric value from metrics object
     */
    private getMetricValue(metrics: any, metricPath: string): number | undefined {
        const parts = metricPath.split('.');
        let value = metrics;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return undefined;
            }
        }

        return typeof value === 'number' ? value : undefined;
    }

    /**
     * Evaluate alert condition
     */
    private evaluateCondition(value: number, condition: string, threshold: number): boolean {
        switch (condition) {
            case 'greater_than':
                return value > threshold;
            case 'less_than':
                return value < threshold;
            case 'equals':
                return value === threshold;
            case 'not_equals':
                return value !== threshold;
            default:
                return false;
        }
    }

    /**
     * Trigger alert
     */
    private triggerAlert(rule: AlertRule, value: number): void {
        const existingAlert = this.activeAlerts.get(rule.id);

        if (existingAlert) {
            // Update existing alert
            existingAlert.value = value;
            existingAlert.timestamp = new Date().toISOString();
        } else {
            // Create new alert
            const alert: Alert = {
                id: `${rule.id}-${Date.now()}`,
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                message: `${rule.description}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
                metric: rule.metric,
                value,
                threshold: rule.threshold,
                timestamp: new Date().toISOString(),
                resolved: false,
            };

            this.activeAlerts.set(rule.id, alert);
            this.alertHistory.push(alert);

            // Limit alert history
            if (this.alertHistory.length > this.config.maxAlertHistory) {
                this.alertHistory = this.alertHistory.slice(-this.config.maxAlertHistory);
            }

            this.emit('alert', alert);
            this.executeAlertActions(rule, alert);

            this.logger.warn('Alert triggered', {
                alertId: alert.id,
                ruleName: rule.name,
                severity: rule.severity,
                metric: rule.metric,
                value,
                threshold: rule.threshold,
            });
        }
    }

    /**
     * Resolve alert
     */
    private resolveAlert(ruleId: string): void {
        const alert = this.activeAlerts.get(ruleId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedAt = new Date().toISOString();

            this.activeAlerts.delete(ruleId);
            this.emit('alertResolved', alert);

            this.logger.info('Alert resolved', {
                alertId: alert.id,
                ruleName: alert.ruleName,
                duration: new Date(alert.resolvedAt).getTime() - new Date(alert.timestamp).getTime(),
            });
        }
    }

    /**
     * Execute alert actions
     */
    private executeAlertActions(rule: AlertRule, alert: Alert): void {
        for (const action of rule.actions) {
            try {
                switch (action) {
                    case 'log':
                        this.logger.warn('Alert action: log', {
                            alertId: alert.id,
                            ruleName: rule.name,
                            message: alert.message,
                        });
                        break;
                    case 'notify':
                        this.emit('alertNotification', { rule, alert });
                        break;
                    default:
                        this.logger.warn('Unknown alert action', { action, alertId: alert.id });
                }
            } catch (error) {
                this.logger.error('Failed to execute alert action', {
                    action,
                    alertId: alert.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    /**
     * Register health check
     */
    registerHealthCheck(component: string, healthCheck: () => Promise<HealthCheckResult>): void {
        this.healthChecks.set(component, healthCheck);
        this.logger.debug('Health check registered', { component });
    }

    /**
     * Unregister health check
     */
    unregisterHealthCheck(component: string): void {
        this.healthChecks.delete(component);
        this.logger.debug('Health check unregistered', { component });
    }

    /**
     * Add alert rule
     */
    addAlertRule(rule: AlertRule): void {
        this.alertRules.set(rule.id, rule);
        this.logger.debug('Alert rule added', { ruleId: rule.id, ruleName: rule.name });
    }

    /**
     * Remove alert rule
     */
    removeAlertRule(ruleId: string): void {
        this.alertRules.delete(ruleId);
        this.resolveAlert(ruleId); // Resolve any active alerts for this rule
        this.logger.debug('Alert rule removed', { ruleId });
    }

    /**
     * Update agent metrics
     */
    updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
        const existing = this.agentMetrics.get(agentId) || {
            agentId,
            agentType: 'unknown',
            metrics: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                lastRequestTime: null,
                errorRate: 0,
                uptime: 0,
            },
            performance: {
                averageProcessingTime: 0,
                maxProcessingTime: 0,
                minProcessingTime: 0,
                totalProcessingTime: 0,
            },
            resources: {
                memoryUsage: 0,
                cpuUsage: 0,
            },
        };

        this.agentMetrics.set(agentId, { ...existing, ...metrics });
    }

    /**
     * Update tool metrics
     */
    updateToolMetrics(toolName: string, metrics: Partial<ToolMetrics>): void {
        const existing = this.toolMetrics.get(toolName) || {
            toolName,
            toolCategory: 'unknown',
            metrics: {
                totalCalls: 0,
                successfulCalls: 0,
                failedCalls: 0,
                averageResponseTime: 0,
                lastCallTime: null,
                errorRate: 0,
                retryCount: 0,
            },
            performance: {
                averageExecutionTime: 0,
                maxExecutionTime: 0,
                minExecutionTime: 0,
                totalExecutionTime: 0,
            },
            errors: {
                connectionErrors: 0,
                timeoutErrors: 0,
                validationErrors: 0,
                otherErrors: 0,
            },
        };

        this.toolMetrics.set(toolName, { ...existing, ...metrics });
    }

    /**
     * Update conversation metrics
     */
    updateConversationMetrics(metrics: Partial<ConversationMetrics>): void {
        this.conversationMetrics = { ...this.conversationMetrics, ...metrics };
    }

    /**
     * Get system metrics
     */
    getSystemMetrics(limit?: number): SystemMetrics[] {
        if (limit) {
            return this.systemMetrics.slice(-limit);
        }
        return [...this.systemMetrics];
    }

    /**
     * Get agent metrics
     */
    getAgentMetrics(agentId?: string): AgentMetrics | AgentMetrics[] | null {
        if (agentId) {
            return this.agentMetrics.get(agentId) || null;
        }
        return Array.from(this.agentMetrics.values());
    }

    /**
     * Get tool metrics
     */
    getToolMetrics(toolName?: string): ToolMetrics | ToolMetrics[] | null {
        if (toolName) {
            return this.toolMetrics.get(toolName) || null;
        }
        return Array.from(this.toolMetrics.values());
    }

    /**
     * Get conversation metrics
     */
    getConversationMetrics(): ConversationMetrics {
        return { ...this.conversationMetrics };
    }

    /**
     * Get current health status
     */
    getHealthStatus(): SystemHealth | null {
        return this.lastHealthCheck ? { ...this.lastHealthCheck } : null;
    }

    /**
     * Get active alerts
     */
    getActiveAlerts(): Alert[] {
        return Array.from(this.activeAlerts.values());
    }

    /**
     * Get alert history
     */
    getAlertHistory(limit?: number): Alert[] {
        if (limit) {
            return this.alertHistory.slice(-limit);
        }
        return [...this.alertHistory];
    }

    /**
     * Get alert rules
     */
    getAlertRules(): AlertRule[] {
        return Array.from(this.alertRules.values());
    }

    /**
     * Get monitoring statistics
     */
    getMonitoringStats(): {
        isRunning: boolean;
        uptime: number;
        metricsCollected: number;
        healthChecksRegistered: number;
        alertRulesActive: number;
        activeAlerts: number;
        totalAlerts: number;
    } {
        return {
            isRunning: this.isRunning,
            uptime: process.uptime(),
            metricsCollected: this.systemMetrics.length,
            healthChecksRegistered: this.healthChecks.size,
            alertRulesActive: Array.from(this.alertRules.values()).filter(r => r.enabled).length,
            activeAlerts: this.activeAlerts.size,
            totalAlerts: this.alertHistory.length,
        };
    }

    /**
     * Clear metrics history
     */
    clearMetricsHistory(): void {
        this.systemMetrics = [];
        this.agentMetrics.clear();
        this.toolMetrics.clear();
        this.conversationMetrics = {
            totalConversations: 0,
            activeConversations: 0,
            averageConversationLength: 0,
            totalMessages: 0,
            averageResponseTime: 0,
            clarificationRate: 0,
            languageDistribution: {},
            intentDistribution: {},
            agentRoutingDistribution: {},
        };

        this.logger.info('Metrics history cleared');
    }

    /**
     * Clear alert history
     */
    clearAlertHistory(): void {
        this.alertHistory = [];
        this.logger.info('Alert history cleared');
    }

    /**
     * Shutdown monitor
     */
    async shutdown(): Promise<void> {
        this.stop();
        this.healthChecks.clear();
        this.alertRules.clear();
        this.activeAlerts.clear();
        this.removeAllListeners();

        this.logger.info('SystemMonitor shutdown completed');
    }
}
