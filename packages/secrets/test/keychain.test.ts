import { describe, expect, it, vi } from "vitest";
import { GatewayError } from "@interop-gateway/core";
import { defaultExecutor, KeychainSecretsProvider, type Executor } from "../src/keychain.js";

function fakeExecutor(
  impl: (command: string, args: readonly string[], stdin?: string) => string,
): Executor {
  return async (command, args, stdin) => ({ stdout: impl(command, args, stdin), stderr: "" });
}

describe("KeychainSecretsProvider on darwin", () => {
  it("getSecret runs `security find-generic-password -w` and trims the result", async () => {
    const executor = vi.fn(fakeExecutor(() => "top-secret-value\n"));
    const provider = new KeychainSecretsProvider({
      platform: "darwin",
      executor,
      service: "my-service",
    });

    const value = await provider.getSecret({ name: "epic-client-secret" });

    expect(value).toBe("top-secret-value");
    expect(executor).toHaveBeenCalledWith("security", [
      "find-generic-password",
      "-a",
      "epic-client-secret",
      "-s",
      "my-service",
      "-w",
    ]);
  });

  it("getSecret wraps a lookup failure in a GatewayError without leaking the underlying command output", async () => {
    const executor: Executor = async () => {
      throw new Error(
        "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
      );
    };
    const provider = new KeychainSecretsProvider({ platform: "darwin", executor });

    await expect(provider.getSecret({ name: "missing" })).rejects.toThrow(GatewayError);
    await expect(provider.getSecret({ name: "missing" })).rejects.toThrow(
      /not found in the macOS keychain/,
    );
  });

  it("setSecret passes the value via the -w argument with -U to update in place", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({
      platform: "darwin",
      executor,
      service: "my-service",
    });

    await provider.setSecret({ name: "epic-client-secret" }, "new-value");

    expect(executor).toHaveBeenCalledWith("security", [
      "add-generic-password",
      "-a",
      "epic-client-secret",
      "-s",
      "my-service",
      "-w",
      "new-value",
      "-U",
    ]);
  });

  it("deleteSecret runs `security delete-generic-password`", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({
      platform: "darwin",
      executor,
      service: "my-service",
    });

    await provider.deleteSecret({ name: "epic-client-secret" });

    expect(executor).toHaveBeenCalledWith("security", [
      "delete-generic-password",
      "-a",
      "epic-client-secret",
      "-s",
      "my-service",
    ]);
  });
});

describe("KeychainSecretsProvider on linux", () => {
  it("getSecret runs `secret-tool lookup`", async () => {
    const executor = vi.fn(fakeExecutor(() => "linux-secret-value"));
    const provider = new KeychainSecretsProvider({
      platform: "linux",
      executor,
      service: "my-service",
    });

    const value = await provider.getSecret({ name: "epic-client-secret" });

    expect(value).toBe("linux-secret-value");
    expect(executor).toHaveBeenCalledWith("secret-tool", [
      "lookup",
      "service",
      "my-service",
      "account",
      "epic-client-secret",
    ]);
  });

  it("setSecret writes the value over stdin rather than as a process argument", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({
      platform: "linux",
      executor,
      service: "my-service",
    });

    await provider.setSecret({ name: "epic-client-secret" }, "new-value");

    const [, args, stdin] = executor.mock.calls[0]!;
    expect(args).not.toContain("new-value");
    expect(stdin).toBe("new-value");
  });

  it("deleteSecret runs `secret-tool clear`", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({
      platform: "linux",
      executor,
      service: "my-service",
    });

    await provider.deleteSecret({ name: "epic-client-secret" });

    expect(executor).toHaveBeenCalledWith("secret-tool", [
      "clear",
      "service",
      "my-service",
      "account",
      "epic-client-secret",
    ]);
  });
});

describe("KeychainSecretsProvider linux getSecret edge case", () => {
  it("treats an empty lookup result as not-found rather than an empty secret", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({ platform: "linux", executor });

    await expect(provider.getSecret({ name: "x" })).rejects.toThrow(
      /not found in the Secret Service keyring/,
    );
  });
});

describe("KeychainSecretsProvider on an unsupported platform", () => {
  it("getSecret throws a clear GatewayError instead of attempting a command", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({ platform: "win32", executor });

    await expect(provider.getSecret({ name: "x" })).rejects.toThrow(/no OS keychain integration/);
    expect(executor).not.toHaveBeenCalled();
  });

  it("setSecret throws a clear GatewayError instead of attempting a command", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({ platform: "win32", executor });

    await expect(provider.setSecret({ name: "x" }, "v")).rejects.toThrow(
      /no OS keychain integration/,
    );
    expect(executor).not.toHaveBeenCalled();
  });

  it("deleteSecret throws a clear GatewayError instead of attempting a command", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({ platform: "win32", executor });

    await expect(provider.deleteSecret({ name: "x" })).rejects.toThrow(
      /no OS keychain integration/,
    );
    expect(executor).not.toHaveBeenCalled();
  });
});

describe("defaultExecutor (real child_process, no OS keychain involved)", () => {
  it("resolves with stdout on a zero exit code", async () => {
    const result = await defaultExecutor(process.execPath, ["-e", "process.stdout.write('hi')"]);
    expect(result.stdout).toBe("hi");
  });

  it("rejects with the process's stderr on a non-zero exit code", async () => {
    await expect(
      defaultExecutor(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(1)"]),
    ).rejects.toThrow("boom");
  });

  it("writes the given stdin to the child process", async () => {
    const result = await defaultExecutor(
      process.execPath,
      ["-e", "process.stdin.on('data', (d) => process.stdout.write(d))"],
      "piped-value",
    );
    expect(result.stdout).toBe("piped-value");
  });
});

describe("KeychainSecretsProvider validation", () => {
  it("rejects an empty secret name before running any command", async () => {
    const executor = vi.fn(fakeExecutor(() => ""));
    const provider = new KeychainSecretsProvider({ platform: "darwin", executor });

    await expect(provider.getSecret({ name: "" })).rejects.toThrow(GatewayError);
    expect(executor).not.toHaveBeenCalled();
  });
});
