/**
 * Infrastructure tests for the shopping assistant system
 */

import { ShoppingAssistantSystem } from '../index';
import { Logger } from '../utils/Logger';
import { ValidationUtils } from '../utils/ValidationUtils';

describe('Infrastructure Tests', () => {
    describe('ShoppingAssistantSystem', () => {
        let system: ShoppingAssistantSystem;

        beforeEach(() => {
            system = new ShoppingAssistantSystem();
        });

        afterEach(async () => {
            if (system.getStatus().running) {
                await system.stop();
            }
        });

        it('should initialize successfully', async () => {
            await system.initialize();
            expect(system.getStatus().initialized).toBe(true);
        });

        it('should start and stop successfully', async () => {
            await system.start();
            expect(system.getStatus().running).toBe(true);

            await system.stop();
            expect(system.getStatus().running).toBe(false);
        });

        it('should handle multiple initialization calls', async () => {
            await system.initialize();
            await system.initialize(); // Should not throw
            expect(system.getStatus().initialized).toBe(true);
        });
    });

    describe('Logger', () => {
        let logger: Logger;

        beforeEach(() => {
            logger = new Logger({
                component: 'TestComponent',
                level: 'debug',
            });
        });

        it('should create logger with correct component name', () => {
            expect(logger).toBeDefined();
        });

        it('should log messages without throwing', () => {
            expect(() => {
                logger.info('Test message');
                logger.warn('Test warning');
                logger.error('Test error');
                logger.debug('Test debug');
            }).not.toThrow();
        });

        it('should create child logger', () => {
            const childLogger = logger.createChildLogger('ChildComponent');
            expect(childLogger).toBeDefined();
            expect(() => childLogger.info('Child message')).not.toThrow();
        });
    });

    describe('ValidationUtils', () => {
        describe('validateAgentId', () => {
            it('should validate correct agent IDs', () => {
                const result = ValidationUtils.validateAgentId('inventory-agent');
                expect(result.isValid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });

            it('should reject invalid agent IDs', () => {
                const result = ValidationUtils.validateAgentId('123invalid');
                expect(result.isValid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            });

            it('should reject too short agent IDs', () => {
                const result = ValidationUtils.validateAgentId('ab');
                expect(result.isValid).toBe(false);
            });
        });

        describe('validateNaturalLanguageCommand', () => {
            it('should validate correct commands', () => {
                const result = ValidationUtils.validateNaturalLanguageCommand('抽纸消耗1包');
                expect(result.isValid).toBe(true);
            });

            it('should reject empty commands', () => {
                const result = ValidationUtils.validateNaturalLanguageCommand('');
                expect(result.isValid).toBe(false);
            });

            it('should reject too long commands', () => {
                const longCommand = 'a'.repeat(501);
                const result = ValidationUtils.validateNaturalLanguageCommand(longCommand);
                expect(result.isValid).toBe(false);
            });
        });

        describe('validateInventoryItemName', () => {
            it('should validate Chinese item names', () => {
                const result = ValidationUtils.validateInventoryItemName('抽纸');
                expect(result.isValid).toBe(true);
            });

            it('should validate English item names', () => {
                const result = ValidationUtils.validateInventoryItemName('Tissue Paper');
                expect(result.isValid).toBe(true);
            });

            it('should validate mixed language item names', () => {
                const result = ValidationUtils.validateInventoryItemName('抽纸 Tissue (100张)');
                expect(result.isValid).toBe(true);
            });
        });

        describe('validateQuantity', () => {
            it('should validate positive quantities', () => {
                const result = ValidationUtils.validateQuantity(5);
                expect(result.isValid).toBe(true);
            });

            it('should validate zero quantity', () => {
                const result = ValidationUtils.validateQuantity(0);
                expect(result.isValid).toBe(true);
            });

            it('should reject negative quantities', () => {
                const result = ValidationUtils.validateQuantity(-1);
                expect(result.isValid).toBe(false);
            });

            it('should reject too large quantities', () => {
                const result = ValidationUtils.validateQuantity(1000000);
                expect(result.isValid).toBe(false);
            });
        });
    });
});
