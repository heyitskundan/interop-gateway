import { spawn } from "node:child_process";
import { GatewayError, type SecretRef, type SecretsProvider } from "@interop-gateway/core";

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `command` with `args` via `spawn` (no shell) and optionally writes `stdin` to
 * the child process before closing it. */
export type Executor = (
  command: string,
  args: readonly string[],
  stdin?: string,
) => Promise<ExecResult>;

/** Default `Executor`, implemented with `node:child_process.spawn`. */
export const defaultExecutor: Executor = (command, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args as string[], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      }
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });

export interface KeychainSecretsProviderOptions {
  /** Groups all of this package's secrets under one keychain "service" name. */
  readonly service?: string;
  readonly executor?: Executor;
  readonly platform?: NodeJS.Platform;
}

function unsupportedPlatform(platform: string): GatewayError {
  return new GatewayError(
    `secrets-keychain has no OS keychain integration for platform "${platform}" (supported: darwin, linux) — use secrets-vault or secrets-aws instead`,
    "KEYCHAIN_UNSUPPORTED_PLATFORM",
  );
}

function assertValidName(name: string): void {
  if (!name) {
    throw new GatewayError("SecretRef.name must be a non-empty string", "INVALID_SECRET_REF");
  }
}

/**
 * `SecretsProvider` backed by the local OS keychain: `security` on macOS, `secret-tool`
 * on Linux.
 *
 * On macOS, `security add-generic-password -w <value>` passes the secret as a process
 * argument, visible to other processes on the same machine via `ps`.
 */
export class KeychainSecretsProvider implements SecretsProvider {
  private readonly service: string;
  private readonly exec: Executor;
  private readonly platform: NodeJS.Platform;

  constructor(options: KeychainSecretsProviderOptions = {}) {
    this.service = options.service ?? "interop-gateway";
    this.exec = options.executor ?? defaultExecutor;
    this.platform = options.platform ?? process.platform;
  }

  async getSecret(ref: SecretRef): Promise<string> {
    assertValidName(ref.name);

    if (this.platform === "darwin") {
      try {
        const { stdout } = await this.exec("security", [
          "find-generic-password",
          "-a",
          ref.name,
          "-s",
          this.service,
          "-w",
        ]);
        return stdout.trim();
      } catch (cause) {
        throw new GatewayError(
          `Secret "${ref.name}" was not found in the macOS keychain (service "${this.service}")`,
          "SECRET_NOT_FOUND",
          undefined,
          cause,
        );
      }
    }

    if (this.platform === "linux") {
      try {
        const { stdout } = await this.exec("secret-tool", [
          "lookup",
          "service",
          this.service,
          "account",
          ref.name,
        ]);
        if (!stdout) {
          throw new Error("secret-tool returned no value");
        }
        return stdout.trim();
      } catch (cause) {
        throw new GatewayError(
          `Secret "${ref.name}" was not found in the Secret Service keyring (service "${this.service}")`,
          "SECRET_NOT_FOUND",
          undefined,
          cause,
        );
      }
    }

    throw unsupportedPlatform(this.platform);
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    assertValidName(ref.name);

    if (this.platform === "darwin") {
      await this.exec("security", [
        "add-generic-password",
        "-a",
        ref.name,
        "-s",
        this.service,
        "-w",
        value,
        "-U",
      ]);
      return;
    }

    if (this.platform === "linux") {
      await this.exec(
        "secret-tool",
        [
          "store",
          "--label",
          `${this.service}:${ref.name}`,
          "service",
          this.service,
          "account",
          ref.name,
        ],
        value,
      );
      return;
    }

    throw unsupportedPlatform(this.platform);
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    assertValidName(ref.name);

    if (this.platform === "darwin") {
      await this.exec("security", ["delete-generic-password", "-a", ref.name, "-s", this.service]);
      return;
    }

    if (this.platform === "linux") {
      await this.exec("secret-tool", ["clear", "service", this.service, "account", ref.name]);
      return;
    }

    throw unsupportedPlatform(this.platform);
  }
}
