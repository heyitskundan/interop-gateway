import { AwsClient } from "aws4fetch";
import { GatewayError, type SecretRef, type SecretsProvider } from "@interop-gateway/core";

export type SignedFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface AwsSecretsManagerProviderOptions {
  readonly region: string;
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
  };
  /** Overrides the signed-request sender. Defaults to an `aws4fetch` `AwsClient` built
   * from `region`/`credentials`. Inject a fake here to test without live AWS calls. */
  readonly fetcher?: SignedFetcher;
}

interface AwsErrorBody {
  readonly __type?: string;
  readonly message?: string;
  readonly Message?: string;
}

const RESOURCE_NOT_FOUND = "ResourceNotFoundException";

function awsErrorType(body: AwsErrorBody): string | undefined {
  return body.__type?.split("#").pop();
}

function awsError(action: string, status: number, body: AwsErrorBody): GatewayError {
  const detail = body.message ?? body.Message ?? awsErrorType(body) ?? `HTTP ${status}`;
  return new GatewayError(
    `AWS Secrets Manager ${action} failed: ${detail}`,
    "AWS_SM_REQUEST_FAILED",
  );
}

/** Wraps a caught error as `GatewayError`. If `error` isn't the `AwsRequestError` this
 * module throws (a real network/DNS failure, or the fetcher rejecting before a
 * `Response` exists), wraps its message directly instead of assuming an HTTP
 * status/body are present. */
function wrapCaughtError(action: string, error: unknown): GatewayError {
  if (error instanceof AwsRequestError) {
    return awsError(action, error.status, error.body);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new GatewayError(
    `AWS Secrets Manager ${action} failed: ${message}`,
    "AWS_SM_REQUEST_FAILED",
  );
}

class AwsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: AwsErrorBody,
  ) {
    super(`AWS request failed with HTTP ${status}`);
  }
}

/**
 * `SecretsProvider` backed by AWS Secrets Manager, talking to the service's JSON 1.1
 * API directly (via SigV4-signed requests from `aws4fetch`) rather than the full AWS
 * SDK, to keep this package's dependency footprint small.
 *
 * `setSecret` calls `PutSecretValue` first (the common case: the secret already
 * exists) and falls back to `CreateSecret` only on `ResourceNotFoundException`.
 * `deleteSecret` uses AWS's default 30-day recovery window rather than
 * `ForceDeleteWithoutRecovery`, so a delete is reversible unless the caller's Secrets
 * Manager policy overrides that default.
 */
export class AwsSecretsManagerProvider implements SecretsProvider {
  private readonly endpoint: string;
  private readonly fetcher: SignedFetcher;

  constructor(options: AwsSecretsManagerProviderOptions) {
    this.endpoint = `https://secretsmanager.${options.region}.amazonaws.com/`;
    this.fetcher =
      options.fetcher ??
      (() => {
        const client = new AwsClient({
          ...options.credentials,
          service: "secretsmanager",
          region: options.region,
        });
        return (url: string, init: RequestInit) => client.fetch(url, init);
      })();
  }

  private async request(target: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `secretsmanager.${target}`,
      },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new AwsRequestError(response.status, responseBody as AwsErrorBody);
    }
    return responseBody;
  }

  async getSecret(ref: SecretRef): Promise<string> {
    try {
      const result = (await this.request("GetSecretValue", { SecretId: ref.name })) as {
        SecretString?: string;
      };
      if (typeof result.SecretString !== "string") {
        throw new GatewayError(
          `AWS secret "${ref.name}" has no SecretString (binary secrets are not supported)`,
          "AWS_SM_SECRET_SHAPE_INVALID",
        );
      }
      return result.SecretString;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw wrapCaughtError("GetSecretValue", error);
    }
  }

  async setSecret(ref: SecretRef, value: string): Promise<void> {
    try {
      await this.request("PutSecretValue", { SecretId: ref.name, SecretString: value });
    } catch (error) {
      if (!(error instanceof AwsRequestError)) throw wrapCaughtError("PutSecretValue", error);
      if (awsErrorType(error.body) !== RESOURCE_NOT_FOUND) {
        throw awsError("PutSecretValue", error.status, error.body);
      }
      try {
        await this.request("CreateSecret", { Name: ref.name, SecretString: value });
      } catch (createError) {
        throw wrapCaughtError("CreateSecret", createError);
      }
    }
  }

  async deleteSecret(ref: SecretRef): Promise<void> {
    try {
      await this.request("DeleteSecret", { SecretId: ref.name });
    } catch (error) {
      throw wrapCaughtError("DeleteSecret", error);
    }
  }
}
