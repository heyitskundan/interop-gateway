/** Wraps a payload with a correlation ID, a receipt timestamp, and a source label. */
export interface Envelope<T = unknown> {
  readonly correlationId: string;
  readonly receivedAt: string;
  readonly source: string;
  readonly payload: T;
}

export function createEnvelope<T>(payload: T, source: string): Envelope<T> {
  return {
    correlationId: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    source,
    payload,
  };
}

export function withPayload<T, U>(envelope: Envelope<T>, payload: U): Envelope<U> {
  return { ...envelope, payload };
}
