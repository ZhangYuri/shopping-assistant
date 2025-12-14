/**
 * Finance Agent - Handles financial analysis and expense management using LangChain
 * Uses LangChain's createReactAgent with specialized financial analysis tools
 */

import { BaseAgent, BaseAgentConfig } from './base/BaseAgent';
import { DynamicTool } from '@langchain/core/tools';

// Finance-specific interfaces
interface FinanceAgentConfig extends Omit<BaseAgentConfig, 'tools'> {
    databaseTools: DynamicTool[];
    notificationTools?: DynamicTool[];
    budgetLimits?: Record<string, number>;
    anomalyThresholds?: {
        dailySpendingMultiplier: number;
        categorySpendingMultiplier: number;
        unusualItemThreshold: number;
    };
}

export class FinanceAgent extends BaseAgent {
    private budgetLimits: Map<string, number> = new Map();
    private anomalyThresholds = {
        dailySpendingMultiplier: 3.0,
        categorySpendingMultiplier: 2.5,
        unusualItemThreshold: 500
    };

    constructor(config: FinanceAgentConfig) {
        // Combine all tools for the base agent
        const allTools = [
            ...config.databaseTools,
            ...(config.notificationTools || []),
        ];

        super({
            ...config,
            tools: allTools,
            systemPrompt: config.systemPrompt || undefined, // Will use getDefaultSystemPrompt if not provided
        });

        // Set budget limits
        const budgets = config.budgetLimits || {
            '食品': 2000,
            '日用品': 1000,
            '清洁用品': 500,
            '个人护理': 800,
            '其他': 1500
        };

        for (const [category, limit] of Object.entries(budgets)) {
            this.budgetLimits.set(category, limit);
        }

        // Set anomaly detection thresholds
        if (config.anomalyThresholds) {
            this.anomalyThresholds = { ...this.anomalyThresholds, ...config.anomalyThresholds };
        }
    }

    protected getDefaultSystemPrompt(): string {
        return `你是一个专业的财务管理智能体，负责分析家庭支出和财务健康状况。你的主要职责包括：

1. **支出分析和分类**：
   - 自动分析和分类家庭支出项目
   - 生成按类别、时间、平台的支出统计
   - 识别支出趋势和模式
   - 提供支出优化建议

2. **财务报告生成**：
   - 生成月度和季度财务报告
   - 提供预算执行情况分析
   - 显示支出类别分布和趋势
   - 计算关键财务指标和比率

3. **异常消费检测**：
   - 基于历史数据建立消费基线
   - 检测超出正常范围的支出
   - 识别异常消费模式和行为
   - 发送异常消费预警和建议

4. **预算管理和监控**：
   - 监控各类别的预算执行情况
   - 预测月度和季度支出趋势
   - 提供预算调整建议
   - 生成预算超支预警

5. **财务洞察和建议**：
   - 分析消费习惯和偏好
   - 识别节约机会和优化空间
   - 提供个性化的财务建议
   - 生成成本效益分析报告

**分析原则**：
- 基于真实的历史购买数据进行分析
- 考虑季节性和周期性消费模式
- 提供具体的数据支撑和可行的建议
- 保护用户隐私，确保数据安全

**交互原则**：
- 始终使用友好、专业的中文回复
- 提供清晰的数据可视化和图表说明
- 对于复杂的财务概念，提供简单易懂的解释
- 在发现异常时给出明确的原因分析和建议
- 对于预算超支，提供具体的控制措施

**可用工具**：
- 数据库工具：查询订单历史、分析支出数据、生成财务报告
- 通知工具：发送财务报告、异常消费预警、预算提醒

请根据用户的自然语言输入，智能选择合适的工具来完成财务分析任务。`;
    }

