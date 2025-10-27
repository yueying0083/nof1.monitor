# nof1.ai AI 交易监控系统

监控 [nof1.ai](https://nof1.ai/) Alpha Arena AI 大模型的加密货币交易行为，通过 Telegram Bot 实时推送交易变化通知。

## 快速开始

### 1. 创建 Telegram Bot

1. 在 Telegram 搜索 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 创建机器人
3. 获取 Bot Token（格式：`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`）

### 2. 获取 Chat ID

- **私聊模式**：与 bot 对话后访问 `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`，找到 `chat.id`
- **群组模式**：将 bot 加入群组后同样获取，Chat ID 通常为负数

### 3. 安装运行

```bash
# 克隆项目
git clone https://github.com/okay456okay/nof1.ai.monitor.git
cd nof1.ai.monitor

# 安装依赖
npm install

# 配置环境变量
cp env.example .env
# 编辑 .env 填入 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID

# 编译运行
npm run build
npm start
```

### 4. Docker 部署（推荐）

```bash
docker run -d \
  --name nof1-monitor \
  --restart unless-stopped \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e TELEGRAM_CHAT_ID=your_chat_id \
  -v $(pwd)/logs:/app/logs \
  ghcr.io/okay456okay/nof1.ai.monitor:latest
```

## 功能特性

- ⏱️  **定时监控**：每分钟自动检查持仓变化
- 📊 **初始报告**：启动时展示当前所有持仓详情（方向、杠杆、价格、浮盈）
- 🔔 **变化通知**：检测到交易变化时实时推送
- 🎯 **精准过滤**：支持指定监控特定模型
- 📝 **日志记录**：完整的操作日志

## 通知示例

**初始持仓报告：**
```
📊 初始持仓报告

⏰ 时间: 2025-10-27 18:00:00
🤖 监控模型数: 2

🤖 claude-sonnet-4-5 [查看](https://nof1.ai/models/claude-sonnet-4-5)
  📈 持仓数: 2
  📈 多 *BTC*
    数量: 0.5 | 杠杆: 10x
    进入: 65432.10 | 当前: 66100.50
    💚 浮盈: 334.20 USDT

✅ 监控系统已启动，后续将监控持仓变化
```

**交易变化通知：**
```
🚨 AI交易监控提醒
⏰ 时间: 2025-10-27 13:23:18
📊 检测到 1 个交易变化:

🤖 qwen3-max [查看持仓](https://nof1.ai/models/qwen3-max)
  🟢 qwen3-max ETH 新开仓: 买多 25.15 (杠杆: 25x, 进入: 4246.35, 当前: 4247.05)
```

## 环境变量配置

```env
# 必需配置
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# 可选配置
MONITORED_MODELS=                    # 空=监控所有模型，逗号分隔多个
API_URL=https://nof1.ai/api/account-totals
LOG_LEVEL=INFO                       # DEBUG/INFO/WARNING/ERROR
SAVE_HISTORY_DATA=false              # 是否保存历史数据
```

## 命令

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm start            # 启动监控
npm run test         # 测试 Telegram 通知
npm run dev          # 开发模式
./start.sh           # 使用启动脚本
```

## 监控逻辑

1. 每分钟获取一次持仓数据
2. 首次运行发送初始持仓报告
3. 对比上次数据，识别交易变化
4. 检测到变化时发送 Telegram 通知
5. 记录所有操作到日志文件

## 技术栈

- **运行时**：Node.js 16+
- **语言**：TypeScript 5.3
- **通知**：Telegram Bot API
- **日志**：Winston
- **调度**：node-schedule
- **容器**：Docker

## 项目结构

```
├── src/
│   ├── main.ts                # 主程序入口
│   ├── trading_monitor.ts     # 监控调度
│   ├── position_fetcher.ts    # 数据获取
│   ├── trade_analyzer.ts      # 交易分析
│   ├── telegram_notifier.ts   # Telegram 通知
│   └── logger.ts              # 日志配置
├── dist/                      # 编译输出
├── logs/                      # 日志文件
├── package.json               # 项目配置
├── tsconfig.json              # TS 配置
├── Dockerfile                 # Docker 镜像
└── .env                       # 环境变量（需自行创建）
```

## 常见问题

**Q: 收不到通知？**
- 检查 Token 和 Chat ID 是否正确
- 确认 bot 未被屏蔽
- 群组模式需确保 bot 在群组中

**Q: 如何停止监控？**
- 本地：按 `Ctrl+C`
- Docker：`docker stop nof1-monitor`

**Q: 如何查看日志？**
- 本地：`tail -f logs/trading_monitor.log`
- Docker：`docker logs -f nof1-monitor`

**Q: 如何重新发送初始报告？**
```bash
rm -f current.json last.json
npm start
```

## License

MIT License

## ⚠️ 免责声明

本项目仅供学习和研究使用，不构成投资建议。加密货币交易存在高风险，使用本系统的风险由用户自行承担。

## 联系方式

- GitHub Issues: [提交问题](https://github.com/okay456okay/nof1.ai.monitor/issues)
- Twitter: [@okay456okay](https://x.com/okay456okay)
- 微信公众号：远见拾贝
