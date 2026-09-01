import { GatewayError } from "./errors.js";
import { validateStructural } from "./validate.js";

export type FormatName = "hl7v2" | "cda";

/** `value` is the FHIR bundle (object) for `toFhir()`, the serialized message/document
 * (string) for `fromFhir()`. `mappings`/`warnings` entries keep the shape each format's
 * own translator produces — HL7v2 and CDA mapping trails carry different fields, so this
 * only unifies the outer envelope, not the per-entry shape. */
export interface TranslationOutcome {
  readonly value: unknown;
  readonly mappings: readonly unknown[];
  readonly warnings: readonly unknown[];
}

/** Converts a raw message to a FHIR resource and back. */
export interface FormatPlugin {
  readonly name: FormatName;
  toFhir(input: string): TranslationOutcome;
  fromFhir(bundle: unknown): TranslationOutcome;
}

export type TranslateOptions =
  | { readonly from: FormatName; readonly to: "fhir" }
  | { readonly from: "fhir"; readonly to: FormatName };

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

  translate(input: string, options: TranslateOptions): TranslationOutcome {
    if (options.to === "fhir") {
      const structural = validateStructural(input);
      if (!structural.valid) {
        throw new GatewayError(
          `Structural validation failed: ${structural.issues.join("; ")}`,
          "STRUCTURAL_INVALID",
        );
      }
      return this.getPlugin(options.from).toFhir(input);
    }

    let bundle: unknown;
    try {
      bundle = JSON.parse(input);
    } catch (cause) {
      throw new GatewayError(
        'translate() from "fhir" expects a FHIR resource/Bundle serialized as a JSON string; the input did not parse as JSON',
        "FHIR_INPUT_INVALID",
        undefined,
        cause,
      );
    }
    return this.getPlugin(options.to).fromFhir(bundle);
  }

  private getPlugin(name: FormatName): FormatPlugin {
    const plugin = this.formats.get(name);
    if (!plugin) {
      throw new GatewayError(
        `No format plugin registered for "${name}" — did you pass it in InteropGatewayOptions.formats?`,
        "FORMAT_NOT_REGISTERED",
      );
    }
    return plugin;
  }
}
