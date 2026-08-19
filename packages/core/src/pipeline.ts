import type { Envelope } from "./envelope.js";

export interface Stage<In = unknown, Out = unknown> {
  readonly name: string;
  run(envelope: Envelope<In>): Promise<Envelope<Out>>;
}

/** Runs a fixed sequence of stages, threading the envelope (and its correlation ID)
 * through each one unchanged except for its payload. */
export class Pipeline {
  constructor(private readonly stages: readonly Stage[]) {}

  async run(envelope: Envelope): Promise<Envelope> {
    let current = envelope;
    for (const stage of this.stages) {
      current = await stage.run(current);
    }
    return current;
  }
}
