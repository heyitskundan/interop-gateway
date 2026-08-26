import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { SAMPLE_ADT_A01, SAMPLE_CDA_CCD } from "../src/samples.js";
import { translateToFhir } from "../src/translate.js";

describe("translateToFhir", () => {
  it("returns a formatted FHIR Bundle for a valid HL7v2 message", () => {
    const result = translateToFhir(SAMPLE_ADT_A01, "hl7v2");
    expect(result).toHaveProperty("output");
    if ("output" in result) {
      expect(JSON.parse(result.output).resourceType).toBe("Bundle");
    }
  });

  it("returns a formatted FHIR Bundle for a valid C-CDA document", () => {
    const result = translateToFhir(SAMPLE_CDA_CCD, "cda");
    expect(result).toHaveProperty("output");
    if ("output" in result) {
      expect(JSON.parse(result.output).resourceType).toBe("Bundle");
    }
  });

  it("returns an error message for invalid input instead of throwing", () => {
    const result = translateToFhir("not hl7v2 or cda", "hl7v2");
    expect(result).toHaveProperty("error");
  });
});

describe("App", () => {
  it("renders with the HL7v2 sample pre-filled and translates it on click", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByLabelText("HL7v2 input")).toHaveValue(SAMPLE_ADT_A01.replace(/\r/g, "\n"));

    await user.click(screen.getByRole("button", { name: "Translate" }));

    const output = document.getElementById("fhir-output")?.textContent ?? "";
    expect(output).toContain('"resourceType": "Bundle"');
  });

  it("switches to the C-CDA sample when that format is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("radio", { name: "C-CDA" }));

    expect(screen.getByLabelText("C-CDA XML input")).toHaveValue(
      SAMPLE_CDA_CCD.replace(/\r/g, "\n"),
    );

    await user.click(screen.getByRole("button", { name: "Translate" }));

    const output = document.getElementById("fhir-output")?.textContent ?? "";
    expect(output).toContain('"resourceType": "Bundle"');
  });

  it("shows an error alert instead of a crash when translation fails", async () => {
    const user = userEvent.setup();
    render(<App />);

    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "not hl7v2");
    await user.click(screen.getByRole("button", { name: "Translate" }));

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears the previous result when switching formats", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Translate" }));
    expect(document.getElementById("fhir-output")?.textContent).not.toBe("");

    await user.click(screen.getByRole("radio", { name: "C-CDA" }));

    expect(document.getElementById("fhir-output")?.textContent).toBe("");
  });
});
