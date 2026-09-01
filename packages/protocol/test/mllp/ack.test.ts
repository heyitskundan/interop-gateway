import { describe, expect, it } from "vitest";
import { buildAck, extractAckCode, parseMshInfo } from "../../src/mllp/ack.js";

const SAMPLE_MESSAGE =
  "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC2|20260101120000||ADT^A01|MSG001|P|2.5\rEVN|A01";

describe("parseMshInfo", () => {
  it("reads sending/receiving app+facility and the control ID from MSH", () => {
    const info = parseMshInfo(SAMPLE_MESSAGE);
    expect(info).toEqual({
      sendingApp: "SENDER",
      sendingFacility: "FAC",
      receivingApp: "RECEIVER",
      receivingFacility: "FAC2",
      controlId: "MSG001",
    });
  });

  it("returns empty strings for a message with no MSH segment", () => {
    const info = parseMshInfo("PID|1||123");
    expect(info.controlId).toBe("");
  });
});

describe("buildAck", () => {
  it("swaps sender/receiver from the original message", () => {
    const ack = buildAck(SAMPLE_MESSAGE, "AA");
    const ackInfo = parseMshInfo(ack);
    expect(ackInfo.sendingApp).toBe("RECEIVER");
    expect(ackInfo.sendingFacility).toBe("FAC2");
    expect(ackInfo.receivingApp).toBe("SENDER");
    expect(ackInfo.receivingFacility).toBe("FAC");
  });

  it("sets MSA-1 to the given code and MSA-2 to the original control ID", () => {
    const ack = buildAck(SAMPLE_MESSAGE, "AE");
    const msaLine = ack.split("\r")[1]!;
    expect(msaLine).toBe("MSA|AE|MSG001");
  });

  it("appends an optional text message as MSA-3", () => {
    const ack = buildAck(SAMPLE_MESSAGE, "AR", "Unsupported message type");
    expect(ack.split("\r")[1]).toBe("MSA|AR|MSG001|Unsupported message type");
  });

  it("is itself extractable with extractAckCode", () => {
    const ack = buildAck(SAMPLE_MESSAGE, "AA");
    expect(extractAckCode(ack)).toBe("AA");
  });
});

describe("extractAckCode", () => {
  it("returns undefined for a message with no MSA segment", () => {
    expect(extractAckCode(SAMPLE_MESSAGE)).toBeUndefined();
  });

  it("returns undefined for an unrecognized code", () => {
    expect(extractAckCode("MSH|^~\\&|A|B|C|D||ACK|1|P|2.5\rMSA|ZZ|1")).toBeUndefined();
  });
});
