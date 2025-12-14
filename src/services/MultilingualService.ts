/**
 * Multilingual Service for language detection and multilingual response generation
 * Supports Chinese (zh-CN) and English (en-US) processing
 */

import { Logger } from '../utils/Logger';

export type SupportedLanguage = 'zh-CN' | 'en-US';

export interface LanguageDetectionResult {
    language: SupportedLanguage;
    confidence: number;
    reasoning: string;
}

export interface MultilingualText {
    'zh-CN': string;
    'en-US': string;
}

export interface TranslationContext {
    domain: 'inventory' | 'procurement' | 'finance' | 'notification' | 'general';
    intent: string;
    entities: Record<string, any>;
}

export interface MultilingualServiceConfig {
    defaultLanguage: SupportedLanguage;
    confidenceThreshold: number;
    enableAutoTranslation: boolean;
    fallbackToDefault: boolean;
}

/**
 * MultilingualService handles language detection, translation, and multilingual response generation
 */
export class MultilingualService {
    private logger: Logger;
    private config: MultilingualServiceConfig;

    // Language patterns for detection
    private readonly languagePatterns = {
        'zh-CN': {
            // Chinese characters pattern
            characters: /[\u4e00-\u9fff]/,
            // Common Chinese words and phrases
            keywords: [
                '库存', '消耗', '添加', '查询', '更新', '导入', '订单', '采购', '建议',
                '财务', '支出', '分析', '报告', '通知', '提醒', '发送', '抽纸', '牛奶',
                '洗发水', '淘宝', '京东', '拼多多', '个', '包', '瓶', '盒', '袋',
                '什么', '怎么', '为什么', '哪里', '哪个', '多少', '几个', '一些',
                '请', '帮助', '谢谢', '好的', '是的', '不是', '可以', '不可以'
            ],
            // Chinese punctuation
            punctuation: /[，。！？；：""''（）【】]/
        },
        'en-US': {
            // English alphabet pattern (only letters, not numbers or symbols)
            characters: /[a-zA-Z]/,
            // Common English words and phrases
            keywords: [
                'inventory', 'stock', 'add', 'consume', 'query', 'update', 'import',
                'order', 'purchase', 'procurement', 'suggestion', 'finance', 'expense',
                'analysis', 'report', 'notification', 'remind', 'send', 'tissue',
                'milk', 'shampoo', 'taobao', 'jd', 'pdd', 'piece', 'pack', 'bottle',
                'box', 'bag', 'what', 'how', 'why', 'where', 'which', 'how many',
                'some', 'please', 'help', 'thank', 'thanks', 'ok', 'okay', 'yes',
                'no', 'can', 'cannot'
            ],
            // English punctuation
            punctuation: /[,.!?;:"'()[\]]/
        }
    };

    // Multilingual templates for common responses
    private readonly responseTemplates: Record<string, MultilingualText> = {
        // Intent clarification
        'intent_clarification': {
            'zh-CN': '我不太确定您想要执行什么操作。请您更具体地描述您想要执行的操作。',
            'en-US': 'I\'m not sure what operation you want to perform. Please describe more specifically what you want to do.'
        },
        'entity_missing': {
            'zh-CN': '为了更好地帮助您，我需要一些额外信息。',
            'en-US': 'To better assist you, I need some additional information.'
        },
        'incomplete_command': {
            'zh-CN': '您的请求似乎不完整。',
            'en-US': 'Your request seems incomplete.'
        },
        'ambiguous_terms': {
            'zh-CN': '您的描述中有一些模糊的表达。',
            'en-US': 'There are some ambiguous expressions in your description.'
        },

        // Success messages
        'operation_success': {
            'zh-CN': '操作已成功完成。',
            'en-US': 'Operation completed successfully.'
        },
        'data_updated': {
            'zh-CN': '数据已更新。',
            'en-US': 'Data has been updated.'
        },
        'processing_complete': {
            'zh-CN': '处理完成。',
            'en-US': 'Processing complete.'
        },

        // Error messages
        'processing_error': {
            'zh-CN': '处理过程中遇到错误。',
            'en-US': 'An error occurred during processing.'
        },
        'invalid_input': {
            'zh-CN': '输入无效，请检查后重试。',
            'en-US': 'Invalid input, please check and try again.'
        },
        'service_unavailable': {
            'zh-CN': '服务暂时不可用，请稍后重试。',
            'en-US': 'Service temporarily unavailable, please try again later.'
        },

        // Inventory specific
        'inventory_updated': {
            'zh-CN': '库存已更新。',
            'en-US': 'Inventory has been updated.'
        },
        'inventory_low': {
            'zh-CN': '库存不足，建议补货。',
            'en-US': 'Low inventory, recommend restocking.'
        },
        'item_not_found': {
            'zh-CN': '未找到指定物品。',
            'en-US': 'Specified item not found.'
        },

        // Procurement specific
        'orders_imported': {
            'zh-CN': '订单已成功导入。',
            'en-US': 'Orders imported successfully.'
        },
        'purchase_suggestion': {
            'zh-CN': '基于分析生成采购建议。',
            'en-US': 'Purchase suggestions generated based on analysis.'
        },
        'duplicate_orders': {
            'zh-CN': '检测到重复订单，已自动过滤。',
            'en-US': 'Duplicate orders detected and automatically filtered.'
        },

        // Finance specific
        'report_generated': {
            'zh-CN': '报告已生成。',
            'en-US': 'Report has been generated.'
        },
        'expense_analyzed': {
            'zh-CN': '支出分析完成。',
            'en-US': 'Expense analysis completed.'
        },
        'anomaly_detected': {
            'zh-CN': '检测到异常消费模式。',
            'en-US': 'Anomalous spending pattern detected.'
        },

        // Notification specific
        'notification_sent': {
            'zh-CN': '通知已发送。',
            'en-US': 'Notification has been sent.'
        },
        'notification_failed': {
            'zh-CN': '通知发送失败。',
            'en-US': 'Notification sending failed.'
        }
    };

    // Entity translations
    private readonly entityTranslations: Record<string, MultilingualText> = {
        // Common items
        '抽纸': { 'zh-CN': '抽纸', 'en-US': 'tissue' },
        '牛奶': { 'zh-CN': '牛奶', 'en-US': 'milk' },
        '洗发水': { 'zh-CN': '洗发水', 'en-US': 'shampoo' },
        '牙膏': { 'zh-CN': '牙膏', 'en-US': 'toothpaste' },
        '面包': { 'zh-CN': '面包', 'en-US': 'bread' },
        '鸡蛋': { 'zh-CN': '鸡蛋', 'en-US': 'eggs' },
        '大米': { 'zh-CN': '大米', 'en-US': 'rice' },
        '油': { 'zh-CN': '油', 'en-US': 'oil' },
        '洗衣液': { 'zh-CN': '洗衣液', 'en-US': 'laundry detergent' },

        // Actions
        '消耗': { 'zh-CN': '消耗', 'en-US': 'consume' },
        '添加': { 'zh-CN': '添加', 'en-US': 'add' },
        '查询': { 'zh-CN': '查询', 'en-US': 'query' },
        '更新': { 'zh-CN': '更新', 'en-US': 'update' },
        '导入': { 'zh-CN': '导入', 'en-US': 'import' },
        '分析': { 'zh-CN': '分析', 'en-US': 'analyze' },
        '发送': { 'zh-CN': '发送', 'en-US': 'send' },
        '删除': { 'zh-CN': '删除', 'en-US': 'delete' },
        '修改': { 'zh-CN': '修改', 'en-US': 'modify' },

        // Platforms
        '淘宝': { 'zh-CN': '淘宝', 'en-US': 'Taobao' },
        '京东': { 'zh-CN': '京东', 'en-US': 'JD.com' },
        '拼多多': { 'zh-CN': '拼多多', 'en-US': 'PDD' },
        '抖音': { 'zh-CN': '抖音', 'en-US': 'TikTok Shop' },
        '中免日上': { 'zh-CN': '中免日上', 'en-US': 'CDF' },

        // Units
        '包': { 'zh-CN': '包', 'en-US': 'pack' },
        '个': { 'zh-CN': '个', 'en-US': 'piece' },
        '瓶': { 'zh-CN': '瓶', 'en-US': 'bottle' },
        '盒': { 'zh-CN': '盒', 'en-US': 'box' },
        '袋': { 'zh-CN': '袋', 'en-US': 'bag' },
        '斤': { 'zh-CN': '斤', 'en-US': 'jin' },
        '公斤': { 'zh-CN': '公斤', 'en-US': 'kg' },
        '升': { 'zh-CN': '升', 'en-US': 'liter' },
        '毫升': { 'zh-CN': '毫升', 'en-US': 'ml' }
    };

    constructor(config: Partial<MultilingualServiceConfig> = {}) {
        this.config = {
            defaultLanguage: 'zh-CN',
            confidenceThreshold: 0.7,
            enableAutoTranslation: true,
            fallbackToDefault: true,
            ...config
        };

        this.logger = new Logger({
            component: 'MultilingualService',
            level: 'info'
        });

        this.logger.info('MultilingualService initialized', {
            defaultLanguage: this.config.defaultLanguage,
            confidenceThreshold: this.config.confidenceThreshold,
            enableAutoTranslation: this.config.enableAutoTranslation
        });
    }

    /**
     * Detect the language of input text
     */
    detectLanguage(text: string): LanguageDetectionResult {
        if (!text || text.trim().length === 0) {
            return {
                language: this.config.defaultLanguage,
                confidence: 0.5,
                reasoning: 'Empty input, using default language'
            };
        }

        const cleanText = text.trim().toLowerCase();
        const scores: Record<SupportedLanguage, number> = {
            'zh-CN': 0,
            'en-US': 0
        };

        // Check for language-specific characters
        for (const [lang, patterns] of Object.entries(this.languagePatterns)) {
            const language = lang as SupportedLanguage;

            // Character-based scoring
            const charMatches = (cleanText.match(patterns.characters) || []).length;
            scores[language] += charMatches * 2; // Higher weight for character matches

            // Keyword-based scoring
            let keywordMatches = 0;
            for (const keyword of patterns.keywords) {
                if (cleanText.includes(keyword.toLowerCase())) {
                    keywordMatches++;
                }
            }
            scores[language] += keywordMatches;

            // Punctuation-based scoring (lower weight)
            const punctMatches = (cleanText.match(patterns.punctuation) || []).length;
            scores[language] += punctMatches * 0.5;
        }

        // Determine the language with highest score
        const totalScore = scores['zh-CN'] + scores['en-US'];
        if (totalScore === 0) {
            return {
                language: this.config.defaultLanguage,
                confidence: 0.3,
                reasoning: 'No language indicators found, using default'
            };
        }

        // Special case: if input contains only symbols/punctuation, use default
        const symbolOnlyPattern = /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`\s]*$/;
        if (symbolOnlyPattern.test(cleanText)) {
            return {
                language: this.config.defaultLanguage,
                confidence: 0.3,
                reasoning: 'Input contains only symbols/punctuation, using default'
            };
        }

        const chineseConfidence = scores['zh-CN'] / totalScore;
        const englishConfidence = scores['en-US'] / totalScore;

        let detectedLanguage: SupportedLanguage;
        let confidence: number;
        let reasoning: string;

        if (chineseConfidence > englishConfidence) {
            detectedLanguage = 'zh-CN';
            confidence = chineseConfidence;
            reasoning = `Chinese indicators: ${scores['zh-CN']}, English indicators: ${scores['en-US']}`;
        } else {
            detectedLanguage = 'en-US';
            confidence = englishConfidence;
            reasoning = `English indicators: ${scores['en-US']}, Chinese indicators: ${scores['zh-CN']}`;
        }

        // If confidence is too low, fall back to default if configured
        if (confidence < this.config.confidenceThreshold && this.config.fallbackToDefault) {
            return {
                language: this.config.defaultLanguage,
                confidence: 0.5,
                reasoning: `Low confidence (${confidence.toFixed(2)}), falling back to default`
            };
        }

        this.logger.debug('Language detected', {
            text: text.substring(0, 50),
            detectedLanguage,
            confidence,
            scores
        });

        return {
            language: detectedLanguage,
            confidence,
            reasoning
        };
    }

    /**
     * Get localized response template
     */
    getLocalizedTemplate(templateKey: string, language: SupportedLanguage): string {
        const template = this.responseTemplates[templateKey];
        if (!template) {
            this.logger.warn('Template not found', { templateKey });
            return templateKey; // Return key as fallback
        }

        return template[language] || template[this.config.defaultLanguage];
    }

    /**
     * Translate entity to target language
     */
    translateEntity(entity: string, targetLanguage: SupportedLanguage): string {
        const translation = this.entityTranslations[entity];
        if (!translation) {
            return entity; // Return original if no translation found
        }

        return translation[targetLanguage] || entity;
    }

    /**
     * Generate multilingual response based on context
     */
    generateMultilingualResponse(
        templateKey: string,
        language: SupportedLanguage,
        context?: TranslationContext,
        variables?: Record<string, any>
    ): string {
        let response = this.getLocalizedTemplate(templateKey, language);

        // Replace variables in the response if provided
        if (variables) {
            for (const [key, value] of Object.entries(variables)) {
                const placeholder = `{${key}}`;
                if (response.includes(placeholder)) {
                    // Translate the value if it's an entity
                    const translatedValue = typeof value === 'string'
                        ? this.translateEntity(value, language)
                        : String(value);
                    response = response.replace(placeholder, translatedValue);
                }
            }
        }

        // Add context-specific enhancements
        if (context) {
            response = this.enhanceResponseWithContext(response, context, language);
        }

        return response;
    }

    /**
     * Enhance response with context-specific information
     */
    private enhanceResponseWithContext(
        response: string,
        context: TranslationContext,
        language: SupportedLanguage
    ): string {
        // Add domain-specific context if needed
        switch (context.domain) {
            case 'inventory':
                if (context.entities.item_name) {
                    const translatedItem = this.translateEntity(context.entities.item_name, language);
                    response = response.replace(/物品|item/gi, translatedItem);
                }
                break;
            case 'procurement':
                if (context.entities.platform) {
                    const translatedPlatform = this.translateEntity(context.entities.platform, language);
                    response = response.replace(/平台|platform/gi, translatedPlatform);
                }
                break;
            case 'finance':
                // Add financial context enhancements
                break;
            case 'notification':
                // Add notification context enhancements
                break;
        }

        return response;
    }

    /**
     * Generate clarification questions in appropriate language
     */
    generateClarificationQuestions(
        missingEntities: string[],
        intent: string,
        language: SupportedLanguage
    ): string[] {
        const questions: string[] = [];

        for (const entity of missingEntities) {
            let question: string;

            switch (entity) {
                case 'item_name':
                    question = language === 'zh-CN'
                        ? '请告诉我具体是哪种物品？比如：抽纸、牛奶、洗发水等。'
                        : 'Please tell me which specific item? For example: tissue, milk, shampoo, etc.';
                    break;
                case 'quantity':
                    question = language === 'zh-CN'
                        ? '请告诉我具体的数量是多少？'
                        : 'Please tell me the specific quantity?';
                    break;
                case 'platform':
                    question = language === 'zh-CN'
                        ? '请告诉我是哪个平台的订单？比如：淘宝、京东、1688等。'
                        : 'Please tell me which platform\'s orders? For example: Taobao, JD.com, 1688, etc.';
                    break;
                case 'time_period':
                    question = language === 'zh-CN'
                        ? '请告诉我需要分析哪个时间段？比如：本月、上月、本季度等。'
                        : 'Please tell me which time period to analyze? For example: this month, last month, this quarter, etc.';
                    break;
                case 'action':
                    question = language === 'zh-CN'
                        ? '请告诉我您想要执行什么操作？比如：添加、消耗、查询、更新等。'
                        : 'Please tell me what operation you want to perform? For example: add, consume, query, update, etc.';
                    break;
                default:
                    question = language === 'zh-CN'
                        ? `请提供${entity}的具体信息。`
                        : `Please provide specific information for ${entity}.`;
            }

            questions.push(question);
        }

        return questions;
    }

    /**
     * Generate suggested responses in appropriate language
     */
    generateSuggestedResponses(
        guidanceType: string,
        missingEntities: string[],
        language: SupportedLanguage
    ): string[] {
        const suggestions: string[] = [];

        switch (guidanceType) {
            case 'ambiguous_intent':
                if (language === 'zh-CN') {
                    suggestions.push('查询库存', '添加物品', '导入订单', '生成报告');
                } else {
                    suggestions.push('query inventory', 'add item', 'import orders', 'generate report');
                }
                break;
            case 'entity_missing':
                if (missingEntities.includes('item_name')) {
                    if (language === 'zh-CN') {
                        suggestions.push('抽纸', '牛奶', '洗发水', '面包');
                    } else {
                        suggestions.push('tissue', 'milk', 'shampoo', 'bread');
                    }
                }
                if (missingEntities.includes('quantity')) {
                    if (language === 'zh-CN') {
                        suggestions.push('1个', '2包', '3瓶', '5盒');
                    } else {
                        suggestions.push('1 piece', '2 packs', '3 bottles', '5 boxes');
                    }
                }
                if (missingEntities.includes('platform')) {
                    if (language === 'zh-CN') {
                        suggestions.push('淘宝', '京东', '1688', '拼多多');
                    } else {
                        suggestions.push('Taobao', 'JD.com', '1688', 'PDD');
                    }
                }
                break;
            case 'incomplete_command':
                if (language === 'zh-CN') {
                    suggestions.push('查询抽纸库存', '添加牛奶2瓶', '导入淘宝订单', '生成月度报告');
                } else {
                    suggestions.push('query tissue inventory', 'add 2 bottles of milk', 'import Taobao orders', 'generate monthly report');
                }
                break;
            case 'context_needed':
                if (language === 'zh-CN') {
                    suggestions.push('请提供更具体的描述');
                } else {
                    suggestions.push('Please provide more specific description');
                }
                break;
        }

        return suggestions;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages(): SupportedLanguage[] {
        return ['zh-CN', 'en-US'];
    }

    /**
     * Check if a language is supported
     */
    isLanguageSupported(language: string): language is SupportedLanguage {
        return this.getSupportedLanguages().includes(language as SupportedLanguage);
    }

    /**
     * Get default language
     */
    getDefaultLanguage(): SupportedLanguage {
        return this.config.defaultLanguage;
    }

    /**
     * Set default language
     */
    setDefaultLanguage(language: SupportedLanguage): void {
        this.config.defaultLanguage = language;
        this.logger.info('Default language updated', { defaultLanguage: language });
    }
}
