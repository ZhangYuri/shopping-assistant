#!/usr/bin/env node

/**
 * 环境变量检查脚本
 * Environment Variables Check Script
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking environment configuration...\n');

const requiredEnvVars = [
    { name: 'DATABASE_HOST', description: 'MySQL database host' },
    { name: 'DATABASE_PORT', description: 'MySQL database port' },
    { name: 'DATABASE_USER', description: 'MySQL database user' },
    { name: 'DATABASE_PASSWORD', description: 'MySQL database password' },
    { name: 'DATABASE_NAME', description: 'MySQL database name' }
];

const optionalEnvVars = [
    { name: 'DEEPSEEK_API_KEY', description: 'DeepSeek API key for AI services' },
    { name: 'TEAMS_WEBHOOK_URL', description: 'Microsoft Teams webhook URL' },
    { name: 'DINGTALK_WEBHOOK_URL', description: 'DingTalk webhook URL' },
    { name: 'WECHAT_WORK_WEBHOOK_URL', description: 'WeChat Work webhook URL' }
];

// 检查 .env 文件是否存在
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

console.log('📁 File Status:');
if (fs.existsSync(envPath)) {
    console.log('   ✅ .env file exists');
} else {
    console.log('   ❌ .env file missing');
    if (fs.existsSync(envExamplePath)) {
        console.log('   💡 Run: cp .env.example .env (then edit with your values)');
        console.log('   💡 Or run: npm run setup:env (interactive setup)');
    }
}

if (fs.existsSync(envExamplePath)) {
    console.log('   ✅ .env.example file exists');
} else {
    console.log('   ❌ .env.example file missing');
}

console.log('\n🔧 Required Environment Variables:');
let missingRequired = 0;

requiredEnvVars.forEach(envVar => {
    const value = process.env[envVar.name];
    if (value) {
        // 隐藏敏感信息
        const displayValue = envVar.name.includes('PASSWORD') || envVar.name.includes('KEY')
            ? '***'
            : value;
        console.log(`   ✅ ${envVar.name}: ${displayValue}`);
    } else {
        console.log(`   ❌ ${envVar.name}: Missing (${envVar.description})`);
        missingRequired++;
    }
});

console.log('\n🔧 Optional Environment Variables:');
let setOptional = 0;

optionalEnvVars.forEach(envVar => {
    const value = process.env[envVar.name];
    if (value) {
        const displayValue = envVar.name.includes('PASSWORD') || envVar.name.includes('KEY')
            ? '***'
            : (value.length > 50 ? value.substring(0, 50) + '...' : value);
        console.log(`   ✅ ${envVar.name}: ${displayValue}`);
        setOptional++;
    } else {
        console.log(`   ⚪ ${envVar.name}: Not set (${envVar.description})`);
    }
});

// 数据库连接字符串构建测试
console.log('\n🔗 Database Connection:');
if (process.env.DATABASE_HOST && process.env.DATABASE_USER && process.env.DATABASE_NAME) {
    const connectionString = `mysql://${process.env.DATABASE_USER}:***@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT || 3306}/${process.env.DATABASE_NAME}`;
    console.log(`   📋 Connection String: ${connectionString}`);
    console.log('   💡 Test connection: npm run test:db-connection');
} else {
    console.log('   ❌ Insufficient database configuration');
}

// 总结
console.log('\n📊 Summary:');
console.log(`   Required variables: ${requiredEnvVars.length - missingRequired}/${requiredEnvVars.length} configured`);
console.log(`   Optional variables: ${setOptional}/${optionalEnvVars.length} configured`);

if (missingRequired > 0) {
    console.log('\n❌ Configuration incomplete!');
    console.log('🔧 Next steps:');
    console.log('   1. Run: npm run setup:env (interactive setup)');
    console.log('   2. Or manually edit .env file');
    console.log('   3. Then run: npm run test:db-connection');
    process.exit(1);
} else {
    console.log('\n✅ Environment configuration looks good!');
    console.log('🔧 Next steps:');
    console.log('   1. Test database connection: npm run test:db-connection');
    console.log('   2. Set up OCR data: npm run setup:ocr');
    console.log('   3. Run tests: npm test');
}
