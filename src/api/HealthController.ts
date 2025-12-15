/**
 * Health Check Controller
 * Provides comprehensive health check endpoints for system monitoring
 */

import { Request, Response } from 'express';
import { Logger } from '../utils/Logger';
import { SystemMonitor, SystemHealth, HealthCheckResult } from '../monitoring/SystemMonitor';
import { SystemConfigManager } from '../config/SystemConfig';

export interface HealthEndpointConfig {
    enableDetailedHealth: boolean;
    enableMetricsEndpoint: boolean;
    enableAlertsEndpoint: boolean;
    enableConfigEndpoint: boolean;
    authRequired: boolean;
}

/**
 * Health Check Controller for system monitoring endpoints
 */
export class HealthController {
    private logger: Logger;
    private systemMonitor: SystemMonitor;
    private configManager: SystemConfigManager;
    private config: HealthEndpointConfig;

    constructor(
        systemMonitor: SystemMonitor,
        configManager: SystemConfigManager,
        config: Partial<HealthEndpointConfig> = {}
    ) {
        this.systemMonitor = systemMonitor;
        this.configManager = configManager;

        this.config = {
            enableDetailedHealth: true,
            enableMetricsEndpoint: true,
            enableAlertsEndpoint: true,
            enableConfigEndpoint: false, // Disabled by default for security
            authRequired: false,
            ...config,
        };

        this.logger = new Logger({
            component: 'HealthController',
            level: 'info',
        });
    }

    /**
     * Basic health check endpoint
     * GET /health
     */
    async basicHealth(req: Request, res: Response): Promise<void> {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                pid: process.pid,
            };

