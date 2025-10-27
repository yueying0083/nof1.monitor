#!/bin/bash

# AI交易监控系统启动脚本 (Node.js版本)

echo "🚀 启动 AI 交易监控系统..."

# 检查 Node.js 是否已安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 16.0 或更高版本"
    echo "访问 https://nodejs.org/ 下载安装"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ 错误: Node.js 版本过低，需要 16.0 或更高版本"
    echo "当前版本: $(node -v)"
    exit 1
fi

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次运行，正在安装依赖..."
    npm install
fi

# 检查是否已编译
if [ ! -d "dist" ]; then
    echo "🔨 正在编译 TypeScript..."
    npm run build
fi

# 检查 .env 文件是否存在
if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "📝 请复制 env.example 为 .env 并配置正确的参数："
    echo "   cp env.example .env"
    echo "   然后编辑 .env 文件填入你的 Telegram Bot Token 和 Chat ID"
    exit 1
fi

# 启动监控系统
echo "✅ 启动监控系统..."
node dist/main.js "$@"

