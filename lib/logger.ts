import { maskSensitiveData, sanitizeError } from './security';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(maskSensitiveData(context))}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    const errorMessage = error ? sanitizeError(error) : '';
    console.error(
      this.formatMessage('error', `${message}${errorMessage ? `: ${errorMessage}` : ''}`, context)
    );

    // In production, you might send this to a service like Sentry
    if (!this.isDevelopment && error instanceof Error) {
      // TODO: Send to error tracking service
      // Sentry.captureException(error, { extra: context });
    }
  }

  webhook(channel: string, event: string, success: boolean, details?: LogContext): void {
    const level = success ? 'info' : 'error';
    const message = `Webhook ${channel}/${event} ${success ? 'processed' : 'failed'}`;
    this[level](message, details);
  }

  sync(channel: string, type: string, status: 'started' | 'completed' | 'failed', count?: number): void {
    const message = `Sync ${channel}/${type} ${status}${count !== undefined ? ` (${count} records)` : ''}`;
    if (status === 'failed') {
      this.error(message);
    } else {
      this.info(message);
    }
  }
}

export const logger = new Logger();

