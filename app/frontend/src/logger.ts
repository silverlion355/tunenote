// Logger for TuneNote operations

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  log(level: LogLevel, category: string, message: string, data?: any) {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      level,
      category,
      message,
      data,
    };

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also output to console in development
    if (typeof console !== 'undefined') {
      const prefix = `[${this.formatTimestamp(entry.timestamp)}] [${category}]`;
      switch (level) {
        case 'error':
          console.error(prefix, message, data || '');
          break;
        case 'warn':
          console.warn(prefix, message, data || '');
          break;
        case 'debug':
          console.debug(prefix, message, data || '');
          break;
        default:
          console.log(prefix, message, data || '');
      }
    }
  }

  info(category: string, message: string, data?: any) {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    this.log('error', category, message, data);
  }

  debug(category: string, message: string, data?: any) {
    this.log('debug', category, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter(log => log.category === category);
  }

  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  exportLogs(): string {
    return this.logs.map(log => {
      let line = `${this.formatTimestamp(log.timestamp)} [${log.level.toUpperCase()}] [${log.category}] ${log.message}`;
      if (log.data) {
        try {
          line += `\n  Data: ${JSON.stringify(log.data)}`;
        } catch {
          line += `\n  Data: [unserializable]`;
        }
      }
      return line;
    }).join('\n');
  }
}

export const logger = new Logger();

// Helper functions for common logging scenarios
export function logAudioLoaded(fileName: string, fileSize: number, duration: number) {
  logger.info('Audio', `音频已加载: ${fileName}`, {
    fileName,
    fileSize: `${(fileSize / 1024).toFixed(1)} KB`,
    duration: `${duration.toFixed(1)}s`,
  });
}

export function logTranscriptionStart() {
  logger.info('Transcription', '开始旋律识别');
}

export function logTranscriptionStep(step: string) {
  logger.debug('Transcription', `步骤: ${step}`);
}

export function logTranscriptionComplete(notesCount: number, tempo: number, key: string) {
  logger.info('Transcription', `识别完成: 音符=${notesCount}, 速度=${tempo}, 调=${key}`, {
    notesCount,
    tempo,
    key,
  });
}

export function logTranscriptionError(error: string) {
  logger.error('Transcription', `识别失败: ${error}`);
}

export function logPitchDetected(midi: number, frequency: number, time: number) {
  logger.debug('Pitch', `检测到音高: MIDI=${midi}, 频率=${frequency.toFixed(1)}Hz, 时间=${time.toFixed(2)}s`);
}

export function logNoteSegment(startBeat: number, midi: number, duration: number) {
  logger.debug('Notes', `音符段落: start=${startBeat}, midi=${midi}, duration=${duration}`);
}

export function logPlaybackStart(notesCount: number) {
  logger.info('Playback', `开始播放生成旋律, 共${notesCount}个音符`);
}

export function logPlaybackComplete() {
  logger.info('Playback', '播放完成');
}

export function logAppError(context: string, error: Error | string) {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;
  logger.error('App', `错误 [${context}]: ${message}`, { stack });
}