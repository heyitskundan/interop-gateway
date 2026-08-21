export type WriteOperation =
  | { readonly kind: "create"; readonly resourceType: string; readonly resource: unknown }
  | {
      readonly kind: "update";
      readonly resourceType: string;
      readonly id: string;
      readonly resource: unknown;
    }
  | { readonly kind: "delete"; readonly resourceType: string; readonly id: string };

export interface WriteSuccess {
  readonly ok: true;
  readonly status: number;
  readonly resource?: unknown;
}

export type WriteFailureCode = "CONFLICT" | "VALIDATION_FAILED" | "REQUEST_FAILED";

export interface WriteFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: WriteFailureCode;
  readonly path: string;
  readonly issues?: unknown;
}

export type WriteResult = WriteSuccess | WriteFailure;

export function classifyWriteFailureStatus(status: number): WriteFailureCode {
  if (status === 409 || status === 412) return "CONFLICT";
  if (status === 422) return "VALIDATION_FAILED";
  return "REQUEST_FAILED";
}
