/**
 * Telegram 机器人通知模块
 * 负责发送交易变化通知到 Telegram 群组或频道
 */
import axios from 'axios';
import { Logger } from 'winston';
import { Trade } from './trade_analyzer';

export class TelegramNotifier {
  private botToken: string;
  private chatId: string;
  private logger: Logger;

  constructor(botToken: string, chatId: string, logger: Logger) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.logger = logger;
  }

  /**
   * 获取模型持仓页面链接
   */
  private getModelLink(modelId: string): string {
    return `https://nof1.ai/models/${modelId}`;
  }

  /**
   * 发送交易通知
   */
  async sendTradeNotification(trades: Trade[]): Promise<boolean> {
    if (trades.length === 0) {
      this.logger.info('无交易变化，跳过通知');
      return true;
    }

    try {
      // 生成通知内容
      const content = this.generateNotificationContent(trades);

      // 发送消息
      const success = await this.sendMessage(content);

      if (success) {
        this.logger.info(`成功发送交易通知，包含 ${trades.length} 个交易变化`);
      } else {
        this.logger.error('发送交易通知失败');
      }

      return success;
    } catch (error) {
      this.logger.error(`发送交易通知时发生错误: ${error}`);
      return false;
    }
  }

  /**
   * 生成通知内容（Markdown格式）
   */
  private generateNotificationContent(trades: Trade[]): string {
    // 标题
    const contentLines = [
      '🚨 *AI交易监控提醒*',
      '',
      `⏰ 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
      `📊 检测到 ${trades.length} 个交易变化:`,
      ''
    ];

    // 按模型分组显示交易
    const tradesByModel: { [modelId: string]: Trade[] } = {};
    for (const trade of trades) {
      const modelId = trade.model_id || 'unknown';
      if (!tradesByModel[modelId]) {
        tradesByModel[modelId] = [];
      }
      tradesByModel[modelId].push(trade);
    }

    // 生成每个模型的交易信息
    for (const [modelId, modelTrades] of Object.entries(tradesByModel)) {
      const modelLink = this.getModelLink(modelId);
      contentLines.push(`🤖 *${modelId}* [查看持仓](${modelLink})`);

      for (const trade of modelTrades) {
        const tradeType = trade.type || 'unknown';
        const message = trade.message || '';

        // 根据交易类型选择emoji
        let emoji: string;
        if (tradeType === 'position_opened') {
          emoji = '🟢';
        } else if (tradeType === 'position_closed') {
          emoji = '🔴';
        } else if (tradeType === 'position_changed') {
          const action = trade.action || '';
          if (action === '买入') {
            emoji = '📈';
          } else if (action === '卖出') {
            emoji = '📉';
          } else {
            emoji = '⚙️';
          }
        } else if (tradeType === 'model_added') {
          emoji = '🆕';
        } else if (tradeType === 'model_removed') {
          emoji = '❌';
        } else {
          emoji = 'ℹ️';
        }

        contentLines.push(`  ${emoji} ${this.escapeMarkdown(message)}`);
      }

      contentLines.push(''); // 空行分隔
    }

    return contentLines.join('\n');
  }

  /**
   * 转义 Telegram Markdown 特殊字符
   */
  private escapeMarkdown(text: string): string {
    // Telegram MarkdownV2 需要转义的字符
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    for (const char of specialChars) {
      escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
    }
    return escaped;
  }

  /**
   * 发送消息到 Telegram
   */
  private async sendMessage(content: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      // 构建消息数据
      const messageData = {
        chat_id: this.chatId,
        text: content,
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      };

      // 发送请求
      const response = await axios.post(url, messageData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      // 检查响应
      const result = response.data;

      if (result.ok) {
        this.logger.info('Telegram 消息发送成功');
        return true;
      } else {
        this.logger.error(`Telegram 消息发送失败: ${result.description || '未知错误'}`);
        return false;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`发送 Telegram 消息时网络错误: ${error.message}`);
        if (error.response) {
          this.logger.error(`响应数据: ${JSON.stringify(error.response.data)}`);
        }
      } else {
        this.logger.error(`发送 Telegram 消息时发生未知错误: ${error}`);
      }
      return false;
    }
  }

  /**
   * 发送测试消息
   */
  async sendTestMessage(): Promise<boolean> {
    try {
      const testContent = [
        '🧪 *AI交易监控系统测试*',
        '',
        '✅ 系统运行正常',
        `⏰ 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        '',
        '如果您收到此消息，说明通知功能配置正确！'
      ].join('\n');

      return await this.sendMessage(testContent);
    } catch (error) {
      this.logger.error(`发送测试消息时发生错误: ${error}`);
      return false;
    }
  }
}

