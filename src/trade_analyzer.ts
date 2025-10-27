/**
 * 持仓变化检测和交易分析模块
 * 负责比较两次持仓数据，识别交易行为并生成交易报告
 */
import { Logger } from 'winston';
import { ConvertedData, PositionData } from './position_fetcher';

export interface Trade {
  type: string;
  model_id: string;
  symbol?: string;
  action?: string;
  quantity?: number;
  leverage?: number;
  entry_price?: number;
  current_price?: number;
  quantity_change?: number;
  last_quantity?: number;
  current_quantity?: number;
  last_leverage?: number;
  current_leverage?: number;
  last_entry_price?: number;
  current_entry_price?: number;
  last_current_price?: number;
  direction?: string;
  message: string;
  timestamp: string;
}

export class TradeAnalyzer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 分析持仓变化，识别交易行为
   */
  analyzePositionChanges(
    lastData: ConvertedData,
    currentData: ConvertedData,
    monitoredModels?: string[]
  ): Trade[] {
    const trades: Trade[] = [];

    try {
      // 获取模型列表
      const lastPositions = lastData.positions || [];
      const currentPositions = currentData.positions || [];

      this.logger.info(`上次数据包含 ${lastPositions.length} 个模型`);
      this.logger.info(`当前数据包含 ${currentPositions.length} 个模型`);

      // 创建模型字典便于查找
      const lastModels: { [id: string]: PositionData } = {};
      lastPositions.forEach(pos => {
        lastModels[pos.id] = pos;
      });

      const currentModels: { [id: string]: PositionData } = {};
      currentPositions.forEach(pos => {
        currentModels[pos.id] = pos;
      });

      this.logger.debug(`上次模型: ${Object.keys(lastModels)}`);
      this.logger.debug(`当前模型: ${Object.keys(currentModels)}`);

      // 确定要检查的模型
      let modelsToCheck = new Set([...Object.keys(lastModels), ...Object.keys(currentModels)]);
      if (monitoredModels && monitoredModels.length > 0) {
        this.logger.info(`监控模型列表: ${monitoredModels}`);
        modelsToCheck = new Set([...modelsToCheck].filter(id => monitoredModels.includes(id)));
      }

      this.logger.info(`开始分析 ${modelsToCheck.size} 个模型的持仓变化`);

      for (const modelId of modelsToCheck) {
        const lastModel = lastModels[modelId];
        const currentModel = currentModels[modelId];

        // 分析该模型的持仓变化
        const modelTrades = this.analyzeModelChanges(modelId, lastModel, currentModel);
        trades.push(...modelTrades);
      }

      this.logger.info(`检测到 ${trades.length} 个交易变化`);
      return trades;
    } catch (error) {
      this.logger.error(`分析持仓变化时发生错误: ${error}`);
      return [];
    }
  }

  /**
   * 分析单个模型的持仓变化
   */
  private analyzeModelChanges(
    modelId: string,
    lastModel?: PositionData,
    currentModel?: PositionData
  ): Trade[] {
    const trades: Trade[] = [];

    try {
      // 处理模型新增或删除的情况
      if (!lastModel && currentModel) {
        // 新模型出现
        trades.push({
          type: 'model_added',
          model_id: modelId,
          message: `新模型 ${modelId} 开始交易`,
          timestamp: new Date().toISOString()
        });
        return trades;
      }

      if (lastModel && !currentModel) {
        // 模型消失
        trades.push({
          type: 'model_removed',
          model_id: modelId,
          message: `模型 ${modelId} 停止交易`,
          timestamp: new Date().toISOString()
        });
        return trades;
      }

      if (!lastModel || !currentModel) {
        return trades;
      }

      // 分析具体持仓变化
      const lastPositions = lastModel.positions || {};
      const currentPositions = currentModel.positions || {};

      // 检查所有交易对
      const allSymbols = new Set([...Object.keys(lastPositions), ...Object.keys(currentPositions)]);

      for (const symbol of allSymbols) {
        const lastPos = lastPositions[symbol];
        const currentPos = currentPositions[symbol];

        const symbolTrades = this.analyzeSymbolChanges(modelId, symbol, lastPos, currentPos);
        trades.push(...symbolTrades);
      }

      return trades;
    } catch (error) {
      this.logger.error(`分析模型 ${modelId} 变化时发生错误: ${error}`);
      return [];
    }
  }

  /**
   * 分析单个交易对的持仓变化
   */
  private analyzeSymbolChanges(
    modelId: string,
    symbol: string,
    lastPos?: any,
    currentPos?: any
  ): Trade[] {
    const trades: Trade[] = [];

    try {
      // 处理持仓新增或删除的情况
      if (!lastPos && currentPos) {
        // 新开仓
        const quantity = currentPos.quantity || 0;
        const leverage = currentPos.leverage || 1;
        const entryPrice = currentPos.entry_price || 0;
        const currentPrice = currentPos.current_price || 0;

        // 判断买卖方向
        const direction = quantity > 0 ? '买多' : '卖空';

        trades.push({
          type: 'position_opened',
          model_id: modelId,
          symbol: symbol,
          action: direction,
          quantity: Math.abs(quantity),
          leverage: leverage,
          entry_price: entryPrice,
          current_price: currentPrice,
          message: `${modelId} ${symbol} 新开仓: ${direction} ${Math.abs(quantity)} (杠杆: ${leverage}x, 进入: ${entryPrice}, 当前: ${currentPrice})`,
          timestamp: new Date().toISOString()
        });
        return trades;
      }

      if (lastPos && !currentPos) {
        // 平仓
        const lastQuantity = lastPos.quantity || 0;
        const lastLeverage = lastPos.leverage || 1;
        const lastEntryPrice = lastPos.entry_price || 0;
        const lastCurrentPrice = lastPos.current_price || 0;

        // 判断原方向
        const direction = lastQuantity > 0 ? '买多' : '卖空';

        trades.push({
          type: 'position_closed',
          model_id: modelId,
          symbol: symbol,
          last_quantity: lastQuantity,
          last_leverage: lastLeverage,
          last_entry_price: lastEntryPrice,
          last_current_price: lastCurrentPrice,
          direction: direction,
          message: `${modelId} ${symbol} 已平仓 (${direction} ${Math.abs(lastQuantity)}, 杠杆: ${lastLeverage}x, 进入: ${lastEntryPrice}, 当前: ${lastCurrentPrice})`,
          timestamp: new Date().toISOString()
        });
        return trades;
      }

      if (!lastPos || !currentPos) {
        return trades;
      }

      // 比较持仓数量变化
      const lastQuantity = lastPos.quantity || 0;
      const currentQuantity = currentPos.quantity || 0;
      const lastLeverage = lastPos.leverage || 1;
      const currentLeverage = currentPos.leverage || 1;
      const lastEntryPrice = lastPos.entry_price || 0;
      const currentEntryPrice = currentPos.entry_price || 0;
      const currentPrice = currentPos.current_price || 0;

      // 检查是否有变化
      if (lastQuantity !== currentQuantity || lastLeverage !== currentLeverage) {
        const quantityChange = currentQuantity - lastQuantity;

        // 判断变化类型和方向
        let action: string;
        if (quantityChange > 0) {
          // 加仓
          action = currentQuantity > 0 ? '加仓买多' : '加仓卖空';
        } else if (quantityChange < 0) {
          // 减仓
          action = currentQuantity > 0 ? '减仓买多' : '减仓卖空';
        } else {
          // 杠杆变化但数量不变
          action = currentQuantity > 0 ? '调整买多杠杆' : '调整卖空杠杆';
        }

        trades.push({
          type: 'position_changed',
          model_id: modelId,
          symbol: symbol,
          action: action,
          quantity_change: Math.abs(quantityChange),
          last_quantity: lastQuantity,
          current_quantity: currentQuantity,
          last_leverage: lastLeverage,
          current_leverage: currentLeverage,
          last_entry_price: lastEntryPrice,
          current_entry_price: currentEntryPrice,
          current_price: currentPrice,
          message: this.formatTradeMessage(
            modelId,
            symbol,
            action,
            Math.abs(quantityChange),
            lastQuantity,
            currentQuantity,
            lastLeverage,
            currentLeverage,
            lastEntryPrice,
            currentEntryPrice,
            currentPrice
          ),
          timestamp: new Date().toISOString()
        });
      }

      return trades;
    } catch (error) {
      this.logger.error(`分析 ${modelId} ${symbol} 变化时发生错误: ${error}`);
      return [];
    }
  }

  /**
   * 格式化交易消息
   */
  private formatTradeMessage(
    modelId: string,
    symbol: string,
    action: string,
    quantityChange: number,
    lastQuantity: number,
    currentQuantity: number,
    lastLeverage: number,
    currentLeverage: number,
    lastEntryPrice: number,
    currentEntryPrice: number,
    currentPrice: number
  ): string {
    if (action.includes('调整')) {
      return `${modelId} ${symbol} ${action}: ${lastLeverage}x → ${currentLeverage}x (仓位: ${currentQuantity}, 进入: ${currentEntryPrice}, 当前: ${currentPrice})`;
    } else {
      return `${modelId} ${symbol} ${action} ${quantityChange}: ${lastQuantity} → ${currentQuantity} (杠杆: ${lastLeverage}x → ${currentLeverage}x, 进入: ${lastEntryPrice} → ${currentEntryPrice}, 当前: ${currentPrice})`;
    }
  }

  /**
   * 生成交易摘要
   */
  generateTradeSummary(trades: Trade[]): string {
    if (trades.length === 0) {
      return '暂无交易变化';
    }

    const summaryLines = [`检测到 ${trades.length} 个交易变化:`];

    for (const trade of trades) {
      summaryLines.push(`• ${trade.message}`);
    }

    return summaryLines.join('\n');
  }
}

