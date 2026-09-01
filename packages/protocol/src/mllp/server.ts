import { createServer, type Server, type Socket } from "node:net";
import { frameMllp, tryUnframeMllp } from "./framing.js";
import { buildAck, type AckCode } from "./ack.js";

export interface MllpHandlerResult {
  readonly code: AckCode;
  readonly textMessage?: string;
}

export type MllpMessageHandler = (message: string) => Promise<MllpHandlerResult>;

export interface MllpServerOptions {
  readonly handler: MllpMessageHandler;
}

/** TCP server that unframes incoming MLLP-wrapped messages, passes each one to
 * `handler`, and writes an ACK/NACK (built from `handler`'s result) back on the same
 * connection. A handler that throws produces an `AE` ACK. */
export class MllpServer {
  private readonly server: Server;

  constructor(private readonly options: MllpServerOptions) {
    this.server = createServer((socket) => this.handleConnection(socket));
  }

  listen(port: number, host = "0.0.0.0"): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(port, host, resolve);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  address(): { port: number; address: string } | undefined {
    const addr = this.server.address();
    return typeof addr === "object" && addr !== null
      ? { port: addr.port, address: addr.address }
      : undefined;
  }

  private handleConnection(socket: Socket): void {
    let buffer: Buffer = Buffer.alloc(0);
    // Chains each frame's processing onto the previous one, so ACKs are written in the
    // same order the frames arrived even if multiple frames land in one TCP chunk —
    // otherwise a faster handler for a later frame could write its ACK first.
    let chain: Promise<void> = Promise.resolve();
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      let unframed = tryUnframeMllp(buffer);
      while (unframed) {
        buffer = unframed.rest;
        const message = unframed.message;
        chain = chain.then(() => this.processMessage(message, socket));
        unframed = tryUnframeMllp(buffer);
      }
    });
  }

  private async processMessage(message: string, socket: Socket): Promise<void> {
    let result: MllpHandlerResult;
    try {
      result = await this.options.handler(message);
    } catch {
      result = { code: "AE", textMessage: "Handler error" };
    }
    const ack = buildAck(message, result.code, result.textMessage);
    socket.write(frameMllp(ack));
  }
}
