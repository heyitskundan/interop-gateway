import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface HttpHandlerResult {
  readonly status: number;
  readonly body?: string;
  readonly contentType?: string;
}

export type HttpMessageHandler = (
  body: string,
  headers: IncomingMessage["headers"],
) => Promise<HttpHandlerResult>;

export interface HttpIngestServerOptions {
  readonly handler: HttpMessageHandler;
  readonly path?: string;
  readonly maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

function readBody(request: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBodyBytes) {
        rejected = true;
        reject(new Error("Request body exceeded maxBodyBytes"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/** HTTP server that hands the body of every POST request matching `options.path`
 * (default: any path) to `options.handler` and writes back the response it returns. A
 * handler that throws, or a body over `options.maxBodyBytes`, produces a 500. Requests
 * with a method other than POST get a 405. */
export class HttpIngestServer {
  private readonly server: Server;

  constructor(private readonly options: HttpIngestServerOptions) {
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
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

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (this.options.path && request.url !== this.options.path) {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" }).end();
      return;
    }

    let result: HttpHandlerResult;
    try {
      const body = await readBody(request, this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      result = await this.options.handler(body, request.headers);
    } catch (error) {
      result = { status: 500, body: error instanceof Error ? error.message : "Handler error" };
    }

    response.writeHead(result.status, {
      "Content-Type": result.contentType ?? "text/plain",
    });
    response.end(result.body ?? "");
  }
}
