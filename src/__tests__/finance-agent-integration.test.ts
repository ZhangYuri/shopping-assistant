/**
 * Integration test for FinanceAgent - basic functionality verification
 */

describe('FinanceAgent Integration', () => {
    it('should be able to import FinanceAgent without errors', () => {
        expect(() => {
            const { FinanceAgent } = require('../agents/FinanceAgent');
            expect(FinanceAgent).toBeDefined();
            expect(typeof FinanceAgent).toBe('function');
        }).not.toThrow();
    });

    it('should be able to create FinanceAgent tools', () => {
        expect(() => {
            const { FinanceAgent } = require('../agents/FinanceAgent');
            const tools = FinanceAgent.createFinanceTools();
            expect(tools).toBeDefined();
            expect(tools.databaseTools).toBeDefined();
            expect(tools.notificationTools).toBeDefined();
            expect(Array.isArray(tools.databaseTools)).toBe(true);
            expect(Array.isArray(tools.notificationTools)).toBe(true);
        }).not.toThrow();
    });

    it('should have the expected financial analysis tools', () => {
        const { FinanceAgent } = require('../agents/FinanceAgent');
        const tools = FinanceAgent.createFinanceTools();

        const toolNames = tools.databaseTools.map((tool: any) => tool.name);
        expect(toolNames).toContain('get_spending_analysis');
        expect(toolNames).toContain('generate_financial_report');
        expect(toolNames).toContain('detect_anomalous_spending');
        expect(toolNames).toContain('get_budget_status');
        expect(toolNames).toContain('analyze_spending_trends');
    });

    it('should be able to create FinanceAgent instance with basic config', () => {
        expect(() => {
            const { FinanceAgent } = require('../agents/FinanceAgent');
            const tools = FinanceAgent.createFinanceTools();

            const agent = new FinanceAgent({
                agentId: 'test-finance-agent',
                name: 'TestFinanceAgent',
                description: 'Test finance agent',
                databaseTools: tools.databaseTools,
                notificationTools: tools.notificationTools,
            });

            expect(agent).toBeDefined();
            expect(agent.getBudgetLimits()).toBeDefined();
            expect(agent.getAnomalyThresholds()).toBeDefined();
        }).not.toThrow();
    });

    it('should have correct default budget limits', () => {
        const { FinanceAgent } = require('../agents/FinanceAgent');
        const tools = FinanceAgent.createFinanceTools();

        const agent = new FinanceAgent({
            agentId: 'test-finance-agent',
            name: 'TestFinanceAgent',
            description: 'Test finance agent',
            databaseTools: tools.databaseTools,
            notificationTools: tools.notificationTools,
        });

        const budgets = agent.getBudgetLimits();
        expect(budgets['食品']).toBe(2000);
        expect(budgets['日用品']).toBe(1000);
        expect(budgets['清洁用品']).toBe(500);
        expect(budgets['个人护理']).toBe(800);
        expect(budgets['其他']).toBe(1500);
    });

    it('should have correct default anomaly thresholds', () => {
        const { FinanceAgent } = require('../agents/FinanceAgent');
        const tools = FinanceAgent.createFinanceTools();

        const agent = new FinanceAgent({
            agentId: 'test-finance-agent',
            name: 'TestFinanceAgent',
            description: 'Test finance agent',
            databaseTools: tools.databaseTools,
            notificationTools: tools.notificationTools,
        });

        const thresholds = agent.getAnomalyThresholds();
        expect(thresholds.dailySpendingMultiplier).toBe(3.0);
        expect(thresholds.categorySpendingMultiplier).toBe(2.5);
        expect(thresholds.unusualItemThreshold).toBe(500);
    });

    it('should be able to update budget limits', () => {
        const { FinanceAgent } = require('../agents/FinanceAgent');
        const tools = FinanceAgent.createFinanceTools();

        const agent = new FinanceAgent({
            agentId: 'test-finance-agent',
            name: 'TestFinanceAgent',
            description: 'Test finance agent',
            databaseTools: tools.databaseTools,
            notificationTools: tools.notificationTools,
        });

        const newBudgets = { '食品': 2500, '娱乐': 1200 };
        agent.updateBudgetLimits(newBudgets);

        const updatedBudgets = agent.getBudgetLimits();
        expect(updatedBudgets['食品']).toBe(2500);
        expect(updatedBudgets['娱乐']).toBe(1200);
        expect(updatedBudgets['日用品']).toBe(1000); // Should preserve existing
    });

    it('should be able to update anomaly thresholds', () => {
        const { FinanceAgent } = require('../agents/FinanceAgent');
        const tools = FinanceAgent.createFinanceTools();

        const agent = new FinanceAgent({
            agentId: 'test-finance-agent',
            name: 'TestFinanceAgent',
            description: 'Test finance agent',
            databaseTools: tools.databaseTools,
            notificationTools: tools.notificationTools,
        });

        const newThresholds = {
            dailySpendingMultiplier: 2.8,
            unusualItemThreshold: 600
        };
        agent.updateAnomalyThresholds(newThresholds);

        const updatedThresholds = agent.getAnomalyThresholds();
        expect(updatedThresholds.dailySpendingMultiplier).toBe(2.8);
        expect(updatedThresholds.unusualItemThreshold).toBe(600);
        expect(updatedThresholds.categorySpendingMultiplier).toBe(2.5); // Should preserve existing
    });
});
