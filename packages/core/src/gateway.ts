import { GatewayError } from "./errors.js";
import { validateStructural } from "./validate.js";

export type FormatName = "hl7v2" | "cda";

/** Converts a raw message to a FHIR resource and back. */
export interface FormatPlugin {
  readonly name: FormatName;
  toFhir(input: string): unknown;
  fromFhir(bundle: unknown): string;
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

  translate(input: string, options: TranslateOptions): unknown {
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
