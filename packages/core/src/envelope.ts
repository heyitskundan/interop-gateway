/**
 * Every ingested record is wrapped in an envelope before anything else touches it, so
 * it carries a correlation ID through the whole pipeline for audit purposes from the
 * moment it enters the system.
 */
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
