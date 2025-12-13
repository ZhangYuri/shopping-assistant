#!/usr/bin/env node

/**
 * 检查 .traineddata 文件状态
 * Check .traineddata files status
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Checking .traineddata files status...\n');

const projectRoot = path.resolve(__dirname, '..');
const requiredFiles = ['eng.traineddata', 'chi_sim.traineddata'];

// 检查文件是否存在
console.log('📁 File Status:');
let allFilesExist = true;
let totalSize = 0;

requiredFiles.forEach(fileName => {
    const filePath = path.join(projectRoot, fileName);

    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
        totalSize += parseFloat(sizeMB);
        console.log(`   ✅ ${fileName}: ${sizeMB}MB`);
    } else {
        console.log(`   ❌ ${fileName}: Missing`);
        allFilesExist = false;
    }
});

console.log(`   📦 Total size: ${totalSize.toFixed(1)}MB\n`);

// 检查 Git 状态
console.log('🔧 Git Status:');
try {
    const gitStatus = execSync('git status --porcelain *.traineddata', {
        encoding: 'utf8',
        cwd: projectRoot
    }).trim();

    if (gitStatus) {
        console.log('   ⚠️  .traineddata files are tracked by Git:');
        gitStatus.split('\n').forEach(line => {
            console.log(`      ${line}`);
        });
        console.log('   💡 Consider running: git rm --cached *.traineddata');
    } else {
        console.log('   ✅ .traineddata files are properly ignored by Git');
    }
} catch (error) {
    console.log('   ✅ .traineddata files are not tracked by Git');
}

// 检查 .gitignore
console.log('\n📝 .gitignore Status:');
const gitignorePath = path.join(projectRoot, '.gitignore');
if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (gitignoreContent.includes('*.traineddata')) {
        console.log('   ✅ *.traineddata is in .gitignore');
    } else {
        console.log('   ❌ *.traineddata is NOT in .gitignore');
        console.log('   💡 Add this line to .gitignore: *.traineddata');
    }
} else {
    console.log('   ❌ .gitignore file not found');
}

// 提供建议
console.log('\n💡 Recommendations:');

if (!allFilesExist) {
    console.log('   🔧 Download missing files: npm run setup:ocr');
}

if (totalSize > 0) {
    console.log('   📊 Current setup uses local files (recommended for development)');
    console.log('   🚀 For production, consider using cloud OCR services');
}

console.log('   📚 For more info, see: docs/ocr-setup.md');

console.log('\n✨ Status check completed!');
