# 迁移指南：从 Python + 微信 到 Node.js + Telegram

本文档记录了项目从 Python 版本迁移到 Node.js + TypeScript 版本的过程。

## 主要变更

### 1. 技术栈迁移

**之前 (Python):**
- Python 3.7+
- requests (HTTP 客户端)
- schedule (定时任务)
- python-dotenv (环境变量)

**现在 (Node.js):**
- Node.js 16+ + TypeScript 5.3
- axios (HTTP 客户端)
- node-schedule (定时任务)
- dotenv (环境变量)
- winston (日志管理)

### 2. 通知系统变更

**之前:** 企业微信机器人
- 使用 Webhook URL
- Markdown 格式（企业微信语法）
- 环境变量: `WECHAT_WEBHOOK_URL`

**现在:** Telegram Bot
- 使用 Bot Token + Chat ID
- Markdown 格式（Telegram 语法）
- 环境变量: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### 3. 项目结构

**之前:**
```
project/
├── main.py
├── position_fetcher.py
├── trade_analyzer.py
├── wechat_notifier.py
├── trading_monitor.py
├── requirements.txt
└── start.sh
```

**现在:**
```
project/
├── src/
│   ├── main.ts
│   ├── position_fetcher.ts
│   ├── trade_analyzer.ts
│   ├── telegram_notifier.ts
│   ├── trading_monitor.ts
│   └── logger.ts
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── release.yml
│       └── docker.yml
├── package.json
├── tsconfig.json
├── Dockerfile
└── start.sh
```

## 配置变更

### 环境变量

**之前 (.env):**
```env
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
NOTIFICATION_TYPE=wechat
MONITORED_MODELS=
API_URL=https://nof1.ai/api/account-totals
LOG_LEVEL=INFO
SAVE_HISTORY_DATA=False
```

**现在 (.env):**
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
MONITORED_MODELS=
API_URL=https://nof1.ai/api/account-totals
LOG_LEVEL=INFO
SAVE_HISTORY_DATA=false
```

## 如何获取 Telegram 配置

### 1. 创建 Telegram Bot

1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令
3. 按提示设置 bot 名称和用户名
4. 获取 Bot Token

### 2. 获取 Chat ID

**方法一：使用 userinfobot**
1. 与你的 bot 对话或将 bot 添加到群组
2. 向 bot 发送任意消息
3. 访问 `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. 在 JSON 响应中找到 `chat.id`

**方法二：使用机器人**
1. 找到 [@userinfobot](https://t.me/userinfobot)
2. 发送任意消息获取你的 User ID
3. 对于群组，添加 [@RawDataBot](https://t.me/RawDataBot) 到群组获取 Chat ID

## 迁移步骤

### 对于现有用户

1. **备份数据**
   ```bash
   cp -r data data_backup
   cp current.json current.json.backup
   cp last.json last.json.backup
   ```

2. **更新代码**
   ```bash
   git pull origin main
   ```

3. **安装 Node.js 依赖**
   ```bash
   npm install
   ```

4. **更新配置文件**
   ```bash
   # 创建新的 .env 文件
   cp env.example .env
   # 编辑 .env，填入 Telegram 配置
   ```

5. **编译项目**
   ```bash
   npm run build
   ```

6. **测试通知**
   ```bash
   npm run test
   ```

7. **启动新系统**
   ```bash
   npm start
   # 或使用脚本
   ./start.sh
   ```

### 使用 Docker

最简单的方式是使用 Docker：

```bash
docker-compose up -d
```

或使用预构建镜像：

```bash
docker run -d \
  --name nof1-ai-monitor \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_CHAT_ID=your_chat_id \
  ghcr.io/okay456okay/nof1.ai.monitor:latest
```

## 功能对比

| 功能 | Python 版本 | Node.js 版本 | 说明 |
|------|------------|-------------|------|
| 定时监控 | ✅ | ✅ | 每分钟检查一次 |
| 持仓数据获取 | ✅ | ✅ | API 调用 |
| 交易变化分析 | ✅ | ✅ | 逻辑完全相同 |
| 通知推送 | 企业微信 | Telegram | 更灵活 |
| 日志管理 | 基础 | 增强 | Winston 日志轮转 |
| Docker 支持 | ❌ | ✅ | 新增 |
| GitHub Actions | ❌ | ✅ | CI/CD |
| TypeScript | ❌ | ✅ | 类型安全 |

## 已知差异

1. **日志格式**: Node.js 版本使用 Winston，日志格式更规范
2. **时间格式**: 使用 `toLocaleString('zh-CN')` 替代 Python 的 `strftime`
3. **启动方式**: 使用 `npm start` 或 `./start.sh` 替代 `python main.py`
4. **配置验证**: TypeScript 提供更好的类型检查

## 性能改进

- **启动速度**: Node.js 版本启动更快
- **内存占用**: 相比 Python 更轻量
- **并发处理**: 异步 I/O 性能更好

## 注意事项

1. **数据兼容**: `current.json` 和 `last.json` 格式保持兼容
2. **监控逻辑**: 交易检测逻辑完全一致
3. **时区**: 默认使用北京时间（Asia/Shanghai）

## 回滚方案

如果需要回到 Python 版本：

1. 停止 Node.js 版本
2. 恢复 Python 代码（从 git 历史）
3. 重新配置企业微信 Webhook
4. 启动 Python 版本

## 获取帮助

如有问题，请：
1. 查看 [README.md](README.md)
2. 检查日志文件 `logs/trading_monitor.log`
3. 提交 [GitHub Issue](https://github.com/okay456okay/nof1.ai.monitor/issues)

---

**迁移完成时间**: 2025年10月27日
**版本**: v2.0.0 (Node.js + TypeScript + Telegram)

