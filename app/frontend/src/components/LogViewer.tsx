import { useState, useEffect } from 'react';
import { logger, type LogEntry, type LogLevel } from '../logger';

interface LogViewerProps {
  maxHeight?: string;
}

export function LogViewer({ maxHeight = '400px' }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLogs(logger.getLogs());
    }
  }, [isOpen]);

  const handleRefresh = () => {
    setLogs(logger.getLogs());
  };

  const handleClear = () => {
    logger.clearLogs();
    setLogs([]);
  };

  const handleExport = () => {
    const content = logger.exportLogs();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tunenote-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.level !== filter) return false;
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case 'error': return '#dc3545';
      case 'warn': return '#ffc107';
      case 'debug': return '#6c757d';
      default: return '#28a745';
    }
  };

  const getLevelBgColor = (level: LogLevel): string => {
    switch (level) {
      case 'error': return 'rgba(220, 53, 69, 0.1)';
      case 'warn': return 'rgba(255, 193, 7, 0.1)';
      case 'debug': return 'rgba(108, 117, 125, 0.1)';
      default: return 'rgba(40, 167, 69, 0.05)';
    }
  };

  return (
    <div className="log-viewer" style={{ position: 'fixed', bottom: '10px', right: '10px', zIndex: 1000 }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? '#666' : '#333',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        {isOpen ? '收起日志' : '📋 查看日志'} {logs.length > 0 && `(${logs.length})`}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            right: '0',
            width: '500px',
            maxHeight: maxHeight,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 12px',
              background: '#f5f5f5',
              borderBottom: '1px solid #ddd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as LogLevel | 'all')}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="all">全部</option>
                <option value="info">信息</option>
                <option value="warn">警告</option>
                <option value="error">错误</option>
                <option value="debug">调试</option>
              </select>
              <input
                type="text"
                placeholder="搜索日志..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', width: '120px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={handleRefresh} title="刷新" style={btnStyle}>🔄</button>
              <button onClick={handleClear} title="清空" style={btnStyle}>🗑️</button>
              <button onClick={handleExport} title="导出" style={btnStyle}>📥</button>
            </div>
          </div>

          {/* Log list */}
          <div
            style={{
              maxHeight: 'calc(400px - 50px)',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            {filteredLogs.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                暂无日志
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  style={{
                    padding: '6px 12px',
                    borderBottom: '1px solid #eee',
                    background: getLevelBgColor(log.level),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ color: '#999', fontSize: '10px' }}>{formatTime(log.timestamp)}</span>
                    <span
                      style={{
                        color: getLevelColor(log.level),
                        fontWeight: 'bold',
                        fontSize: '10px',
                      }}
                    >
                      [{log.level.toUpperCase()}]
                    </span>
                    <span style={{ color: '#666', fontSize: '10px' }}>[{log.category}]</span>
                  </div>
                  <div style={{ color: '#333', wordBreak: 'break-all' }}>{log.message}</div>
                  {log.data && (
                    <div
                      style={{
                        color: '#666',
                        fontSize: '11px',
                        marginTop: '2px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}
                    >
                      {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#e0e0e0',
  border: 'none',
  padding: '4px 8px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
};