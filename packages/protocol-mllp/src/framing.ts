const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;
const END_MARKER = Buffer.from([FS, CR]);

export function frameMllp(message: string): Buffer {
  return Buffer.concat([Buffer.from([VT]), Buffer.from(message, "utf8"), END_MARKER]);
}

export interface UnframedMllp {
  readonly message: string;
  readonly rest: Buffer;
}

/** Extracts the first complete MLLP frame (VT...FS CR) from `buffer`, if one is present,
 * and returns the remaining unconsumed bytes. */
export function tryUnframeMllp(buffer: Buffer): UnframedMllp | undefined {
  const start = buffer.indexOf(VT);
  if (start === -1) return undefined;
  const endIndex = buffer.indexOf(END_MARKER, start);
  if (endIndex === -1) return undefined;
  return {
    message: buffer.subarray(start + 1, endIndex).toString("utf8"),
    rest: buffer.subarray(endIndex + END_MARKER.length),
  };
}
