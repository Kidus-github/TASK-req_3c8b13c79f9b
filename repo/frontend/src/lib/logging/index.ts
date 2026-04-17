/**
 * Centralized Structured Logger
 *
 * Format: [module][action] message
 * Automatically redacts sensitive data (passwords, tokens, passphrases).
 * Intercepts all application events for audit trail.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'passwordSalt', 'passphrase',
  'confirmPassword', 'token', 'secret', 'ssn', 'creditCard',
]);

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function formatEntry(entry: LogEntry): string {
  const base = `[${entry.module}][${entry.action}] ${entry.message}`;
  if (entry.details && Object.keys(entry.details).length > 0) {
    return `${base} ${JSON.stringify(redactSensitive(entry.details))}`;
  }
  return base;
}

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 1000;

  log(level: LogLevel, module: string, action: string, message: string, details?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      action,
      message,
      details: details ? redactSensitive(details) : undefined,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    const formatted = formatEntry(entry);
    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        break; // suppress debug in production
      default:
        // info level logged silently to entries buffer only
        break;
    }
  }

  info(module: string, action: string, message: string, details?: Record<string, unknown>): void {
    this.log('info', module, action, message, details);
  }

  warn(module: string, action: string, message: string, details?: Record<string, unknown>): void {
    this.log('warn', module, action, message, details);
  }

  error(module: string, action: string, message: string, details?: Record<string, unknown>): void {
    this.log('error', module, action, message, details);
  }

  debug(module: string, action: string, message: string, details?: Record<string, unknown>): void {
    this.log('debug', module, action, message, details);
  }

  getEntries(level?: LogLevel): LogEntry[] {
    if (level) return this.entries.filter(e => e.level === level);
    return [...this.entries];
  }

  exportLogs(): string {
    return this.entries.map(e =>
      `${e.timestamp} [${e.level.toUpperCase()}] ${formatEntry(e)}`
    ).join('\n');
  }

  clear(): void {
    this.entries = [];
  }
}

export const logger = new Logger();