    protected async onInitialize(): Promise<void> {
        this.logger.info('Initializing Finance Agent with LangChain', {
            toolCount: this.tools.length,
            budgetLimits: Object.fromEntries(this.budgetLimits),
            anomalyThresholds: this.anomalyThresholds,
        });

        // Verify essential tools are available
        const requiredTools = [
            'get_spending_analysis',
            'generate_financial_report',
            'detect_anomalous_spending',
            'get_budget_status',
            'analyze_spending_trends'
        ];
        const availableTools = this.getAvailableTools();

        for (const requiredTool of requiredTools) {
            if (!availableTools.includes(requiredTool)) {
                throw new Error(`Required tool not available: ${requiredTool}`);
            }
        }

        this.logger.info('Finance Agent initialized successfully');
    }

    /**
     * Generate monthly financial report
     */
    async generateMonthlyReport(month: string, threadId?: string): Promise<any> {
        const input = `请生成${month}的月度财务报告。

        报告要求：
        1. 总支出统计和同比分析
        2. 各类别支出分布和排名
        3. 主要支出项目分析
        4. 预算执行情况评估
        5. 异常消费检测和分析
        6. 节约建议和优化方案

        请使用 generate_financial_report 工具生成详细报告。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Detect anomalous spending patterns
     */
    async detectAnomalousSpending(threadId?: string): Promise<any> {
        const thresholdInfo = `
        异常检测参数：
        - 日支出异常倍数：${this.anomalyThresholds.dailySpendingMultiplier}
        - 类别支出异常倍数：${this.anomalyThresholds.categorySpendingMultiplier}
        - 单项异常金额阈值：${this.anomalyThresholds.unusualItemThreshold}元
        `;

        const input = `请检测最近的异常消费行为。${thresholdInfo}

        检测要求：
        1. 分析最近30天的消费数据
        2. 识别超出正常范围的支出
        3. 检测异常的消费模式和频率
        4. 分析可能的异常原因
        5. 提供风险评估和控制建议

        请使用 detect_anomalous_spending 工具进行分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Perform comprehensive anomaly detection with custom parameters
     */
    async performAdvancedAnomalyDetection(options: {
        analysisDepthDays?: number;
        dailyThresholdMultiplier?: number;
        categoryThresholdMultiplier?: number;
        unusualItemThreshold?: number;
        includeFrequencyAnalysis?: boolean;
        includeBudgetComparison?: boolean;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            analysisDepthDays = 30,
            dailyThresholdMultiplier = this.anomalyThresholds.dailySpendingMultiplier,
            categoryThresholdMultiplier = this.anomalyThresholds.categorySpendingMultiplier,
            unusualItemThreshold = this.anomalyThresholds.unusualItemThreshold,
            includeFrequencyAnalysis = true,
            includeBudgetComparison = true,
            threadId
        } = options;

        const input = `请进行高级异常消费检测分析。

        检测参数：
        - 分析深度：${analysisDepthDays}天
        - 日支出异常倍数：${dailyThresholdMultiplier}
        - 类别支出异常倍数：${categoryThresholdMultiplier}
        - 单项异常金额阈值：${unusualItemThreshold}元
        - 包含频率分析：${includeFrequencyAnalysis ? '是' : '否'}
        - 包含预算对比：${includeBudgetComparison ? '是' : '否'}

        高级检测要求：
        1. 多维度异常检测（金额、频率、类别、时间）
        2. 异常严重程度分级和风险评估
        3. 异常模式识别和趋势分析
        4. 与历史基线和预算的对比分析
        5. 个性化的异常阈值调整建议
        6. 详细的异常原因分析和控制措施

        请使用 detect_anomalous_spending 工具，参数设置为：
        {
            "analysisDepthDays": ${analysisDepthDays},
            "dailyThresholdMultiplier": ${dailyThresholdMultiplier},
            "categoryThresholdMultiplier": ${categoryThresholdMultiplier},
            "unusualItemThreshold": ${unusualItemThreshold}
        }`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Monitor spending patterns and generate alerts
     */
    async monitorSpendingPatterns(options: {
        monitoringPeriodDays?: number;
        alertThresholds?: {
            dailySpendingIncrease: number;
            categorySpendingIncrease: number;
            newHighValueItems: number;
        };
        categories?: string[];
        threadId?: string;
    } = {}): Promise<any> {
        const {
            monitoringPeriodDays = 7,
            alertThresholds = {
                dailySpendingIncrease: 50, // 50% increase
                categorySpendingIncrease: 30, // 30% increase
                newHighValueItems: 200 // Items over 200 yuan
            },
            categories,
            threadId
        } = options;

        const categoryInfo = categories ? `，重点监控以下类别：${categories.join('、')}` : '';

        const input = `请监控最近${monitoringPeriodDays}天的消费模式变化${categoryInfo}。

        监控参数：
        - 监控周期：${monitoringPeriodDays}天
        - 日支出增长警戒线：${alertThresholds.dailySpendingIncrease}%
        - 类别支出增长警戒线：${alertThresholds.categorySpendingIncrease}%
        - 高价值物品阈值：${alertThresholds.newHighValueItems}元

        监控要求：
        1. 对比最近${monitoringPeriodDays}天与前${monitoringPeriodDays}天的消费模式
        2. 识别显著的消费行为变化
        3. 检测新出现的高价值消费项目
        4. 分析消费频率和时间模式的变化
        5. 生成预警信号和风险等级评估
        6. 提供针对性的监控建议和控制措施

        请综合使用 detect_anomalous_spending 和 analyze_spending_trends 工具进行监控分析。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate spending risk assessment report
     */
    async generateRiskAssessment(options: {
        assessmentPeriodDays?: number;
        riskFactors?: string[];
        includePredictiveAnalysis?: boolean;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            assessmentPeriodDays = 60,
            riskFactors = ['spending_volatility', 'budget_overrun', 'unusual_items', 'frequency_changes'],
            includePredictiveAnalysis = true,
            threadId
        } = options;

        const input = `请生成消费风险评估报告。

        评估参数：
        - 评估周期：${assessmentPeriodDays}天
        - 风险因子：${riskFactors.join('、')}
        - 包含预测分析：${includePredictiveAnalysis ? '是' : '否'}

        风险评估要求：
        1. 多维度风险因子分析和量化评分
        2. 消费行为稳定性和可预测性评估
        3. 预算执行风险和超支概率分析
        4. 异常消费频率和严重程度评估
        5. ${includePredictiveAnalysis ? '未来消费风险预测和趋势分析' : ''}
        6. 综合风险等级评定和控制建议
        7. 个性化的风险管理策略推荐

        请综合使用多个分析工具生成全面的风险评估报告。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Set up automated spending alerts
     */
    async setupSpendingAlerts(options: {
        alertTypes: ('daily_limit' | 'category_limit' | 'unusual_item' | 'frequency_spike')[];
        thresholds: {
            dailyLimit?: number;
            categoryLimits?: Record<string, number>;
            unusualItemThreshold?: number;
            frequencyMultiplier?: number;
        };
        notificationChannels?: string[];
        threadId?: string;
    }): Promise<any> {
        const {
            alertTypes,
            thresholds,
            notificationChannels = ['teams'],
            threadId
        } = options;

        const input = `请设置自动化消费预警系统。

        预警配置：
        - 预警类型：${alertTypes.join('、')}
        - 预警阈值：${JSON.stringify(thresholds, null, 2)}
        - 通知渠道：${notificationChannels.join('、')}

        预警系统要求：
        1. 实时监控消费行为和模式变化
        2. 基于设定阈值自动触发预警
        3. 分级预警机制（提醒、警告、严重）
        4. 智能预警去重和频率控制
        5. 多渠道通知发送和确认机制
        6. 预警效果跟踪和优化建议

        请配置相应的监控规则和通知机制。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Categorize expenses automatically
     */
    async categorizeExpenses(orderIds: string[], threadId?: string): Promise<any> {
        const input = `请对以下订单进行支出分类：${orderIds.join(', ')}

        分类要求：
        1. 根据商品名称和商店类型自动分类
        2. 统计各类别的支出金额和占比
        3. 识别主要支出类别和趋势
        4. 提供分类准确性评估

        请使用 get_spending_analysis 工具进行分类分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Track budget status and alerts
     */
    async trackBudgetStatus(threadId?: string): Promise<any> {
        const budgetInfo = Array.from(this.budgetLimits.entries())
            .map(([category, limit]) => `${category}: ${limit}元`)
            .join(', ');

        const input = `请检查当前的预算执行状况。

        预算设置：${budgetInfo}

        分析要求：
        1. 计算各类别的当月支出和预算使用率
        2. 识别预算超支或即将超支的类别
        3. 分析支出趋势和预算风险
        4. 提供预算调整和控制建议
        5. 生成预算执行报告

        请使用 get_budget_status 工具进行分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate quarterly financial analysis
     */
    async generateQuarterlyAnalysis(threadId?: string): Promise<any> {
        const input = `请生成本季度的财务分析报告。

        分析要求：
        1. 季度支出总览和趋势分析
        2. 月度支出对比和波动分析
        3. 类别支出变化和结构分析
        4. 消费习惯和模式识别
        5. 成本效益分析和优化建议
        6. 下季度预算建议

        请使用 analyze_spending_trends 工具进行深度分析。`;
        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate and send automated monthly financial report
     */
    async generateAutomatedMonthlyReport(options: {
        month?: string;
        includeComparison?: boolean;
        includeBudgetAnalysis?: boolean;
        includeAnomalyDetection?: boolean;
        notificationChannels?: string[];
        recipientId?: string;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            month,
            includeComparison = true,
            includeBudgetAnalysis = true,
            includeAnomalyDetection = true,
            notificationChannels = ['teams'],
            recipientId = 'default_user',
            threadId
        } = options;

        const reportMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM format

        const input = `请生成并发送${reportMonth}的自动化月度财务报告。

        报告配置：
        - 报告月份：${reportMonth}
        - 包含对比分析：${includeComparison ? '是' : '否'}
        - 包含预算分析：${includeBudgetAnalysis ? '是' : '否'}
        - 包含异常检测：${includeAnomalyDetection ? '是' : '否'}
        - 通知渠道：${notificationChannels.join('、')}
        - 接收者ID：${recipientId}

        自动化报告要求：
        1. 生成完整的月度财务报告
        2. ${includeComparison ? '包含同比和环比分析' : ''}
        3. ${includeBudgetAnalysis ? '包含预算执行情况分析' : ''}
        4. ${includeAnomalyDetection ? '包含异常消费检测结果' : ''}
        5. 格式化报告内容，适合通知渠道展示
        6. 自动发送到指定的通知渠道
        7. 记录报告生成和发送状态

        请先使用 generate_financial_report 工具生成报告，然后使用通知工具发送。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate and send automated quarterly financial report
     */
    async generateAutomatedQuarterlyReport(options: {
        quarter?: string;
        year?: number;
        includeYearOverYearComparison?: boolean;
        includeTrendAnalysis?: boolean;
        includeForecast?: boolean;
        notificationChannels?: string[];
        recipientId?: string;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            quarter,
            year,
            includeYearOverYearComparison = true,
            includeTrendAnalysis = true,
            includeForecast = true,
            notificationChannels = ['teams'],
            recipientId = 'default_user',
            threadId
        } = options;

        const currentDate = new Date();
        const reportYear = year || currentDate.getFullYear();
        const reportQuarter = quarter || `Q${Math.floor(currentDate.getMonth() / 3) + 1}`;

        const input = `请生成并发送${reportYear}年${reportQuarter}的自动化季度财务报告。

        报告配置：
        - 报告季度：${reportYear}年${reportQuarter}
        - 包含同比分析：${includeYearOverYearComparison ? '是' : '否'}
        - 包含趋势分析：${includeTrendAnalysis ? '是' : '否'}
        - 包含预测分析：${includeForecast ? '是' : '否'}
        - 通知渠道：${notificationChannels.join('、')}
        - 接收者ID：${recipientId}

        季度报告要求：
        1. 生成全面的季度财务分析报告
        2. ${includeYearOverYearComparison ? '包含年度对比和增长分析' : ''}
        3. ${includeTrendAnalysis ? '包含季度内趋势和模式分析' : ''}
        4. ${includeForecast ? '包含下季度预测和建议' : ''}
        5. 重点分析季度性消费特征和变化
        6. 提供战略性的财务管理建议
        7. 格式化为高级管理报告格式

        请综合使用多个分析工具生成深度季度报告，然后发送通知。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Schedule automated financial reports
     */
    async scheduleAutomatedReports(options: {
        reportTypes: ('monthly' | 'quarterly' | 'weekly_summary' | 'anomaly_alerts')[];
        scheduleConfig: {
            monthlyDay?: number; // Day of month (1-28)
            quarterlyMonth?: number; // Month of quarter (1-3)
            weeklyDay?: number; // Day of week (0-6, 0=Sunday)
            anomalyCheckHours?: number[]; // Hours to check for anomalies
        };
        reportOptions?: {
            includeComparison?: boolean;
            includeBudgetAnalysis?: boolean;
            includeAnomalyDetection?: boolean;
            includeTrendAnalysis?: boolean;
        };
        notificationChannels?: string[];
        recipientId?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            reportTypes,
            scheduleConfig,
            reportOptions = {
                includeComparison: true,
                includeBudgetAnalysis: true,
                includeAnomalyDetection: true,
                includeTrendAnalysis: true
            },
            notificationChannels = ['teams'],
            recipientId = 'default_user',
            threadId
        } = options;

        const input = `请配置自动化财务报告调度系统。

        调度配置：
        - 报告类型：${reportTypes.join('、')}
        - 调度参数：${JSON.stringify(scheduleConfig, null, 2)}
        - 报告选项：${JSON.stringify(reportOptions, null, 2)}
        - 通知渠道：${notificationChannels.join('、')}
        - 接收者ID：${recipientId}

        调度系统要求：
        1. 设置定时任务调度器
        2. 配置各类报告的生成时间和频率
        3. 实现报告生成失败的重试机制
        4. 提供报告调度状态监控
        5. 支持调度配置的动态更新
        6. 记录报告生成和发送历史
        7. 提供调度系统的健康检查

        注意：这是配置信息，实际的调度实现需要在系统层面配置定时任务。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate weekly financial summary
     */
    async generateWeeklySummary(options: {
        weekStartDate?: string;
        includeComparison?: boolean;
        includeAlerts?: boolean;
        notificationChannels?: string[];
        threadId?: string;
    } = {}): Promise<any> {
        const {
            weekStartDate,
            includeComparison = true,
            includeAlerts = true,
            notificationChannels = ['teams'],
            threadId
        } = options;

        // Calculate week dates if not provided
        const startDate = weekStartDate || (() => {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const mondayDate = new Date(now);
            mondayDate.setDate(now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
            return mondayDate.toISOString().split('T')[0];
        })();

        const endDate = (() => {
            const start = new Date(startDate);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return end.toISOString().split('T')[0];
        })();

        const input = `请生成${startDate}至${endDate}的周度财务摘要。

        摘要配置：
        - 周期：${startDate} 至 ${endDate}
        - 包含对比：${includeComparison ? '是' : '否'}
        - 包含预警：${includeAlerts ? '是' : '否'}
        - 通知渠道：${notificationChannels.join('、')}

        周度摘要要求：
        1. 本周支出总览和关键指标
        2. ${includeComparison ? '与上周和去年同期的对比分析' : ''}
        3. 本周主要支出项目和类别分析
        4. ${includeAlerts ? '本周异常消费和预警信息' : ''}
        5. 预算执行进度和剩余情况
        6. 下周消费建议和注意事项
        7. 简洁明了的摘要格式，适合快速阅读

        请使用相关分析工具生成周度摘要并发送通知。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate custom financial report with flexible parameters
     */
    async generateCustomReport(options: {
        reportTitle: string;
        dateRange: {
            startDate: string;
            endDate: string;
        };
        analysisTypes: ('spending_analysis' | 'budget_status' | 'anomaly_detection' | 'trend_analysis' | 'category_breakdown')[];
        categories?: string[];
        platforms?: string[];
        comparisonPeriod?: {
            startDate: string;
            endDate: string;
        };
        outputFormat?: 'summary' | 'detailed' | 'executive';
        notificationChannels?: string[];
        recipientId?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            reportTitle,
            dateRange,
            analysisTypes,
            categories,
            platforms,
            comparisonPeriod,
            outputFormat = 'detailed',
            notificationChannels = ['teams'],
            recipientId = 'default_user',
            threadId
        } = options;

        const categoryInfo = categories ? `，限制类别：${categories.join('、')}` : '';
        const platformInfo = platforms ? `，限制平台：${platforms.join('、')}` : '';
        const comparisonInfo = comparisonPeriod ?
            `，对比期间：${comparisonPeriod.startDate} 至 ${comparisonPeriod.endDate}` : '';

        const input = `请生成自定义财务报告："${reportTitle}"。

        报告配置：
        - 分析期间：${dateRange.startDate} 至 ${dateRange.endDate}
        - 分析类型：${analysisTypes.join('、')}
        - 输出格式：${outputFormat}${categoryInfo}${platformInfo}${comparisonInfo}
        - 通知渠道：${notificationChannels.join('、')}
        - 接收者ID：${recipientId}

        自定义报告要求：
        1. 根据指定的分析类型生成相应的分析内容
        2. 严格按照日期范围和筛选条件进行数据分析
        3. ${comparisonPeriod ? '包含与对比期间的详细对比分析' : ''}
        4. 根据输出格式调整报告的详细程度和结构
        5. 提供针对性的洞察和建议
        6. 格式化报告内容，确保可读性和专业性
        7. 自动发送到指定的通知渠道

        请根据分析类型使用相应的工具生成报告内容。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Send financial alert notifications
     */
    async sendFinancialAlert(options: {
        alertType: 'budget_exceeded' | 'anomaly_detected' | 'spending_spike' | 'custom';
        alertData: {
            title: string;
            message: string;
            severity: 'low' | 'medium' | 'high' | 'critical';
            category?: string;
            amount?: number;
            threshold?: number;
            recommendations?: string[];
        };
        notificationChannels?: string[];
        recipientId?: string;
        threadId?: string;
    }): Promise<any> {
        const {
            alertType,
            alertData,
            notificationChannels = ['teams'],
            recipientId = 'default_user',
            threadId
        } = options;

        const input = `请发送财务预警通知。

        预警信息：
        - 预警类型：${alertType}
        - 预警标题：${alertData.title}
        - 预警消息：${alertData.message}
        - 严重程度：${alertData.severity}
        - 相关类别：${alertData.category || '未指定'}
        - 涉及金额：${alertData.amount || '未指定'}元
        - 阈值：${alertData.threshold || '未指定'}元
        - 建议措施：${alertData.recommendations?.join('；') || '无'}
        - 通知渠道：${notificationChannels.join('、')}
        - 接收者ID：${recipientId}

        预警通知要求：
        1. 根据严重程度选择合适的通知优先级
        2. 格式化预警消息，突出关键信息
        3. 包含具体的数据和阈值对比
        4. 提供明确的行动建议和控制措施
        5. 确保通知的及时性和可操作性
        6. 记录预警发送状态和用户响应

        请使用 send_financial_report 通知工具发送预警。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Analyze spending by category with detailed breakdown
     */
    async analyzeSpendingByCategory(options: {
        startDate?: string;
        endDate?: string;
        categories?: string[];
        includeComparison?: boolean;
        threadId?: string;
    } = {}): Promise<any> {
        const {
            startDate,
            endDate,
            categories,
            includeComparison = true,
            threadId
        } = options;

        const dateRange = startDate && endDate ? `从 ${startDate} 到 ${endDate}` : '最近30天';
        const categoryInfo = categories ? `，重点分析以下类别：${categories.join('、')}` : '';

        const input = `请分析${dateRange}的类别支出情况${categoryInfo}。

        分析要求：
        1. 各类别支出金额和占比统计
        2. 类别支出排名和变化趋势
        3. ${includeComparison ? '同期对比分析（同比/环比）' : ''}
        4. 类别内主要商品和商家分析
        5. 支出效率和性价比评估
        6. 类别优化建议和节约机会

        请使用 get_spending_analysis 工具，参数设置为：
        {
            "startDate": "${startDate || ''}",
            "endDate": "${endDate || ''}",
            "groupBy": "category",
            "includeComparison": ${includeComparison}
        }`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Analyze spending trends over time
     */
    async analyzeSpendingTrends(options: {
        timeRange?: 'month' | 'quarter' | 'year';
        granularity?: 'daily' | 'weekly' | 'monthly';
        categories?: string[];
        threadId?: string;
    } = {}): Promise<any> {
        const {
            timeRange = 'quarter',
            granularity = 'monthly',
            categories,
            threadId
        } = options;

        const timeRangeMap = {
            'month': '最近一个月',
            'quarter': '最近三个月',
            'year': '最近一年'
        };

        const granularityMap = {
            'daily': '按日',
            'weekly': '按周',
            'monthly': '按月'
        };

        const categoryInfo = categories ? `，重点关注以下类别：${categories.join('、')}` : '';

        const input = `请分析${timeRangeMap[timeRange]}的支出趋势${categoryInfo}。

        分析设置：
        - 时间粒度：${granularityMap[granularity]}
        - 分析范围：${timeRangeMap[timeRange]}

        分析要求：
        1. 支出趋势图表和波动分析
        2. 周期性和季节性模式识别
        3. 异常波动点分析和原因探究
        4. 支出增长率和变化幅度统计
        5. 趋势预测和未来支出估算
        6. 趋势优化建议和控制措施

        请使用 analyze_spending_trends 工具进行趋势分析。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Generate comprehensive financial health report
     */
    async generateFinancialHealthReport(threadId?: string): Promise<any> {
        const input = `请生成综合财务健康状况报告。

        报告内容：
        1. 财务健康度评分和等级
        2. 支出结构分析和合理性评估
        3. 消费习惯和行为模式分析
        4. 预算管理效果和执行力评估
        5. 异常消费风险和控制情况
        6. 财务优化建议和改进计划
        7. 关键财务指标和基准对比

        请综合使用多个分析工具生成全面的健康报告。`;

        const config = threadId ? { configurable: { thread_id: threadId } } : undefined;
        return this.invoke(input, config);
    }

    /**
     * Update budget limits
     */
    updateBudgetLimits(budgets: Record<string, number>): void {
        for (const [category, limit] of Object.entries(budgets)) {
            this.budgetLimits.set(category, limit);
        }

        this.logger.info('Budget limits updated', {
            budgets: Object.fromEntries(this.budgetLimits)
        });
    }

    /**
     * Get current budget limits
     */
    getBudgetLimits(): Record<string, number> {
        return Object.fromEntries(this.budgetLimits);
    }

    /**
     * Update anomaly detection thresholds
     */
    updateAnomalyThresholds(thresholds: Partial<typeof this.anomalyThresholds>): void {
        this.anomalyThresholds = { ...this.anomalyThresholds, ...thresholds };

        this.logger.info('Anomaly thresholds updated', {
            thresholds: this.anomalyThresholds
        });
    }

    /**
     * Get current anomaly thresholds
     */
    getAnomalyThresholds(): typeof this.anomalyThresholds {
        return { ...this.anomalyThresholds };
    }

    /**
     * Create finance-specific tools factory method
     */
    static createFinanceTools(): {
        databaseTools: DynamicTool[];
        notificationTools: DynamicTool[];
    } {
        // Import the actual database tools
        const {
            getSpendingAnalysisTool,
            generateFinancialReportTool,
            detectAnomalousSpendingTool,
            getBudgetStatusTool,
            analyzeSpendingTrendsTool
        } = require('../tools/DatabaseTools');

        const {
            sendNotificationTool,
            sendFinancialReportTool
        } = require('../tools/NotificationTools');

        // Database tools for financial analysis
        const databaseTools = [
            getSpendingAnalysisTool,
            generateFinancialReportTool,
            detectAnomalousSpendingTool,
            getBudgetStatusTool,
            analyzeSpendingTrendsTool
        ];

        // Notification tools for financial alerts
        const notificationTools = [
            sendNotificationTool,
            sendFinancialReportTool
        ];

        return {
            databaseTools,
            notificationTools,
        };
    }
}
