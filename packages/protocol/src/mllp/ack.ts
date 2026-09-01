import { randomUUID } from "node:crypto";

export type AckCode = "AA" | "AE" | "AR";

interface MshInfo {
  readonly sendingApp: string;
  readonly sendingFacility: string;
  readonly receivingApp: string;
  readonly receivingFacility: string;
  readonly controlId: string;
}

function splitSegments(message: string): string[] {
  return message.split(/\r\n|\r|\n/).filter(Boolean);
}

export function parseMshInfo(message: string): MshInfo {
  const msh = splitSegments(message)[0] ?? "";
  const fields = msh.split("|");
  return {
    sendingApp: fields[2] ?? "",
    sendingFacility: fields[3] ?? "",
    receivingApp: fields[4] ?? "",
    receivingFacility: fields[5] ?? "",
    controlId: fields[9] ?? "",
  };
}

/** Reads `MSA-1` from an ACK/NACK message. Returns `undefined` if the message has no
 * MSA segment. */
export function extractAckCode(ackMessage: string): AckCode | undefined {
  const msa = splitSegments(ackMessage).find((segment) => segment.startsWith("MSA|"));
  if (!msa) return undefined;
  const code = msa.split("|")[1];
  return code === "AA" || code === "AE" || code === "AR" ? code : undefined;
}

function formatHl7Timestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Builds an HL7v2 ACK message replying to `originalMessage`, swapping sender/receiver
 * from the original MSH and setting `MSA-1` to `code` and `MSA-2` to the original
 * message's control ID. */
export function buildAck(originalMessage: string, code: AckCode, textMessage?: string): string {
  const info = parseMshInfo(originalMessage);
  const timestamp = formatHl7Timestamp(new Date());
  const ackControlId = randomUUID();

  const msh = [
    "MSH",
    "^~\\&",
    info.receivingApp,
    info.receivingFacility,
    info.sendingApp,
    info.sendingFacility,
    timestamp,
    "",
    "ACK",
    ackControlId,
    "P",
    "2.5",
  ].join("|");

  const msaFields = ["MSA", code, info.controlId];
  if (textMessage) msaFields.push(textMessage);

  return [msh, msaFields.join("|")].join("\r");
}
