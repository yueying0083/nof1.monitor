# 快速开始指南

## 5分钟快速部署

### 前置要求
- Node.js 16.0+ 
- Telegram 账号

### 第一步：获取 Telegram Bot Token

1. 在 Telegram 搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 创建机器人
3. 按提示设置名称，获得 Token（类似：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 第二步：获取 Chat ID

**私聊模式：**
1. 与你的 bot 对话，发送任意消息
2. 浏览器访问：`https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. 找到 `"chat":{"id":123456789` 中的数字

**群组模式：**
1. 将 bot 添加到群组
2. 在群组发送任意消息
3. 同样访问上述 URL，Chat ID 通常是负数（如 `-1001234567890`）

### 第三步：安装和配置

```bash
# 克隆项目
git clone https://github.com/okay456okay/nof1.ai.monitor.git
cd nof1.ai.monitor

# 安装依赖
npm install

# 配置环境变量
cp env.example .env
nano .env  # 或用你喜欢的编辑器

# 在 .env 文件中填入：
# TELEGRAM_BOT_TOKEN=你的_bot_token
# TELEGRAM_CHAT_ID=你的_chat_id
```

### 第四步：测试和运行

```bash
# 编译项目
npm run build

# 测试通知（推荐先测试）
npm run test

# 启动监控
npm start

# 或使用启动脚本
./start.sh
```

## Docker 快速部署（推荐）

```bash
# 创建 docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  monitor:
    image: ghcr.io/okay456okay/nof1.ai.monitor:latest
    container_name: nof1-ai-monitor
    restart: unless-stopped
    environment:
      - TELEGRAM_BOT_TOKEN=你的_token
      - TELEGRAM_CHAT_ID=你的_chat_id
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
EOF

# 启动
docker-compose up -d

# 查看日志
docker logs -f nof1-ai-monitor
```

## 验证运行

如果一切正常，你会看到：
1. 终端输出：`🚀 AI交易监控系统已启动`
2. Telegram 收到启动通知
3. 系统每分钟自动检查一次

## 常见问题

**Q: 收不到通知？**
- 检查 Token 和 Chat ID 是否正确
- 确认 bot 没有被屏蔽
- 群组模式需确保 bot 在群组中

**Q: API 连接失败？**
- 检查网络连接
- 确认防火墙设置

**Q: 如何停止监控？**
- 按 `Ctrl+C` 停止
- Docker: `docker-compose down`

## 下一步

- 📖 阅读完整文档：[README.md](README.md)
- 🔧 自定义配置：编辑 `.env` 文件
- 🚀 查看高级功能：[MIGRATION.md](MIGRATION.md)

---

**需要帮助？** 提交 [Issue](https://github.com/okay456okay/nof1.ai.monitor/issues)

