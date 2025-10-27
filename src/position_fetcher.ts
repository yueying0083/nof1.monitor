/**
 * 持仓数据获取模块
 * 负责从API获取持仓数据并保存到本地文件
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from 'winston';

export interface PositionData {
  id: string;
  timestamp: number;
  realized_pnl: number;
  positions: {
    [symbol: string]: {
      symbol: string;
      quantity: number;
      leverage: number;
      entry_price: number;
      current_price: number;
      margin: number;
      unrealized_pnl: number;
      closed_pnl: number;
      risk_usd: number;
      confidence: number;
      entry_time: number;
      liquidation_price: number;
      commission: number;
      slippage: number;
      oid: number;
      entry_oid: number;
      tp_oid: number;
      sl_oid: number;
      wait_for_fill: boolean;
      index_col?: any;
      exit_plan: any;
    };
  };
}

export interface ConvertedData {
  positions: PositionData[];
  fetch_time: string;
  timestamp: number;
  raw_data: any;
}

export class PositionDataFetcher {
  private saveHistoryData: boolean;
  private logger: Logger;

  constructor(_apiUrl: string, saveHistoryData: boolean, logger: Logger) {
    this.saveHistoryData = saveHistoryData;
    this.logger = logger;
  }

  /**
   * 计算lastHourlyMarker参数
   * 基于当前时间与2025年10月18日6:00:00的时间差计算小时数
   */
  private calculateLastHourlyMarker(): number {
    try {
      // 基准时间：2025年10月18日6:00:00
      const baseTime = new Date('2025-10-18T06:00:00.000Z');
      const currentTime = new Date();

      // 计算时间差（秒）
      const timeDiffSeconds = (currentTime.getTime() - baseTime.getTime()) / 1000;

      // 转换为小时数
      const hourlyMarker = Math.floor(timeDiffSeconds / 3600);

      this.logger.debug(`计算lastHourlyMarker: ${hourlyMarker} (基准时间: ${baseTime.toISOString()}, 当前时间: ${currentTime.toISOString()})`);
      return hourlyMarker;
    } catch (error) {
      this.logger.error(`计算lastHourlyMarker失败: ${error}`);
      // 返回默认值
      return 129;
    }
  }

  /**
   * 保存数据到文件，文件名使用时间戳
   */
  saveDataToFile(data: any, dataDir: string = 'data'): string {
    try {
      // 创建数据目录
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.logger.info(`创建数据目录: ${dataDir}`);
      }

      // 生成时间戳文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = path.join(dataDir, `positions_${timestamp}.json`);

      // 保存数据
      fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');

      this.logger.info(`数据已保存到文件: ${filename}`);
      return filename;
    } catch (error) {
      this.logger.error(`保存数据到文件失败: ${error}`);
      return '';
    }
  }

  /**
   * 从API获取持仓数据
   */
  async fetchPositions(): Promise<ConvertedData | null> {
    try {
      // 计算lastHourlyMarker参数
      const hourlyMarker = this.calculateLastHourlyMarker();

      // 构建新的API URL
      const apiUrl = `https://nof1.ai/api/account-totals?lastHourlyMarker=${hourlyMarker}`;

      this.logger.info(`正在获取持仓数据: ${apiUrl}`);

      // 发送GET请求获取数据
      const response = await axios.get(apiUrl, { timeout: 60000 });
      const data = response.data;

      // 转换数据格式以保持向后兼容
      const convertedData = this.convertToLegacyFormat(data);

      // 如果转换后的数据为空，返回null
      if (convertedData === null) {
        this.logger.info('API返回空数据，跳过本次检测');
        return null;
      }

      this.logger.info(`成功获取持仓数据，包含 ${convertedData.positions.length} 个模型`);

      // 根据配置决定是否保存到data目录
      if (this.saveHistoryData) {
        this.logger.info('启用历史数据保存，保存数据到data目录');
        this.saveDataToFile(data, 'data');
      } else {
        this.logger.debug('未启用历史数据保存，跳过数据文件保存');
      }

      return convertedData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`获取持仓数据失败: ${error.message}`);
      } else {
        this.logger.error(`获取持仓数据时发生未知错误: ${error}`);
      }
      return null;
    }
  }

  /**
   * 将新的API数据格式转换为旧的格式以保持向后兼容
   */
  private convertToLegacyFormat(newData: any): ConvertedData | null {
    try {
      const accountTotals = newData.accountTotals || [];

      // 检查是否为空数据
      if (accountTotals.length === 0) {
        this.logger.warn('API返回空数据，跳过本次检测');
        return null;
      }

      const convertedPositions: PositionData[] = [];

      for (const account of accountTotals) {
        const modelId = account.model_id || 'unknown';
        const positions = account.positions || {};

        // 转换每个模型的持仓数据
        const convertedModel: PositionData = {
          id: modelId,
          timestamp: account.timestamp || 0,
          realized_pnl: account.realized_pnl || 0,
          positions: {}
        };

        // 转换每个交易对的持仓信息
        for (const [symbol, positionData] of Object.entries(positions) as [string, any][]) {
          convertedModel.positions[symbol] = {
            symbol: symbol,
            quantity: positionData.quantity || 0,
            leverage: positionData.leverage || 1,
            entry_price: positionData.entry_price || 0,
            current_price: positionData.current_price || 0,
            margin: positionData.margin || 0,
            unrealized_pnl: positionData.unrealized_pnl || 0,
            closed_pnl: positionData.closed_pnl || 0,
            risk_usd: positionData.risk_usd || 0,
            confidence: positionData.confidence || 0,
            entry_time: positionData.entry_time || 0,
            liquidation_price: positionData.liquidation_price || 0,
            commission: positionData.commission || 0,
            slippage: positionData.slippage || 0,
            oid: positionData.oid || 0,
            entry_oid: positionData.entry_oid || 0,
            tp_oid: positionData.tp_oid !== undefined ? positionData.tp_oid : -1,
            sl_oid: positionData.sl_oid !== undefined ? positionData.sl_oid : -1,
            wait_for_fill: positionData.wait_for_fill || false,
            index_col: positionData.index_col,
            exit_plan: positionData.exit_plan || {}
          };
        }

        convertedPositions.push(convertedModel);
      }

      // 返回兼容的格式
      return {
        positions: convertedPositions,
        fetch_time: new Date().toISOString(),
        timestamp: Date.now(),
        raw_data: newData
      };
    } catch (error) {
      this.logger.error(`转换数据格式失败: ${error}`);
      // 返回空数据
      return {
        positions: [],
        fetch_time: new Date().toISOString(),
        timestamp: Date.now(),
        raw_data: newData
      };
    }
  }

  /**
   * 保存持仓数据到文件
   */
  savePositions(data: ConvertedData, filename: string = 'current.json'): boolean {
    try {
      // 添加保存时间戳
      const dataWithTimestamp = {
        ...data,
        fetch_time: new Date().toISOString(),
        timestamp: Date.now()
      };

      fs.writeFileSync(filename, JSON.stringify(dataWithTimestamp, null, 2), 'utf-8');

      this.logger.info(`持仓数据已保存到 ${filename}`);
      return true;
    } catch (error) {
      this.logger.error(`保存持仓数据失败: ${error}`);
      return false;
    }
  }

  /**
   * 从文件加载持仓数据
   */
  loadPositions(filename: string): ConvertedData | null {
    try {
      if (!fs.existsSync(filename)) {
        this.logger.warn(`文件 ${filename} 不存在`);
        return null;
      }

      const data = fs.readFileSync(filename, 'utf-8');
      const parsedData = JSON.parse(data);

      this.logger.info(`成功加载持仓数据: ${filename}`);
      return parsedData;
    } catch (error) {
      this.logger.error(`加载持仓数据失败: ${error}`);
      return null;
    }
  }

  /**
   * 将current.json重命名为last.json
   */
  renameCurrentToLast(): boolean {
    try {
      if (fs.existsSync('current.json')) {
        if (fs.existsSync('last.json')) {
          fs.unlinkSync('last.json'); // 删除旧的last.json
        }

        fs.renameSync('current.json', 'last.json');
        this.logger.info('current.json 已重命名为 last.json');
        return true;
      } else {
        this.logger.warn('current.json 文件不存在，无法重命名');
        return false;
      }
    } catch (error) {
      this.logger.error(`重命名文件失败: ${error}`);
      return false;
    }
  }
}

