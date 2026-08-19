import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { SAMPLE_ADT_A01 } from "../src/samples.js";
import { translateHl7v2ToFhir } from "../src/translate.js";

describe("translateHl7v2ToFhir", () => {
  it("returns a formatted FHIR Bundle for a valid HL7v2 message", () => {
    const result = translateHl7v2ToFhir(SAMPLE_ADT_A01);
    expect(result).toHaveProperty("output");
    if ("output" in result) {
      expect(JSON.parse(result.output).resourceType).toBe("Bundle");
    }
  });

  it("returns an error message for invalid input instead of throwing", () => {
    const result = translateHl7v2ToFhir("not hl7v2");
    expect(result).toHaveProperty("error");
  });
});

describe("App", () => {
  it("renders with the sample message pre-filled and translates it on click", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByLabelText("HL7v2 input")).toHaveValue(SAMPLE_ADT_A01.replace(/\r/g, "\n"));

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
});
