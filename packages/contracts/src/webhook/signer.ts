import crypto from 'node:crypto';

export function signWebhookPayload(payload: string | object, secret: string): string {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(content).digest('hex');
  return `sha256=${signature}`;
}

export function verifyWebhookSignature(
  headerSignature: string,
  payload: string | object,
  secret: string,
): boolean {
  if (!headerSignature || !secret) {
    return false;
  }

  const expectedSignature = signWebhookPayload(payload, secret);

  try {
    const signatureBuffer = Buffer.from(headerSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
