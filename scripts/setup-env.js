#!/usr/bin/env node

/**
 * 环境变量设置助手
 * Environment Variables Setup Helper
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupEnvironment() {
    console.log('🚀 Shopping Assistant Environment Setup\n');

    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');

    // 检查是否已存在 .env 文件
    if (fs.existsSync(envPath)) {
        console.log('⚠️  .env file already exists');
        const overwrite = await question('Do you want to overwrite it? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('✅ Setup cancelled');
            rl.close();
            return;
        }
    }

    console.log('📋 Database Configuration');
    console.log('Please provide your MySQL database connection details:\n');

    // 收集数据库配置
    const dbConfig = {
        host: await question('Database Host (127.0.0.1): ') || '127.0.0.1',
        port: await question('Database Port (3306): ') || '3306',
        user: await question('Database User: '),
        password: await question('Database Password: '),
        database: await question('Database Name (shopping_assistant): ') || 'shopping_assistant'
    };

    // 验证必填字段
    if (!dbConfig.user) {
        console.error('❌ Database user is required');
        rl.close();
        return;
    }

    console.log('\n📧 Optional: Notification Configuration');
    const notifications = {
        teamsWebhook: await question('Teams Webhook URL (optional): '),
        dingtalkWebhook: await question('DingTalk Webhook URL (optional): '),
        wechatWebhook: await question('WeChat Work Webhook URL (optional): ')
    };

    console.log('\n🤖 Optional: AI Service Configuration');
    const aiConfig = {
        deepseekApiKey: await question('DeepSeek API Key (optional): '),
        langchainApiKey: await question('LangChain API Key (optional): ')
    };

    // 读取 .env.example 作为模板
    let envTemplate = '';
    if (fs.existsSync(envExamplePath)) {
        envTemplate = fs.readFileSync(envExamplePath, 'utf8');
    }

    // 替换配置值
    let envContent = envTemplate
        .replace('DATABASE_HOST=127.0.0.1', `DATABASE_HOST=${dbConfig.host}`)
        .replace('DATABASE_PORT=3306', `DATABASE_PORT=${dbConfig.port}`)
        .replace('DATABASE_USER=your_username', `DATABASE_USER=${dbConfig.user}`)
        .replace('DATABASE_PASSWORD=your_password', `DATABASE_PASSWORD=${dbConfig.password}`)
        .replace('DATABASE_NAME=shopping_assistant', `DATABASE_NAME=${dbConfig.database}`);

    // 更新通知配置
    if (notifications.teamsWebhook) {
        envContent = envContent.replace('TEAMS_WEBHOOK_URL=your_teams_webhook_url_here', `TEAMS_WEBHOOK_URL=${notifications.teamsWebhook}`);
    }
    if (notifications.dingtalkWebhook) {
        envContent = envContent.replace('DINGTALK_WEBHOOK_URL=your_dingtalk_webhook_url_here', `DINGTALK_WEBHOOK_URL=${notifications.dingtalkWebhook}`);
    }
    if (notifications.wechatWebhook) {
        envContent = envContent.replace('WECHAT_WORK_WEBHOOK_URL=your_wechat_work_webhook_url_here', `WECHAT_WORK_WEBHOOK_URL=${notifications.wechatWebhook}`);
    }

    // 更新AI配置
    if (aiConfig.deepseekApiKey) {
        envContent = envContent.replace('DEEPSEEK_API_KEY=your_deepseek_api_key_here', `DEEPSEEK_API_KEY=${aiConfig.deepseekApiKey}`);
    }
    if (aiConfig.langchainApiKey) {
        envContent = envContent.replace('LANGCHAIN_API_KEY=your_langchain_api_key_here', `LANGCHAIN_API_KEY=${aiConfig.langchainApiKey}`);
    }

    // 写入 .env 文件
    fs.writeFileSync(envPath, envContent);

    console.log('\n✅ Environment configuration created successfully!');
    console.log(`📁 Configuration saved to: ${envPath}`);

    console.log('\n🔧 Next steps:');
    console.log('1. Review and adjust the .env file if needed');
    console.log('2. Test database connection: npm run test:db-connection');
    console.log('3. Set up OCR training data: npm run setup:ocr');
    console.log('4. Run tests: npm test');

    console.log('\n⚠️  Security reminder:');
    console.log('- Never commit the .env file to version control');
    console.log('- Keep your database credentials secure');
    console.log('- Use different credentials for production');

    rl.close();
}

// 运行设置
setupEnvironment().catch(console.error);
