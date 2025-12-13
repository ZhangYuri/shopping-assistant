#!/usr/bin/env node

/**
 * Database Integration Test Runner
 * 专门用于运行数据库集成测试的脚本
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting Database Integration Tests...\n');

console.log('📋 Test Configuration:');
console.log('   Database: 127.0.0.1:3306/shopping_assistant');
console.log('   Username: yuri');
console.log('   Products: 黑人牙膏, DARLIE好来牙膏, 面膜贴');
console.log('');

try {
    // 运行数据库集成测试
    const command =
        'npm test -- --testPathPattern="database-integration" --verbose --detectOpenHandles';

    console.log('🔧 Running command:', command);
    console.log('');

    execSync(command, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..'),
    });

    console.log('\n✅ Database integration tests completed successfully!');
} catch (error) {
    console.error('\n❌ Database integration tests failed:');
    console.error(error.message);

    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. 确保MySQL服务正在运行');
    console.log('2. 检查数据库连接信息是否正确');
    console.log('3. 确保数据库 "shopping_assistant" 存在');
    console.log('4. 确保用户 "yuri" 有足够的权限');
    console.log('5. 检查防火墙设置');

    process.exit(1);
}
