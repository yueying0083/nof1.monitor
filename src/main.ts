#!/usr/bin/env node
/**
 * AI交易监控系统主程序
 * 监控AI大模型的加密货币交易行为，并在有变化时发送企业微信通知
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { setupLogging } from './logger';
import { TradingMonitor } from './trading_monitor';
import { TelegramBot } from './telegram_bot';

interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  telegramAdminIds?: string[];
  monitoredModels?: string[];
  apiUrl: string;
  logLevel: string;
  saveHistoryData: boolean;
}

/**
 * 加载配置文件
 */
function loadConfig(): Config {
  // 尝试加载.env文件
  const envFile = '.env';
  if (!fs.existsSync(envFile)) {
    console.log('警告: 未找到 .env 文件');
    console.log('请复制 env.example 为 .env 并配置正确的参数');
  }

  dotenv.config({ path: envFile });

  // 获取配置
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN 配置项不能为空');
  }

  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  if (!telegramChatId) {
    throw new Error('TELEGRAM_CHAT_ID 配置项不能为空');
  }

  const monitoredModelsStr = process.env.MONITORED_MODELS || '';
  let monitoredModels: string[] | undefined;
  if (monitoredModelsStr) {
    monitoredModels = monitoredModelsStr
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);
  }

  const adminIdsStr = process.env.TELEGRAM_ADMIN_IDS || '';
  let telegramAdminIds: string[] | undefined;
  if (adminIdsStr) {
    telegramAdminIds = adminIdsStr
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  }

  const config: Config = {
    telegramBotToken,
    telegramChatId,
    telegramAdminIds,
    monitoredModels,
    apiUrl: process.env.API_URL || 'https://nof1.ai/api/account-totals',
    logLevel: process.env.LOG_LEVEL || 'INFO',
    saveHistoryData: (process.env.SAVE_HISTORY_DATA || 'false').toLowerCase() === 'true'
  };

  return config;
}

/**
 * 解析命令行参数
 */
function parseArgs(): {
  test: boolean;
  botOnly: boolean;
  enableBot: boolean;
  logLevel: string;
  config?: string;
} {
  const args = process.argv.slice(2);
  const result = {
    test: false,
    botOnly: false,
    enableBot: false,
    logLevel: 'INFO',
    config: undefined as string | undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--test') {
      result.test = true;
    } else if (arg === '--bot-only') {
      result.botOnly = true;
      result.enableBot = true;
    } else if (arg === '--enable-bot') {
      result.enableBot = true;
    } else if (arg === '--log-level' && i + 1 < args.length) {
      result.logLevel = args[i + 1].toUpperCase();
      i++;
    } else if (arg === '--config' && i + 1 < args.length) {
      result.config = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
AI交易监控系统

使用方法:
  node dist/main.js [选项]

选项:
  --test              测试通知功能
  --enable-bot        启动监控系统并同时启用 Bot 交互功能
  --bot-only          只启动 Bot 功能，不启动自动监控
  --log-level LEVEL   设置日志级别 (DEBUG, INFO, WARNING, ERROR)
  --config PATH       指定配置文件路径
  -h, --help          显示帮助信息

Bot 使用说明:
  启动 Bot 后，可以在 Telegram 中使用以下命令：
  /report - 查看所有模型持仓报告
  /report <模型名> - 查看指定模型持仓
  /help - 查看帮助信息
`);
      process.exit(0);
    }
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  try {
    const args = parseArgs();

    // 设置日志
    const logger = setupLogging(args.logLevel);

    logger.info('AI交易监控系统启动');

    // 加载配置
    if (args.config) {
      process.env.DOTENV_PATH = args.config;
    }

    const config = loadConfig();

    logger.info('配置加载完成:');
    logger.info(`  API地址: ${config.apiUrl}`);
    logger.info(`  Telegram Chat ID: ${config.telegramChatId}`);
    logger.info(`  监控模型: ${config.monitoredModels && config.monitoredModels.length > 0 ? config.monitoredModels.join(', ') : '全部模型'}`);
    logger.info(`  日志级别: ${config.logLevel}`);
    logger.info(`  保存历史数据: ${config.saveHistoryData}`);

    // 创建监控器
    const monitor = new TradingMonitor(
      config.apiUrl,
      config.telegramBotToken,
      config.telegramChatId,
      logger,
      config.monitoredModels,
      config.saveHistoryData
    );

    // 测试模式
    if (args.test) {
      logger.info('运行测试模式');
      const success = await monitor.testNotification();
      if (success) {
        logger.info('测试通知发送成功');
        console.log('✅ 测试通知发送成功！请检查 Telegram 是否收到消息。');
      } else {
        logger.error('测试通知发送失败');
        console.log('❌ 测试通知发送失败！请检查配置是否正确。');
      }
      process.exit(0);
    }

    // Bot 模式
    if (args.botOnly) {
      logger.info('启动 Bot 模式（仅交互功能）');
      console.log('🤖 Telegram Bot 启动中...');
      console.log('📱 可以在 Telegram 中发送命令查询持仓');
      console.log('⏹️  按 Ctrl+C 停止 Bot');

      const bot = new TelegramBot(
        config.telegramBotToken,
        config.telegramChatId,
        config.apiUrl,
        logger,
        config.monitoredModels,
        config.telegramAdminIds
      );

      process.on('SIGINT', () => {
        console.log('\n👋 Bot 正在关闭...');
        bot.stop();
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      });

      process.on('SIGTERM', () => {
        logger.info('收到SIGTERM信号，关闭 Bot');
        bot.stop();
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      });

      await bot.start();

      // 保持进程运行
      await new Promise(() => {});
      return;
    }

    // 启动监控
    logger.info('开始启动监控系统...');
    console.log('🚀 AI交易监控系统已启动');
    console.log('📊 系统将每分钟检查一次持仓变化');
    console.log('📱 如有交易变化将发送 Telegram 通知');
    
    // 可选启动 Bot
    let bot: TelegramBot | null = null;
    if (args.enableBot) {
      console.log('🤖 同时启用 Telegram Bot 交互功能');
      bot = new TelegramBot(
        config.telegramBotToken,
        config.telegramChatId,
        config.apiUrl,
        logger,
        config.monitoredModels,
        config.telegramAdminIds
      );
      await bot.start();
    }
    
    console.log('⏹️  按 Ctrl+C 停止监控');

    // 处理进程退出信号
    process.on('SIGINT', () => {
      console.log('\n👋 监控系统正在关闭...');
      monitor.stopMonitoring();
      if (bot) {
        bot.stop();
      }
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });

    process.on('SIGTERM', () => {
      logger.info('收到SIGTERM信号，关闭监控系统');
      monitor.stopMonitoring();
      if (bot) {
        bot.stop();
      }
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });

    await monitor.startMonitoring();

    // 保持进程运行
    await new Promise(() => {});
  } catch (error) {
    console.error(`❌ 系统启动失败: ${error}`);
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('程序异常退出:', error);
  process.exit(1);
});

