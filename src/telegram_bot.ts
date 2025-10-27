/**
 * Telegram Bot 交互模块
 * 处理用户命令，提供实时持仓查询功能
 */
import axios from 'axios';
import { Logger } from 'winston';
import { PositionDataFetcher } from './position_fetcher';

export class TelegramBot {
  private botToken: string;
  private chatId: string;
  private adminIds: string[];
  private logger: Logger;
  private positionFetcher: PositionDataFetcher;
  private monitoredModels?: string[];
  private lastUpdateId: number = 0;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    botToken: string,
    chatId: string,
    apiUrl: string,
    logger: Logger,
    monitoredModels?: string[],
    adminIds?: string[]
  ) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.adminIds = adminIds || [];
    this.logger = logger;
    this.monitoredModels = monitoredModels;
    this.positionFetcher = new PositionDataFetcher(apiUrl, false, logger);
  }

  /**
   * 启动 Bot
   */
  async start(): Promise<void> {
    this.logger.info('启动 Telegram Bot...');
    this.isRunning = true;

    // 发送启动消息
    await this.sendMessage(
      '🤖 Bot 已启动！\n\n' +
      '可用命令：\n' +
      '/report - 查看所有模型持仓报告\n' +
      '/report <模型名> - 查看指定模型持仓\n' +
      '/help - 查看帮助信息'
    );

    // 开始轮询更新
    this.pollUpdates();
  }

  /**
   * 停止 Bot
   */
  stop(): void {
    this.logger.info('停止 Telegram Bot...');
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * 轮询获取消息更新
   */
  private async pollUpdates(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
      const response = await axios.get(url, {
        params: {
          offset: this.lastUpdateId + 1,
          timeout: 30,
          allowed_updates: ['message']
        },
        timeout: 35000
      });

      if (response.data.ok && response.data.result.length > 0) {
        for (const update of response.data.result) {
          this.lastUpdateId = update.update_id;
          await this.handleUpdate(update);
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`轮询更新失败: ${error.message}`);
      } else {
        this.logger.error(`轮询更新时发生错误: ${error}`);
      }
    }

    // 继续轮询
    this.pollInterval = setTimeout(() => this.pollUpdates(), 1000);
  }

  /**
   * 处理消息更新
   */
  private async handleUpdate(update: any): Promise<void> {
    const message = update.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id.toString();
    const userId = message.from?.id?.toString();
    const text = message.text.trim();

    this.logger.info(`收到消息: ${text} (来自用户 ${userId}, 聊天 ${chatId})`);

    // 权限检查：允许管理员列表中的用户，或者是配置的通知频道
    const isAdmin = this.adminIds.length > 0 && userId && this.adminIds.includes(userId);
    const isNotificationChat = chatId === this.chatId || `@${message.chat.username}` === this.chatId;
    
    if (!isAdmin && !isNotificationChat) {
      this.logger.warn(`拒绝未授权的访问: 用户 ${userId}, 聊天 ${chatId}`);
      await this.sendMessageToChat(chatId, '❌ 无权限访问此 Bot');
      return;
    }

    // 处理命令
    if (text.startsWith('/')) {
      await this.handleCommand(text, chatId);
    }
  }

  /**
   * 处理命令
   */
  private async handleCommand(command: string, chatId: string): Promise<void> {
    const parts = command.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    try {
      switch (cmd) {
        case '/start':
        case '/help':
          await this.handleHelpCommand(chatId);
          break;
        case '/report':
        case '/position':
          const modelName = parts.slice(1).join(' ');
          await this.handleReportCommand(chatId, modelName);
          break;
        default:
          await this.sendMessageToChat(
            chatId,
            `未知命令: ${cmd}\n\n使用 /help 查看可用命令`
          );
      }
    } catch (error) {
      this.logger.error(`处理命令失败: ${error}`);
      await this.sendMessageToChat(
        chatId,
        `❌ 处理命令时发生错误，请稍后重试`
      );
    }
  }

  /**
   * 处理帮助命令
   */
  private async handleHelpCommand(chatId: string): Promise<void> {
    const helpText = [
      '📖 Bot 使用帮助',
      '',
      '可用命令：',
      '/report - 查看所有监控模型的持仓报告',
      '/report <模型名> - 查看指定模型的持仓报告',
      '/help - 显示此帮助信息',
      '',
      '示例：',
      '/report',
      '/report deepseek-chat-v3.1',
      '/report qwen3-max',
      '',
      `当前监控的模型：${this.monitoredModels && this.monitoredModels.length > 0 ? this.monitoredModels.join(', ') : '全部模型'}`
    ].join('\n');

    await this.sendMessageToChat(chatId, helpText);
  }

  /**
   * 处理持仓报告命令
   */
  private async handleReportCommand(chatId: string, modelName?: string): Promise<void> {
    // 发送等待消息
    await this.sendMessageToChat(chatId, '⏳ 正在获取持仓数据，请稍候...');

    try {
      // 获取最新持仓数据
      const data = await this.positionFetcher.fetchPositions();
      if (!data) {
        await this.sendMessageToChat(chatId, '❌ 获取持仓数据失败');
        return;
      }

      const rawData = data.raw_data || {};
      const accountTotals = rawData.accountTotals || [];

      // 过滤监控的模型，并只保留最新的数据
      const latestModels: { [key: string]: any } = {};
      for (const account of accountTotals) {
        const modelId = account.model_id;
        
        // 如果指定了模型名，只返回该模型
        if (modelName && modelId !== modelName) {
          continue;
        }

        // 如果配置了监控列表，只返回监控的模型
        if (this.monitoredModels && this.monitoredModels.length > 0) {
          if (!this.monitoredModels.includes(modelId)) {
            continue;
          }
        }

        // 只保留最新的时间戳数据
        if (!latestModels[modelId] || account.timestamp > latestModels[modelId].timestamp) {
          latestModels[modelId] = account;
        }
      }

      const filteredModels = Object.values(latestModels);

      if (filteredModels.length === 0) {
        if (modelName) {
          await this.sendMessageToChat(chatId, `❌ 未找到模型: ${modelName}`);
        } else {
          await this.sendMessageToChat(chatId, '❌ 没有可显示的持仓数据');
        }
        return;
      }

      // 生成报告
      const report = this.generatePositionReport(filteredModels);
      await this.sendMessageToChat(chatId, report);
    } catch (error) {
      this.logger.error(`生成持仓报告失败: ${error}`);
      await this.sendMessageToChat(chatId, '❌ 生成报告时发生错误');
    }
  }

  /**
   * 生成持仓报告
   */
  private generatePositionReport(models: any[]): string {
    const contentLines = [
      '📊 实时持仓报告',
      '',
      `⏰ 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      `🤖 模型数: ${models.length}`,
      ''
    ];

    for (const model of models) {
      const modelId = model.model_id;
      const modelPositions = model.positions || {};
      const positionCount = Object.keys(modelPositions).length;
      const totalEquity = model.dollar_equity || 0;
      const totalUnrealizedPnl = model.total_unrealized_pnl || 0;
      const realizedPnl = model.realized_pnl || 0;

      const modelLink = `https://nof1.ai/models/${modelId}`;
      contentLines.push(`━━━━━━━━━━━━━━━━━`);
      contentLines.push(`🤖 ${modelId}`);
      contentLines.push(`🔗 ${modelLink}`);
      contentLines.push('');
      contentLines.push(`💰 总资产: $${totalEquity.toFixed(2)}`);
      contentLines.push(`📈 已实现盈亏: $${realizedPnl.toFixed(2)}`);

      if (positionCount === 0) {
        contentLines.push('');
        contentLines.push('ℹ️ 暂无持仓');
        contentLines.push(`💵 现金占比: 100.00%`);
      } else {
        const pnlEmoji = totalUnrealizedPnl >= 0 ? '💚' : '❤️';
        const pnlSign = totalUnrealizedPnl >= 0 ? '+' : '';
        contentLines.push(`${pnlEmoji} 浮动盈亏: ${pnlSign}${totalUnrealizedPnl.toFixed(2)}`);
        contentLines.push('');

        // 计算总保证金
        let totalMargin = 0;
        for (const pos of Object.values(modelPositions) as any[]) {
          totalMargin += pos.margin || 0;
        }

        const cashAmount = totalEquity - totalMargin;
        const cashRatio = (cashAmount / totalEquity) * 100;

        contentLines.push(`📊 持仓数量: ${positionCount}个`);
        contentLines.push(`💵 现金: $${cashAmount.toFixed(2)} (${cashRatio.toFixed(2)}%)`);
        contentLines.push('');

        // 按保证金占比排序
        const sortedPositions = Object.entries(modelPositions)
          .map(([symbol, pos]: [string, any]) => ({
            symbol,
            ...pos
          }))
          .sort((a: any, b: any) => (b.margin || 0) - (a.margin || 0));

        for (const pos of sortedPositions) {
          const symbol = pos.symbol;
          const quantity = pos.quantity || 0;
          const leverage = pos.leverage || 1;
          const currentPrice = pos.current_price || 0;
          const entryPrice = pos.entry_price || 0;
          const margin = pos.margin || 0;
          const unrealizedPnl = pos.unrealized_pnl || 0;

          // 计算名义价值和占比
          const notionalValue = Math.abs(quantity) * currentPrice;
          const marginRatio = (margin / totalEquity) * 100;
          const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice * 100) : 0;

          const direction = quantity > 0 ? '多' : '空';
          const directionEmoji = quantity > 0 ? '📈' : '📉';
          const pnlEmoji = unrealizedPnl >= 0 ? '💚' : '❤️';
          const pnlSign = unrealizedPnl >= 0 ? '+' : '';

          contentLines.push(`${directionEmoji} ${symbol} ${direction} ${leverage}x`);
          contentLines.push(`   持仓: ${Math.abs(quantity).toFixed(4)} ($${notionalValue.toFixed(2)})`);
          contentLines.push(`   价格: $${currentPrice.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(2)}%)`);
          contentLines.push(`   占比: ${marginRatio.toFixed(2)}% (保证金 $${margin.toFixed(2)})`);
          contentLines.push(`   ${pnlEmoji} 浮盈: ${pnlSign}${unrealizedPnl.toFixed(2)}`);
          contentLines.push('');
        }
      }

      contentLines.push('');
    }

    contentLines.push('━━━━━━━━━━━━━━━━━');

    let message = contentLines.join('\n');

    // 检查消息长度
    const MAX_LENGTH = 4000;
    if (message.length > MAX_LENGTH) {
      // 简化版本
      const simplifiedLines = [
        '📊 实时持仓报告（简化版）',
        '',
        `⏰ 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        `🤖 模型数: ${models.length}`,
        ''
      ];

      for (const model of models) {
        const modelId = model.model_id;
        const modelPositions = model.positions || {};
        const positionCount = Object.keys(modelPositions).length;
        const totalEquity = model.dollar_equity || 0;
        const totalUnrealizedPnl = model.total_unrealized_pnl || 0;
        const modelLink = `https://nof1.ai/models/${modelId}`;

        simplifiedLines.push(`━━━━━━━━━━━━━━━━━`);
        simplifiedLines.push(`🤖 ${modelId}`);
        simplifiedLines.push(`🔗 ${modelLink}`);
        simplifiedLines.push(`💰 总资产: $${totalEquity.toFixed(2)}`);

        if (positionCount > 0) {
          const pnlEmoji = totalUnrealizedPnl >= 0 ? '💚' : '❤️';
          const pnlSign = totalUnrealizedPnl >= 0 ? '+' : '';
          simplifiedLines.push(`${pnlEmoji} 浮盈: ${pnlSign}${totalUnrealizedPnl.toFixed(2)}`);

          let totalMargin = 0;
          for (const pos of Object.values(modelPositions) as any[]) {
            totalMargin += pos.margin || 0;
          }
          const cashAmount = totalEquity - totalMargin;
          const cashRatio = (cashAmount / totalEquity) * 100;

          simplifiedLines.push(`📊 持仓: ${positionCount}个`);
          simplifiedLines.push(`💵 现金: ${cashRatio.toFixed(2)}%`);

          const symbols = Object.keys(modelPositions).join(', ');
          simplifiedLines.push(`💼 币种: ${symbols}`);
        } else {
          simplifiedLines.push(`💵 现金占比: 100.00%`);
        }
        simplifiedLines.push('');
      }

      simplifiedLines.push('━━━━━━━━━━━━━━━━━');
      simplifiedLines.push('ℹ️ 详细信息请访问上方链接查看');

      message = simplifiedLines.join('\n');
    }

    return message;
  }

  /**
   * 发送消息到指定聊天
   */
  private async sendMessageToChat(chatId: string, text: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      return response.data.ok;
    } catch (error) {
      this.logger.error(`发送消息失败: ${error}`);
      return false;
    }
  }

  /**
   * 发送消息到配置的默认聊天
   */
  private async sendMessage(text: string): Promise<boolean> {
    return this.sendMessageToChat(this.chatId, text);
  }
}

