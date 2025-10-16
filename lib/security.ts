import crypto from 'crypto';

const PII_HASH_SECRET = process.env.PII_HASH_SECRET || 'change-me-in-production';

/**
 * Hash PII data (emails, phone numbers) for privacy
 */
export function hashPii(value: string | null | undefined): string | null {
  if (!value) return null;

  return crypto
    .createHmac('sha256', PII_HASH_SECRET)
    .update(value.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Sanitize error messages to avoid leaking sensitive data
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Remove sensitive patterns
    return error.message
      .replace(/key=[^&\s]+/gi, 'key=***')
      .replace(/token=[^&\s]+/gi, 'token=***')
      .replace(/password=[^&\s]+/gi, 'password=***')
      .replace(/secret=[^&\s]+/gi, 'secret=***');
  }
  return 'An unknown error occurred';
}

/**
 * Verify HMAC signature for webhooks
 */
export function verifyHmac(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  try {
    const hash = crypto.createHmac(algorithm, secret).update(payload, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Verify Square webhook signature
 */
export function verifySquareSignature(
  payload: string,
  signature: string,
  webhookUrl: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    const content = webhookUrl + payload + timestamp;
    const hash = crypto.createHmac('sha256', secret).update(content, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Mask sensitive data in logs
 */
export function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...data };
  const sensitiveKeys = ['email', 'phone', 'password', 'token', 'key', 'secret', 'ssn', 'card'];

  Object.keys(masked).forEach((key) => {
    if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      const value = masked[key];
      if (typeof value === 'string' && value.length > 4) {
        masked[key] = '***' + value.slice(-4);
      } else {
        masked[key] = '***';
      }
    }
  });

  return masked;
}

