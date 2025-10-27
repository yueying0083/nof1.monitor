/**
 * 日志配置模块
 */
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 设置日志配置
 */
export function setupLogging(logLevel: string = 'INFO'): winston.Logger {
  // 创建日志目录
  const logDir = 'logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 配置日志格式
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()}: ${message}`;
    })
  );

  // 创建logger实例
  const logger = winston.createLogger({
    level: logLevel.toLowerCase(),
    format: logFormat,
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'trading_monitor.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} - ${level}: ${message}`;
          })
        )
      })
    ]
  });

  return logger;
}

