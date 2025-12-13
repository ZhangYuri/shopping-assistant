// Legacy DeepSeek integration - will be replaced by agent system
// This file is kept for reference during migration

import { ChatDeepSeek } from '@langchain/deepseek';
import { createAgent } from 'langchain';

export function createDeepSeekModel() {
    return new ChatDeepSeek({
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
    });
}


// Example usage (commented out):
// const model = createDeepSeekModel();
// const res = await model.invoke([
//     {
//         role: "user",
//         content: "Hello",
//     },
// ]);
