/**
 * Tests for the FinanceAgent implementation
 */

import { FinanceAgent } from '../agents/FinanceAgent';
import { ChatDeepSeek } from '@langchain/deepseek';

// Mock the ChatDeepSeek to avoid API calls in tests
jest.mock('@langchain/deepseek', () => ({
    ChatDeepSeek: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
            content: '模拟的财务智能体回复：分析已完成',
        }),
        stream: jest.fn().mockImplementation(async function* () {
            yield { content: '模拟' };
            yield { content: '财务' };
            yield { content: '分析' };
        }),
    })),
}));

// Mock createReactAgent to avoid LangGraph initialization
jest.mock('@langchain/langgraph/prebuilt', () => ({
    createReactAgent: jest.fn().mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
            messages: [
                {
                    content: '模拟的财务智能体回复：分析已完成',
                    role: 'assistant',
                },
            ],
        }),
        stream: jest.fn().mockImplementation(async function* () {
            yield {
                messages: [{ content: '模拟财务分析回复' }],
            };
        }),
    })),
}));

// Mock MemorySaver
jest.mock('@langchain/langgraph', () => ({
    MemorySaver: jest.fn().mockImplementation(() => ({})),
}));

describe('FinanceAgent', () => {
    let financeAgent: FinanceAgent;

    beforeEach(() => {
        // Create mock tools
        const { databaseTools, notificationTools } = FinanceAgent.createFinanceTools();

        // Initialize agent with test configuration
        financeAgent = new FinanceAgent({
            agentId: 'test-finance-agent',
            name: 'TestFinanceAgent',
            description: 'Test finance agent for unit testing',
            databaseTools,
            notificationTools,
            budgetLimits: {
                '食品': 2000,
                '日用品': 1000,
                '清洁用品': 500,
            },
            anomalyThresholds: {
                dailySpendingMultiplier: 3.0,
                categorySpendingMultiplier: 2.5,
                unusualItemThreshold: 500
            },
            // Use mocked model for testing
            model: new ChatDeepSeek({
                apiKey: 'mock-key',
                model: 'deepseek-chat',
            }),
        });
    });

    describe('Initialization', () => {
        it('should initialize successfully', async () => {
            await expect(financeAgent.initialize()).resolves.not.toThrow();
        });

        it('should have correct configuration', () => {
            const config = financeAgent.getConfig();
            expect(config.agentId).toBe('test-finance-agent');
            expect(config.name).toBe('TestFinanceAgent');
            expect(config.tools.length).toBeGreaterThan(0);
        });

        it('should have budget limits set', () => {
            const budgets = financeAgent.getBudgetLimits();
            expect(budgets['食品']).toBe(2000);
            expect(budgets['日用品']).toBe(1000);
            expect(budgets['清洁用品']).toBe(500);
        });

        it('should have anomaly thresholds set', () => {
            const thresholds = financeAgent.getAnomalyThresholds();
            expect(thresholds.dailySpendingMultiplier).toBe(3.0);
            expect(thresholds.categorySpendingMultiplier).toBe(2.5);
            expect(thresholds.unusualItemThreshold).toBe(500);
        });
    });

    describe('Tool Management', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should have required financial analysis tools', () => {
            const tools = financeAgent.getAvailableTools();
            expect(tools).toContain('get_spending_analysis');
            expect(tools).toContain('generate_financial_report');
            expect(tools).toContain('detect_anomalous_spending');
            expect(tools).toContain('get_budget_status');
            expect(tools).toContain('analyze_spending_trends');
        });

        it('should have notification tools', () => {
            const tools = financeAgent.getAvailableTools();
            expect(tools).toContain('send_notification');
            expect(tools).toContain('send_financial_report');
        });

        it('should provide tool descriptions', () => {
            const description = financeAgent.getToolDescription('get_spending_analysis');
            expect(description).toBeDefined();
            expect(description).toContain('支出分析');
        });
    });

    describe('Financial Analysis Operations', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should generate monthly reports', async () => {
            const result = await financeAgent.generateMonthlyReport('2024-12');

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
            expect(result.messages.length).toBeGreaterThan(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should detect anomalous spending', async () => {
            const result = await financeAgent.detectAnomalousSpending();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('should categorize expenses', async () => {
            const orderIds = ['order1', 'order2', 'order3'];
            const result = await financeAgent.categorizeExpenses(orderIds);

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should track budget status', async () => {
            const result = await financeAgent.trackBudgetStatus();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate quarterly analysis', async () => {
            const result = await financeAgent.generateQuarterlyAnalysis();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Advanced Analysis Operations', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should perform advanced anomaly detection', async () => {
            const result = await financeAgent.performAdvancedAnomalyDetection({
                analysisDepthDays: 60,
                dailyThresholdMultiplier: 2.5,
                categoryThresholdMultiplier: 2.0,
                unusualItemThreshold: 300
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should analyze spending by category', async () => {
            const result = await financeAgent.analyzeSpendingByCategory({
                startDate: '2024-11-01',
                endDate: '2024-11-30',
                categories: ['食品', '日用品'],
                includeComparison: true
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should analyze spending trends', async () => {
            const result = await financeAgent.analyzeSpendingTrends({
                timeRange: 'quarter',
                granularity: 'monthly',
                categories: ['食品']
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should monitor spending patterns', async () => {
            const result = await financeAgent.monitorSpendingPatterns({
                monitoringPeriodDays: 14,
                alertThresholds: {
                    dailySpendingIncrease: 40,
                    categorySpendingIncrease: 25,
                    newHighValueItems: 150
                }
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate risk assessment', async () => {
            const result = await financeAgent.generateRiskAssessment({
                assessmentPeriodDays: 90,
                riskFactors: ['spending_volatility', 'budget_overrun'],
                includePredictiveAnalysis: true
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Automated Reporting', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should generate automated monthly reports', async () => {
            const result = await financeAgent.generateAutomatedMonthlyReport({
                month: '2024-12',
                includeComparison: true,
                includeBudgetAnalysis: true,
                includeAnomalyDetection: true,
                notificationChannels: ['teams']
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate automated quarterly reports', async () => {
            const result = await financeAgent.generateAutomatedQuarterlyReport({
                quarter: 'Q4',
                year: 2024,
                includeYearOverYearComparison: true,
                includeTrendAnalysis: true,
                includeForecast: true
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate weekly summaries', async () => {
            const result = await financeAgent.generateWeeklySummary({
                weekStartDate: '2024-12-09',
                includeComparison: true,
                includeAlerts: true
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should generate custom reports', async () => {
            const result = await financeAgent.generateCustomReport({
                reportTitle: '测试自定义报告',
                dateRange: {
                    startDate: '2024-11-01',
                    endDate: '2024-11-30'
                },
                analysisTypes: ['spending_analysis', 'budget_status', 'trend_analysis'],
                categories: ['食品', '日用品'],
                outputFormat: 'detailed'
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Alert and Notification Management', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should setup spending alerts', async () => {
            const result = await financeAgent.setupSpendingAlerts({
                alertTypes: ['daily_limit', 'category_limit', 'unusual_item'],
                thresholds: {
                    dailyLimit: 500,
                    categoryLimits: { '食品': 200, '日用品': 150 },
                    unusualItemThreshold: 300
                },
                notificationChannels: ['teams']
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should send financial alerts', async () => {
            const result = await financeAgent.sendFinancialAlert({
                alertType: 'budget_exceeded',
                alertData: {
                    title: '预算超支预警',
                    message: '食品类别本月支出已超过预算',
                    severity: 'high',
                    category: '食品',
                    amount: 2200,
                    threshold: 2000,
                    recommendations: ['减少外出就餐', '制定详细购物清单']
                },
                notificationChannels: ['teams']
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });

        it('should schedule automated reports', async () => {
            const result = await financeAgent.scheduleAutomatedReports({
                reportTypes: ['monthly', 'quarterly', 'weekly_summary'],
                scheduleConfig: {
                    monthlyDay: 1,
                    quarterlyMonth: 1,
                    weeklyDay: 1
                },
                reportOptions: {
                    includeComparison: true,
                    includeBudgetAnalysis: true,
                    includeAnomalyDetection: true
                }
            });

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Configuration Management', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should update budget limits', () => {
            const newBudgets = { '食品': 2500, '个人护理': 800 };
            financeAgent.updateBudgetLimits(newBudgets);

            const updatedBudgets = financeAgent.getBudgetLimits();
            expect(updatedBudgets['食品']).toBe(2500);
            expect(updatedBudgets['个人护理']).toBe(800);
            expect(updatedBudgets['日用品']).toBe(1000); // Original value preserved
        });

        it('should update anomaly thresholds', () => {
            const newThresholds = {
                dailySpendingMultiplier: 2.8,
                unusualItemThreshold: 600
            };
            financeAgent.updateAnomalyThresholds(newThresholds);

            const updatedThresholds = financeAgent.getAnomalyThresholds();
            expect(updatedThresholds.dailySpendingMultiplier).toBe(2.8);
            expect(updatedThresholds.unusualItemThreshold).toBe(600);
            expect(updatedThresholds.categorySpendingMultiplier).toBe(2.5); // Original value preserved
        });
    });

    describe('Comprehensive Financial Health', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should generate financial health report', async () => {
            const result = await financeAgent.generateFinancialHealthReport();

            expect(result.success).toBe(true);
            expect(result.messages).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should handle empty month parameter gracefully', async () => {
            const result = await financeAgent.generateMonthlyReport('');

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
        });

        it('should handle invalid date ranges', async () => {
            const result = await financeAgent.analyzeSpendingByCategory({
                startDate: 'invalid-date',
                endDate: '2024-12-31'
            });

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();
        });
    });

    describe('Streaming Responses', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should support streaming responses', async () => {
            const stream = await financeAgent.stream('生成财务分析报告');

            expect(stream).toBeDefined();
            expect(typeof stream[Symbol.asyncIterator]).toBe('function');
        });
    });

    describe('Metrics and Monitoring', () => {
        beforeEach(async () => {
            await financeAgent.initialize();
        });

        it('should track metrics', async () => {
            const initialMetrics = financeAgent.getMetrics();
            expect(initialMetrics.tasksCompleted).toBe(0);
            expect(initialMetrics.tasksFailedCount).toBe(0);

            // Process a financial analysis to update metrics
            await financeAgent.generateMonthlyReport('2024-12');

            const updatedMetrics = financeAgent.getMetrics();
            expect(updatedMetrics.tasksCompleted).toBe(1);
            expect(updatedMetrics.averageResponseTime).toBeGreaterThanOrEqual(0);
        });

        it('should update last active time', async () => {
            const initialMetrics = financeAgent.getMetrics();
            const initialTime = initialMetrics.lastActiveTime;

            // Wait a bit and process a command
            await new Promise(resolve => setTimeout(resolve, 10));
            await financeAgent.detectAnomalousSpending();

            const updatedMetrics = financeAgent.getMetrics();
            expect(updatedMetrics.lastActiveTime.getTime()).toBeGreaterThan(initialTime.getTime());
        });
    });
});
