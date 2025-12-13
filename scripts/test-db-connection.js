#!/usr/bin/env node

/**
 * 简单的数据库连接测试脚本
 * Simple Database Connection Test Script
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('🔌 Testing database connection...\n');

    // 从环境变量读取配置
    const config = {
        host: process.env.DATABASE_HOST || '127.0.0.1',
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER || 'root',
        password: process.env.DATABASE_PASSWORD || '',
        database: process.env.DATABASE_NAME || 'shopping_assistant'
    };

    console.log('📋 Connection Config:');
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   User: ${config.user}`);
    console.log('');

    let connection;

    try {
        // 创建连接
        console.log('🔄 Connecting to database...');
        connection = await mysql.createConnection(config);

        console.log('✅ Successfully connected to database!');

        // 测试基本查询
        console.log('\n🔍 Testing basic queries...');

        // 检查数据库版本
        const [versionRows] = await connection.execute('SELECT VERSION() as version');
        console.log(`   MySQL Version: ${versionRows[0].version}`);

        // 检查表是否存在
        const [tables] = await connection.execute('SHOW TABLES');
        console.log(`   Tables found: ${tables.length}`);
        tables.forEach(table => {
            const tableName = Object.values(table)[0];
            console.log(`     - ${tableName}`);
        });

        // 检查inventory表结构
        try {
            const [inventoryStructure] = await connection.execute('DESCRIBE inventory');
            console.log('\n📊 Inventory table structure:');
            inventoryStructure.forEach(column => {
                console.log(`     ${column.Field}: ${column.Type} ${column.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });

            // 检查inventory表中的数据
            const [inventoryCount] = await connection.execute('SELECT COUNT(*) as count FROM inventory');
            console.log(`\n📦 Current inventory items: ${inventoryCount[0].count}`);

            if (inventoryCount[0].count > 0) {
                const [recentItems] = await connection.execute(
                    'SELECT item_name, current_quantity, unit, category FROM inventory ORDER BY created_at DESC LIMIT 5'
                );
                console.log('   Recent items:');
                recentItems.forEach(item => {
                    console.log(`     - ${item.item_name}: ${item.current_quantity}${item.unit || ''} (${item.category || 'No category'})`);
                });
            }

        } catch (error) {
            console.log('⚠️  Inventory table not found or accessible');
            console.log('   You may need to run the schema creation script first');
        }

        console.log('\n🎉 Database connection test completed successfully!');

    } catch (error) {
        console.error('\n❌ Database connection failed:');
        console.error(`   Error: ${error.message}`);

        console.log('\n🔧 Troubleshooting tips:');
        console.log('1. 确保MySQL服务正在运行');
        console.log('2. 检查用户名和密码是否正确');
        console.log('3. 确保数据库 "shopping_assistant" 存在');
        console.log('4. 检查用户权限：');
        console.log('   GRANT ALL PRIVILEGES ON shopping_assistant.* TO \'yuri\'@\'localhost\';');
        console.log('5. 检查防火墙和端口3306是否开放');

        process.exit(1);

    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// 运行测试
testConnection().catch(console.error);
