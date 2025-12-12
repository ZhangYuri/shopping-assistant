/**
 * Jest test setup configuration
 */

import 'dotenv/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeAll(() => {
    // Only show console output for errors in tests
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.debug = jest.fn();
});

afterAll(() => {
    // Restore console methods
    Object.assign(console, originalConsole);
});

// Global test utilities
global.testUtils = {
    createMockAgent: (agentId: string) => ({
        agentId,
        name: `Test Agent ${agentId}`,
        type: 'test',
        status: 'idle',
    }),

    createMockTask: (taskId: string) => ({
        taskId,
        agentId: 'test-agent',
        taskType: 'test-task',
        priority: 1,
        status: 'pending',
        input: { test: true },
        createdAt: new Date(),
        updatedAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
    }),

    delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Extend Jest matchers if needed
declare global {
    // eslint-disable-next-line no-var
    var testUtils: {
        createMockAgent: (agentId: string) => Record<string, unknown>;
        createMockTask: (taskId: string) => Record<string, unknown>;
        delay: (ms: number) => Promise<void>;
    };
}
