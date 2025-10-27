/**
 * 定时任务调度模块
 * 负责管理定时获取持仓数据和监控任务
 */
import * as schedule from 'node-schedule';
import axios from 'axios';
import { Logger } from 'winston';
import { PositionDataFetcher } from './position_fetcher';
import { TradeAnalyzer } from './trade_analyzer';
import { TelegramNotifier } from './telegram_notifier';

export class TradingMonitor {
  private apiUrl: string;
  private botToken: string;
  private chatId: string;
  private monitoredModels?: string[];
  private positionFetcher: PositionDataFetcher;
  private tradeAnalyzer: TradeAnalyzer;
  private notifier: TelegramNotifier;
  private logger: Logger;
  private job?: schedule.Job;
  private isFirstRun: boolean = true;

  constructor(
    apiUrl: string,
    botToken: string,
    chatId: string,
    logger: Logger,
    monitoredModels?: string[],
    saveHistoryData: boolean = false
  ) {
    this.apiUrl = apiUrl;
    this.botToken = botToken;
    this.chatId = chatId;
    this.monitoredModels = monitoredModels;
    this.logger = logger;

    // 初始化各个组件
    this.positionFetcher = new PositionDataFetcher(apiUrl, saveHistoryData, logger);
    this.tradeAnalyzer = new TradeAnalyzer(logger);
    this.notifier = new TelegramNotifier(botToken, chatId, logger);

    this.logger.info('交易监控器初始化完成');
  }

  /**
   * 监控任务主函数
   * 每分钟执行一次，获取持仓数据并分析变化
   */
  private async monitorTask(): Promise<void> {
    try {
      this.logger.info('开始执行监控任务');

      // 1. 获取当前持仓数据
      const currentData = await this.positionFetcher.fetchPositions();
      if (!currentData) {
        this.logger.info('获取持仓数据失败或为空，跳过本次监控');
        return;
      }

      // 2. 保存当前数据
      if (!this.positionFetcher.savePositions(currentData, 'current.json')) {
        this.logger.error('保存当前持仓数据失败');
        return;
      }

      // 3. 检查是否存在上次数据
      const lastData = this.positionFetcher.loadPositions('last.json');
      if (!lastData) {
        this.logger.info('首次运行，无历史数据可比较');
        
        // 首次运行，发送当前持仓报告
        if (this.isFirstRun) {
          await this.sendInitialPositionReport(currentData);
          this.isFirstRun = false;
        }
        
        // 将当前数据重命名为历史数据，为下次比较做准备
        this.positionFetcher.renameCurrentToLast();
        this.logger.info('监控任务执行完成（首次运行）');
        return;
      }

      // 4. 分析持仓变化
      this.logger.info(`开始分析持仓变化，上次数据包含 ${lastData.positions.length} 个模型`);
      this.logger.info(`当前数据包含 ${currentData.positions.length} 个模型`);

      const trades = this.tradeAnalyzer.analyzePositionChanges(
        lastData,
        currentData,
        this.monitoredModels
      );

      // 5. 如果有交易变化，发送通知
      if (trades.length > 0) {
        this.logger.info(`检测到 ${trades.length} 个交易变化，准备发送通知`);

        // 打印交易摘要到日志
        const summary = this.tradeAnalyzer.generateTradeSummary(trades);
        this.logger.info(`交易详情:\n${summary}`);

        // 发送通知
        if (await this.notifier.sendTradeNotification(trades)) {
          this.logger.info('交易通知发送成功');
        } else {
          this.logger.error('交易通知发送失败');
        }
      } else {
        this.logger.info('无交易变化');
      }

      // 6. 将当前数据重命名为历史数据（只有在成功处理数据后才重命名）
      this.positionFetcher.renameCurrentToLast();

      this.logger.info('监控任务执行完成');
    } catch (error) {
      this.logger.error(`执行监控任务时发生错误: ${error}`);
    }
  }

