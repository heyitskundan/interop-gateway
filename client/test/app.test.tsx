import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { translate, TranslateError } from "../src/api.js";
import { SAMPLES } from "../src/samples.js";

beforeEach(() => {
  window.location.hash = "";
});

const hl7Sample = SAMPLES.find((s) => s.format === "hl7v2" && s.direction === "toFhir")!;
const cdaSample = SAMPLES.find((s) => s.format === "cda" && s.direction === "toFhir")!;
const hl7RoundtripSample = SAMPLES.find((s) => s.format === "hl7v2" && s.direction === "fromFhir")!;
const cdaRoundtripSample = SAMPLES.find((s) => s.format === "cda" && s.direction === "fromFhir")!;

describe("translate", () => {
  it("returns a FHIR Bundle with a mapping trail for a valid HL7v2 message", () => {
    const result = translate(hl7Sample.content, "hl7v2", "toFhir");
    expect(JSON.parse(result.translated).resourceType).toBe("Bundle");
    expect(result.mappings.length).toBeGreaterThan(0);
  });

  it("returns a FHIR Bundle with a mapping trail for a valid C-CDA document", () => {
    const result = translate(cdaSample.content, "cda", "toFhir");
    expect(JSON.parse(result.translated).resourceType).toBe("Bundle");
    expect(result.mappings.length).toBeGreaterThan(0);
  });

  it("translates a FHIR Bundle back to HL7v2", () => {
    const result = translate(hl7RoundtripSample.content, "hl7v2", "fromFhir");
    expect(result.translated).toContain("MSH");
  });

  it("translates a FHIR Bundle back to C-CDA XML", () => {
    const result = translate(cdaRoundtripSample.content, "cda", "fromFhir");
    expect(result.translated).toContain("<ClinicalDocument");
  });

  it("throws TranslateError for invalid HL7v2 input instead of a raw error", () => {
    expect(() => translate("not hl7v2", "hl7v2", "toFhir")).toThrow(TranslateError);
  });

  it("throws TranslateError for non-JSON input on the fromFhir direction", () => {
    expect(() => translate("not json", "cda", "fromFhir")).toThrow(TranslateError);
  });
});

describe("App", () => {
  it("renders the translator with HL7v2 selected by default", () => {
    render(<App />);
    expect(screen.getByRole("radio", { name: "HL7v2" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "HL7v2 → FHIR" })).toBeChecked();
  });

  it("loads a sample and translates it on click", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Load a sample"), hl7Sample.label);
    await user.click(screen.getByRole("button", { name: "Translate" }));

    const output = document.getElementById("fhir-output")?.textContent ?? "";
    expect(output).toContain("resourceType");
  });

  it("switches format and shows the matching direction labels", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "C-CDA" }));

    expect(screen.getByRole("radio", { name: "C-CDA → FHIR" })).toBeChecked();
  });

  it("shows an error alert instead of a crash when translation fails", async () => {
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "not hl7v2");
    await user.click(screen.getByRole("button", { name: "Translate" }));

    expect(screen.getByText("Translation failed")).toBeInTheDocument();
  });

  it("switches between Translator and Docs views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "Docs" }));

    expect(screen.getByRole("heading", { name: "Getting Started" })).toBeInTheDocument();
  });

  it("switches a code block's content between its JS and TS variants in place", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "Docs" }));

    expect(document.body.textContent).not.toContain("TranslateOptions");

    await user.click(screen.getAllByRole("tab", { name: "TS" })[0]!);

    expect(document.body.textContent).toContain("TranslateOptions");
  });

  it("shows the field-mapping trail when the Field Mappings tab is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("Load a sample"), hl7Sample.label);
    await user.click(screen.getByRole("button", { name: "Translate" }));
    await user.click(screen.getByRole("button", { name: /Field Mappings/ }));

    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
  });

  it("navigates to each docs page from the sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "Docs" }));

    await user.click(screen.getByRole("link", { name: "API Reference" }));
    expect(screen.getByRole("heading", { name: "API Reference" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Packages" }));
    expect(screen.getByRole("heading", { name: "The 13 packages" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "MCP" }));
    expect(screen.getByRole("heading", { name: "MCP server" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Advanced" }));
    expect(screen.getByRole("heading", { name: "Advanced" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Changelog" }));
    expect(screen.getByRole("heading", { name: "Changelog" })).toBeInTheDocument();
  });

  it("shows both install paths and all three tools on the MCP page", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "Docs" }));
    await user.click(screen.getByRole("link", { name: "MCP" }));

    const content = document.body.textContent ?? "";
    expect(content).toContain("npx @interop-gateway/mcp-server");
    expect(content).toContain("npm run build -w packages/mcp-server");
    expect(content).toContain("translate");
    expect(content).toContain("validateUsCore");
  });

  it("shows the core primitives and connector internals on the Advanced page", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: "Docs" }));
    await user.click(screen.getByRole("link", { name: "Advanced" }));

    const content = document.body.textContent ?? "";
    expect(content).toContain("createEnvelope");
    expect(content).toContain("EncryptedStore");
    expect(content).toContain("HashChainedAuditLog");
    expect(content).toContain("TokenManager");
    expect(content).toContain("classifyWriteFailureStatus");
  });

  it("toggles dark mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Toggle dark mode" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
