# OCR 训练数据设置指南
# OCR Training Data Setup Guide

## 📋 概述

购物助手系统使用 Tesseract OCR 来识别产品图片中的文字信息。为了支持中英文识别，需要下载相应的训练数据文件。

## 🚫 为什么不提交到 Git？

### 文件大小问题
```
eng.traineddata      ~10MB  (英文识别)
chi_sim.traineddata  ~20MB  (简体中文识别)
总计                 ~30MB
```

### Git 仓库影响
- ❌ **仓库膨胀**: 增加仓库大小
- ❌ **克隆缓慢**: 影响新开发者体验
- ❌ **版本历史**: 二进制文件变更难以追踪
- ❌ **带宽浪费**: 不必要的网络传输

## ✅ 推荐方案

### 1. 自动下载（推荐）

```bash
# 运行自动下载脚本
npm run setup:ocr
```

这个命令会：
- 检查是否已存在训练数据文件
- 从官方源下载缺失的文件
- 显示下载进度和文件大小
- 验证下载完整性

### 2. 手动下载

如果自动下载失败，可以手动下载：

```bash
# 英文训练数据
curl -L -o eng.traineddata https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata

# 简体中文训练数据
curl -L -o chi_sim.traineddata https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata
```

### 3. 系统安装（macOS）

```bash
# 使用 Homebrew 安装
brew install tesseract-lang
```

## 🔧 开发环境设置

### 新开发者设置流程

```bash
# 1. 克隆仓库
git clone <repository-url>
cd shopping-assistant

# 2. 安装依赖
npm install

# 3. 设置 OCR 训练数据
npm run setup:ocr

# 4. 验证设置
npm test -- --testPathPattern="file-storage"
```

### CI/CD 环境

在 CI/CD 管道中添加：

```yaml
# GitHub Actions 示例
- name: Setup OCR Training Data
  run: npm run setup:ocr

# Docker 示例
RUN npm run setup:ocr
```

## 📁 文件管理

### .gitignore 配置

```gitignore
# Tesseract OCR training data files (large binary files)
*.traineddata
```

### 文件位置

```
project-root/
├── eng.traineddata          # 英文训练数据
├── chi_sim.traineddata      # 中文训练数据
├── scripts/
│   └── setup-ocr-data.js    # 自动下载脚本
└── src/mcp/servers/
    └── FileStorageMCPServer.ts  # OCR 使用代码
```

## 🧪 测试验证

### 验证 OCR 功能

```bash
# 运行文件存储相关测试
npm test -- --testPathPattern="file-storage"

# 运行属性测试
npm run test:pbt
```

### 测试不同语言配置

```typescript
// 测试英文识别
const result1 = await processImage(imageId, { language: 'eng' });

// 测试中文识别
const result2 = await processImage(imageId, { language: 'chi_sim' });

// 测试双语识别
const result3 = await processImage(imageId, { language: 'eng+chi_sim' });
```

## 🚨 故障排除

### 常见问题

1. **下载失败**
   ```bash
   # 检查网络连接
   curl -I https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata

   # 使用代理
   export https_proxy=http://proxy:port
   npm run setup:ocr
   ```

2. **文件损坏**
   ```bash
   # 删除损坏的文件重新下载
   rm *.traineddata
   npm run setup:ocr
   ```

3. **权限问题**
   ```bash
   # 检查文件权限
   ls -la *.traineddata

   # 修复权限
   chmod 644 *.traineddata
   ```

### 备用方案

如果无法下载训练数据文件：

1. **使用在线 OCR**: 集成 Google Vision API 或 Azure OCR
2. **Tesseract.js 自动下载**: 首次运行时自动下载（较慢）
3. **Docker 预构建**: 在 Docker 镜像中预装训练数据

## 📊 性能对比

| 方案 | 首次启动 | 离线使用 | 准确性 | 成本 |
|------|----------|----------|--------|------|
| 本地训练数据 | 快 | ✅ | 高 | 免费 |
| 在线 API | 快 | ❌ | 很高 | 付费 |
| 自动下载 | 慢 | ✅ | 高 | 免费 |

## 💡 最佳实践

1. **开发环境**: 使用本地训练数据文件
2. **生产环境**: 考虑使用专业 OCR 服务
3. **CI/CD**: 缓存训练数据文件以加速构建
4. **文档**: 在 README 中说明设置步骤
5. **监控**: 监控 OCR 识别准确率和性能