  /**
   * 开始监控
   * 启动定时任务并持续运行
   */
  async startMonitoring(): Promise<void> {
    this.logger.info('开始启动交易监控系统');

    // 发送启动通知
    try {
      const startupMessage = [
        '🚀 *AI交易监控系统启动*',
        '',
        `⏰ 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        `🔗 API地址: ${this.apiUrl}`,
        `👀 监控模型: ${this.monitoredModels && this.monitoredModels.length > 0 ? this.monitoredModels.join(', ') : '全部模型'}`,
        '',
        '✅ 系统已开始监控，将每分钟检查一次持仓变化'
      ].join('\n');

      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const messageData = {
        chat_id: this.chatId,
        text: startupMessage,
        parse_mode: 'Markdown'
      };

      const response = await axios.post(url, messageData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.data.ok) {
        this.logger.info('启动通知发送成功');
      } else {
        this.logger.warn('启动通知发送失败');
      }
    } catch (error) {
      this.logger.warn(`发送启动通知时发生错误: ${error}`);
    }

    // 设置定时任务 - 每分钟执行一次
    this.job = schedule.scheduleJob('*/1 * * * *', async () => {
      await this.monitorTask();
    });

    this.logger.info('定时任务已设置：每分钟执行一次监控');
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.job) {
      this.job.cancel();
      this.logger.info('监控系统已停止');
    }

    this.sendShutdownNotification().catch((error) => {
      this.logger.warn(`发送关闭通知失败: ${error}`);
    });
  }

  /**
   * 发送关闭通知
   */
  private async sendShutdownNotification(): Promise<void> {
    try {
      const shutdownMessage = [
        '🛑 *AI交易监控系统关闭*',
        '',
        `⏰ 关闭时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        '',
        '系统已安全关闭'
      ].join('\n');

      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const messageData = {
        chat_id: this.chatId,
        text: shutdownMessage,
        parse_mode: 'Markdown'
      };

      await axios.post(url, messageData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      this.logger.info('关闭通知发送成功');
    } catch (error) {
      this.logger.warn(`发送关闭通知时发生错误: ${error}`);
    }
  }

  /**
   * 发送错误通知
   * @param errorMessage 错误信息
   */
  async sendErrorNotification(errorMessage: string): Promise<void> {
    try {
      const errorNotification = [
        '❌ *AI交易监控系统错误*',
        '',
        `⏰ 错误时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        `🚨 错误信息: ${errorMessage}`,
        '',
        '请检查系统状态'
      ].join('\n');

      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const messageData = {
        chat_id: this.chatId,
        text: errorNotification,
        parse_mode: 'Markdown'
      };

      await axios.post(url, messageData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      this.logger.info('错误通知发送成功');
    } catch (error) {
      this.logger.error(`发送错误通知时发生错误: ${error}`);
    }
  }

  /**
   * 发送初始持仓报告
   */
  private async sendInitialPositionReport(data: any): Promise<void> {
    try {
      this.logger.info('生成初始持仓报告');
      
      const positions = data.positions || [];
      
      // 过滤监控的模型
      let filteredPositions = positions;
      if (this.monitoredModels && this.monitoredModels.length > 0) {
        filteredPositions = positions.filter((p: any) => 
          this.monitoredModels!.includes(p.id)
        );
      }
      
      if (filteredPositions.length === 0) {
        this.logger.info('没有监控的模型有持仓');
        return;
      }
      
      // 生成报告内容
      const contentLines = [
        '📊 *初始持仓报告*',
        '',
        `⏰ 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        `🤖 监控模型数: ${filteredPositions.length}`,
        ''
      ];
      
      for (const model of filteredPositions) {
        const modelId = model.id;
        const modelPositions = model.positions || {};
        const positionCount = Object.keys(modelPositions).length;
        
        const modelLink = `https://nof1.ai/models/${modelId}`;
        contentLines.push(`🤖 *${modelId}* [查看](${modelLink})`);
        
        if (positionCount === 0) {
          contentLines.push('  ℹ️ 暂无持仓');
        } else {
          contentLines.push(`  📈 持仓数: ${positionCount}`);
          
          for (const [symbol, pos] of Object.entries(modelPositions) as [string, any][]) {
            const quantity = pos.quantity || 0;
            const leverage = pos.leverage || 1;
            const entryPrice = pos.entry_price || 0;
            const currentPrice = pos.current_price || 0;
            const unrealizedPnl = pos.unrealized_pnl || 0;
            
            const direction = quantity > 0 ? '📈 多' : '📉 空';
            const pnlEmoji = unrealizedPnl >= 0 ? '💚' : '❤️';
            
            contentLines.push(`  ${direction} *${symbol}*`);
            contentLines.push(`    数量: ${Math.abs(quantity)} | 杠杆: ${leverage}x`);
            contentLines.push(`    进入: ${entryPrice.toFixed(2)} | 当前: ${currentPrice.toFixed(2)}`);
            contentLines.push(`    ${pnlEmoji} 浮盈: ${unrealizedPnl.toFixed(2)} USDT`);
          }
        }
        
        contentLines.push('');
      }
      
      contentLines.push('✅ 监控系统已启动，后续将监控持仓变化');
      
      const message = contentLines.join('\n');
      
      // 发送报告
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const messageData = {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      };
      
      const response = await axios.post(url, messageData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (response.data.ok) {
        this.logger.info('初始持仓报告发送成功');
      } else {
        this.logger.warn('初始持仓报告发送失败');
      }
    } catch (error) {
      this.logger.error(`发送初始持仓报告时发生错误: ${error}`);
    }
  }

  /**
   * 测试通知功能
   */
  async testNotification(): Promise<boolean> {
    this.logger.info('测试通知功能');
    return await this.notifier.sendTestMessage();
  }
}

