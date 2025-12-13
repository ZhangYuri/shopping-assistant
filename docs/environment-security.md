# 环境变量安全配置指南

# Environment Variables Security Guide

## 🔒 安全原则

### 1. 永远不要提交敏感信息到 Git

```bash
# ❌ 错误做法 - 硬编码在代码中
const config = {
    user: 'username',
    password: '123456',  // 永远不要这样做！
    database: 'shopping_assistant'
};

# ✅ 正确做法 - 使用环境变量
const config = {
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
};
```

### 2. 使用 .env 文件管理本地配置

```bash
# .env 文件（本地开发）
DATABASE_HOST=127.0.0.1
DATABASE_USER=username
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=shopping_assistant

# .env.example 文件（提交到Git）
DATABASE_HOST=127.0.0.1
DATABASE_USER=your_username
DATABASE_PASSWORD=your_password
DATABASE_NAME=shopping_assistant
```

## 📁 文件管理

### Git 忽略配置

确保 `.gitignore` 包含：

```gitignore
# Environment files - 包含敏感信息
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 但保留示例文件
!.env.example
```

### 文件权限

```bash
# 设置适当的文件权限
chmod 600 .env  # 只有所有者可读写
chmod 644 .env.example  # 所有人可读
```

## 🛠️ 开发环境设置

### 1. 快速设置

```bash
# 交互式设置（推荐）
npm run setup:env

# 检查配置
npm run check:env

# 测试数据库连接
npm run test:db-connection
```

### 2. 手动设置

```bash
# 复制模板
cp .env.example .env

# 编辑配置
nano .env  # 或使用你喜欢的编辑器
```

### 3. 团队协作

```bash
# 新团队成员设置流程
git clone <repository>
cd shopping-assistant
npm install
npm run setup:env  # 设置个人环境变量
npm run check:env   # 验证配置
npm test           # 运行测试
```

## 🏭 生产环境配置

### 1. 服务器环境变量

```bash
# 在服务器上设置环境变量
export DATABASE_HOST=prod-db-server.com
export DATABASE_USER=prod_user
export DATABASE_PASSWORD=super_secure_password
export DATABASE_NAME=shopping_assistant_prod

# 或使用 systemd 服务文件
[Service]
Environment=DATABASE_HOST=prod-db-server.com
Environment=DATABASE_USER=prod_user
Environment=DATABASE_PASSWORD=super_secure_password
```

### 2. Docker 配置

```dockerfile
# Dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 环境变量在运行时设置
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
    shopping-assistant:
        build: .
        environment:
            - DATABASE_HOST=db
            - DATABASE_USER=app_user
            - DATABASE_PASSWORD_FILE=/run/secrets/db_password
            - DATABASE_NAME=shopping_assistant
        secrets:
            - db_password
        depends_on:
            - db

    db:
        image: mysql:8.0
        environment:
            - MYSQL_ROOT_PASSWORD_FILE=/run/secrets/mysql_root_password
            - MYSQL_DATABASE=shopping_assistant
        secrets:
            - mysql_root_password

secrets:
    db_password:
        file: ./secrets/db_password.txt
    mysql_root_password:
        file: ./secrets/mysql_root_password.txt
```

### 3. 云平台配置

#### AWS

```bash
# 使用 AWS Systems Manager Parameter Store
aws ssm put-parameter \
    --name "/shopping-assistant/database/password" \
    --value "your_secure_password" \
    --type "SecureString"
```

#### Azure

```bash
# 使用 Azure Key Vault
az keyvault secret set \
    --vault-name "shopping-assistant-kv" \
    --name "database-password" \
    --value "your_secure_password"
```

## 🔐 密码安全最佳实践

### 1. 强密码要求

```bash
# 数据库密码应该：
- 至少 12 个字符
- 包含大小写字母、数字、特殊字符
- 不使用常见词汇或个人信息
- 定期更换

# 示例强密码生成
openssl rand -base64 32
```

### 2. 密钥管理

```bash
# API 密钥管理
- 使用专门的密钥管理服务
- 定期轮换密钥
- 限制密钥权限范围
- 监控密钥使用情况
```

## 🚨 安全检查清单

### 开发环境

- [ ] .env 文件在 .gitignore 中
- [ ] 没有硬编码的密码或密钥
- [ ] 使用强密码
- [ ] 定期更新依赖包

### 生产环境

- [ ] 使用环境变量或密钥管理服务
- [ ] 启用数据库 SSL 连接
- [ ] 限制数据库访问权限
- [ ] 启用审计日志
- [ ] 定期安全扫描

## 🔧 故障排除

### 常见问题

1. **环境变量未加载**

    ```bash
    # 确保在应用启动前加载
    require('dotenv').config();

    # 检查变量是否存在
    console.log('DB_HOST:', process.env.DATABASE_HOST);
    ```

2. **权限错误**

    ```bash
    # 检查文件权限
    ls -la .env

    # 修复权限
    chmod 600 .env
    ```

3. **连接失败**

    ```bash
    # 测试数据库连接
    npm run test:db-connection

    # 检查防火墙设置
    telnet 127.0.0.1 3306
    ```

## 📚 相关资源

- [OWASP 环境变量安全指南](https://owasp.org/www-community/vulnerabilities/Insecure_Storage_of_Sensitive_Information)
- [12-Factor App 配置原则](https://12factor.net/config)
- [Node.js 安全最佳实践](https://nodejs.org/en/docs/guides/security/)

## 🆘 紧急响应

如果意外提交了敏感信息：

```bash
# 1. 立即更改密码
# 2. 从 Git 历史中移除敏感信息
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# 3. 强制推送（谨慎使用）
git push origin --force --all

# 4. 通知团队成员重新克隆仓库
```