            res.status(200).json(health);
        } catch (error) {
            this.logger.error('Basic health check failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Health check failed',
            });
        }
    }

    /**
     * Detailed health check endpoint
     * GET /health/detailed
     */
    async detailedHealth(req: Request, res: Response): Promise<void> {
        try {
            if (!this.config.enableDetailedHealth) {
                res.status(404).json({ error: 'Detailed health endpoint is disabled' });
                return;
            }

            const systemHealth = this.systemMonitor.getHealthStatus();
            const monitoringStats = this.systemMonitor.getMonitoringStats();
            const activeAlerts = this.systemMonitor.getActiveAlerts();

            const health = {
                status: systemHealth?.overall || 'unknown',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                system: {
                    pid: process.pid,
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    platform: process.platform,
                    nodeVersion: process.version,
                },
                monitoring: {
                    isRunning: monitoringStats.isRunning,
                    metricsCollected: monitoringStats.metricsCollected,
                    healthChecksRegistered: monitoringStats.healthChecksRegistered,
                    activeAlerts: monitoringStats.activeAlerts,
                },
                components: systemHealth?.components || [],
                alerts: activeAlerts.map(alert => ({
                    id: alert.id,
                    severity: alert.severity,
                    message: alert.message,
                    timestamp: alert.timestamp,
                })),
            };

            const statusCode = systemHealth?.overall === 'healthy' ? 200 :
                systemHealth?.overall === 'degraded' ? 200 : 503;

            res.status(statusCode).json(health);
        } catch (error) {
            this.logger.error('Detailed health check failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Detailed health check failed',
            });
        }
    }

    /**
     * Readiness check endpoint
     * GET /health/ready
     */
    async readinessCheck(req: Request, res: Response): Promise<void> {
        try {
            const systemHealth = this.systemMonitor.getHealthStatus();
            const isReady = systemHealth?.overall === 'healthy' || systemHealth?.overall === 'degraded';

            if (isReady) {
                res.status(200).json({
                    status: 'ready',
                    timestamp: new Date().toISOString(),
                    message: 'System is ready to accept requests',
                });
            } else {
                res.status(503).json({
                    status: 'not_ready',
                    timestamp: new Date().toISOString(),
                    message: 'System is not ready to accept requests',
                    reason: systemHealth?.overall || 'unknown',
                });
            }
        } catch (error) {
            this.logger.error('Readiness check failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                error: 'Readiness check failed',
            });
        }
    }

    /**
     * Liveness check endpoint
     * GET /health/live
     */
    async livenessCheck(req: Request, res: Response): Promise<void> {
        try {
            // Simple liveness check - if we can respond, we're alive
            res.status(200).json({
                status: 'alive',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                pid: process.pid,
            });
        } catch (error) {
            this.logger.error('Liveness check failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                status: 'dead',
                timestamp: new Date().toISOString(),
                error: 'Liveness check failed',
            });
        }
    }

    /**
     * System metrics endpoint
     * GET /health/metrics
     */
    async systemMetrics(req: Request, res: Response): Promise<void> {
        try {
            if (!this.config.enableMetricsEndpoint) {
                res.status(404).json({ error: 'Metrics endpoint is disabled' });
                return;
            }

            const limit = parseInt(req.query.limit as string) || 100;
            const systemMetrics = this.systemMonitor.getSystemMetrics(limit);
            const agentMetrics = this.systemMonitor.getAgentMetrics();
            const toolMetrics = this.systemMonitor.getToolMetrics();
            const conversationMetrics = this.systemMonitor.getConversationMetrics();

            const metrics = {
                timestamp: new Date().toISOString(),
                system: systemMetrics,
                agents: agentMetrics,
                tools: toolMetrics,
                conversations: conversationMetrics,
                summary: {
                    totalSystemMetrics: systemMetrics.length,
                    totalAgents: Array.isArray(agentMetrics) ? agentMetrics.length : 0,
                    totalTools: Array.isArray(toolMetrics) ? toolMetrics.length : 0,
                },
            };

            res.status(200).json(metrics);
        } catch (error) {
            this.logger.error('System metrics request failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                error: 'Failed to retrieve system metrics',
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Alerts endpoint
     * GET /health/alerts
     */
    async systemAlerts(req: Request, res: Response): Promise<void> {
        try {
            if (!this.config.enableAlertsEndpoint) {
                res.status(404).json({ error: 'Alerts endpoint is disabled' });
                return;
            }

            const includeHistory = req.query.history === 'true';
            const limit = parseInt(req.query.limit as string) || 100;

            const activeAlerts = this.systemMonitor.getActiveAlerts();
            const alertRules = this.systemMonitor.getAlertRules();

            const response: any = {
                timestamp: new Date().toISOString(),
                active: activeAlerts,
                rules: alertRules.map(rule => ({
                    id: rule.id,
                    name: rule.name,
                    description: rule.description,
                    enabled: rule.enabled,
                    severity: rule.severity,
                    metric: rule.metric,
                    condition: rule.condition,
                    threshold: rule.threshold,
                })),
                summary: {
                    totalActiveAlerts: activeAlerts.length,
                    totalRules: alertRules.length,
                    enabledRules: alertRules.filter(r => r.enabled).length,
                    alertsBySeverity: {
                        critical: activeAlerts.filter(a => a.severity === 'critical').length,
                        high: activeAlerts.filter(a => a.severity === 'high').length,
                        medium: activeAlerts.filter(a => a.severity === 'medium').length,
                        low: activeAlerts.filter(a => a.severity === 'low').length,
                    },
                },
            };

            if (includeHistory) {
                response.history = this.systemMonitor.getAlertHistory(limit);
                response.summary.totalHistoricalAlerts = response.history.length;
            }

            res.status(200).json(response);
        } catch (error) {
            this.logger.error('System alerts request failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                error: 'Failed to retrieve system alerts',
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Configuration endpoint
     * GET /health/config
     */
    async systemConfig(req: Request, res: Response): Promise<void> {
        try {
            if (!this.config.enableConfigEndpoint) {
                res.status(404).json({ error: 'Configuration endpoint is disabled' });
                return;
            }

            const configSummary = this.configManager.getConfigurationSummary();

            res.status(200).json({
                timestamp: new Date().toISOString(),
                configuration: configSummary,
            });
        } catch (error) {
            this.logger.error('System configuration request failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                error: 'Failed to retrieve system configuration',
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Component health check endpoint
     * GET /health/component/:component
     */
    async componentHealth(req: Request, res: Response): Promise<void> {
        try {
            const { component } = req.params;
            const systemHealth = this.systemMonitor.getHealthStatus();

            if (!systemHealth) {
                res.status(503).json({
                    error: 'System health information not available',
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            const componentHealth = systemHealth.components.find(c => c.component === component);

            if (!componentHealth) {
                res.status(404).json({
                    error: `Component '${component}' not found`,
                    timestamp: new Date().toISOString(),
                    availableComponents: systemHealth.components.map(c => c.component),
                });
                return;
            }

            const statusCode = componentHealth.status === 'healthy' ? 200 :
                componentHealth.status === 'degraded' ? 200 : 503;

            res.status(statusCode).json({
                timestamp: new Date().toISOString(),
                component: componentHealth,
            });
        } catch (error) {
            this.logger.error('Component health check failed', {
                component: req.params.component,
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                error: 'Component health check failed',
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Performance metrics endpoint
     * GET /health/performance
     */
    async performanceMetrics(req: Request, res: Response): Promise<void> {
        try {
            const systemMetrics = this.systemMonitor.getSystemMetrics(1); // Get latest
            const agentMetrics = this.systemMonitor.getAgentMetrics();
            const toolMetrics = this.systemMonitor.getToolMetrics();

            const latest = systemMetrics[0];

            const performance = {
                timestamp: new Date().toISOString(),
                system: latest ? {
                    memory: latest.memory,
                    cpu: latest.cpu,
                    eventLoop: latest.eventLoop,
                    gc: latest.gc,
                } : null,
                agents: Array.isArray(agentMetrics) ? agentMetrics.map(agent => ({
                    agentId: agent.agentId,
                    agentType: agent.agentType,
                    averageResponseTime: agent.metrics.averageResponseTime,
                    errorRate: agent.metrics.errorRate,
                    performance: agent.performance,
                })) : [],
                tools: Array.isArray(toolMetrics) ? toolMetrics.map(tool => ({
                    toolName: tool.toolName,
                    toolCategory: tool.toolCategory,
                    averageResponseTime: tool.metrics.averageResponseTime,
                    errorRate: tool.metrics.errorRate,
                    performance: tool.performance,
                })) : [],
            };

            res.status(200).json(performance);
        } catch (error) {
            this.logger.error('Performance metrics request failed', {
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                error: 'Failed to retrieve performance metrics',
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Get controller configuration
     */
    getConfig(): HealthEndpointConfig {
        return { ...this.config };
    }

    /**
     * Update controller configuration
     */
    updateConfig(updates: Partial<HealthEndpointConfig>): void {
        this.config = { ...this.config, ...updates };
        this.logger.info('Health controller configuration updated', {
            updates: Object.keys(updates),
        });
    }
}
