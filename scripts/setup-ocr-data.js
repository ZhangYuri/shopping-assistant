#!/usr/bin/env node

/**
 * OCR Training Data Setup Script
 * 自动下载 Tesseract OCR 训练数据文件
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TESSERACT_DATA_URL = 'https://github.com/tesseract-ocr/tessdata/raw/main';
const REQUIRED_LANGUAGES = ['eng', 'chi_sim'];

console.log('🚀 Setting up OCR training data...\n');

/**
 * 下载文件
 */
function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);

        console.log(`📥 Downloading: ${path.basename(destination)}`);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;

            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                process.stdout.write(`\r   Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB)`);
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`\n✅ Downloaded: ${path.basename(destination)}`);
                resolve();
            });

        }).on('error', (error) => {
            fs.unlink(destination, () => { }); // 删除部分下载的文件
            reject(error);
        });
    });
}

/**
 * 检查文件是否存在
 */
function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (error) {
        return false;
    }
}

/**
 * 获取文件大小
 */
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return (stats.size / 1024 / 1024).toFixed(1) + 'MB';
    } catch (error) {
        return 'Unknown';
    }
}

/**
 * 主函数
 */
async function setupOCRData() {
    const projectRoot = path.resolve(__dirname, '..');

    console.log('📋 Required OCR languages:');
    REQUIRED_LANGUAGES.forEach(lang => {
        console.log(`   - ${lang} (${lang === 'eng' ? 'English' : 'Simplified Chinese'})`);
    });
    console.log('');

    for (const language of REQUIRED_LANGUAGES) {
        const fileName = `${language}.traineddata`;
        const filePath = path.join(projectRoot, fileName);

        if (fileExists(filePath)) {
            console.log(`✅ ${fileName} already exists (${getFileSize(filePath)})`);
            continue;
        }

        const downloadUrl = `${TESSERACT_DATA_URL}/${fileName}`;

        try {
            await downloadFile(downloadUrl, filePath);
        } catch (error) {
            console.error(`\n❌ Failed to download ${fileName}:`);
            console.error(`   Error: ${error.message}`);
            console.error(`   URL: ${downloadUrl}`);

            // 提供备用方案
            console.log('\n🔧 Alternative solutions:');
            console.log(`   1. Manual download: ${downloadUrl}`);
            console.log(`   2. Use Tesseract.js auto-download (slower first run)`);
            console.log(`   3. Install system Tesseract: brew install tesseract-lang`);

            process.exit(1);
        }
    }

    console.log('\n🎉 OCR training data setup completed!');
    console.log('\n📊 Summary:');

    let totalSize = 0;
    REQUIRED_LANGUAGES.forEach(lang => {
        const fileName = `${lang}.traineddata`;
        const filePath = path.join(projectRoot, fileName);
        if (fileExists(filePath)) {
            const stats = fs.statSync(filePath);
            const sizeMB = stats.size / 1024 / 1024;
            totalSize += sizeMB;
            console.log(`   ✅ ${fileName}: ${sizeMB.toFixed(1)}MB`);
        }
    });

    console.log(`   📦 Total size: ${totalSize.toFixed(1)}MB`);
    console.log('\n💡 These files are excluded from git tracking (.gitignore)');
    console.log('   New developers should run: npm run setup:ocr');
}

// 运行脚本
setupOCRData().catch(console.error);
