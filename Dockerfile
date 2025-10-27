# 使用官方 Node.js 镜像作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制 TypeScript 配置
COPY tsconfig.json ./

# 复制源代码
COPY src ./src

# 编译 TypeScript
RUN npm install typescript @types/node ts-node --save-dev && \
    npm run build && \
    npm uninstall typescript @types/node ts-node

# 创建日志和数据目录
RUN mkdir -p logs data

# 设置环境变量
ENV NODE_ENV=production

# 运行应用
CMD ["node", "dist/main.js"]

