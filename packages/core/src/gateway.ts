import { GatewayError } from "./errors.js";
import { validateStructural } from "./validate.js";

export type FormatName = "hl7v2" | "cda";

/** Converts a raw message to a FHIR resource and back. */
export interface FormatPlugin {
  readonly name: FormatName;
  toFhir(input: string): unknown;
  fromFhir(bundle: unknown): string;
}

export interface TranslateOptions {
  readonly from: FormatName;
  readonly to: "fhir" | FormatName;
}

export interface InteropGatewayOptions {
  readonly formats?: readonly FormatPlugin[];
}

/** Registers format plugins and exposes `translate()`/`validate()`. */
export class InteropGateway {
  private readonly formats: Map<FormatName, FormatPlugin>;

  constructor(options: InteropGatewayOptions = {}) {
    this.formats = new Map((options.formats ?? []).map((plugin) => [plugin.name, plugin]));
  }

  validate(input: string) {
    return validateStructural(input);
  }

  translate(input: string, options: TranslateOptions): unknown {
    const structural = validateStructural(input);
    if (!structural.valid) {
      throw new GatewayError(
        `Structural validation failed: ${structural.issues.join("; ")}`,
        "STRUCTURAL_INVALID",
      );
    }

    const plugin = this.formats.get(options.from);
    if (!plugin) {
      throw new GatewayError(
        `No format plugin registered for "${options.from}" — did you pass it in InteropGatewayOptions.formats?`,
        "FORMAT_NOT_REGISTERED",
      );
    }

    if (options.to === "fhir") {
      return plugin.toFhir(input);
    }

    throw new GatewayError(
      `translate() only supports translating to "fhir" in this version; "${options.to}" is not yet wired up`,
      "FORMAT_NOT_REGISTERED",
    );
  }
}
