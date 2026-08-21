# @interop-gateway/protocol-mllp

MLLP (Minimal Lower Layer Protocol) receive and send for HL7v2 messages, for
[interop-gateway](https://github.com/heyitskundan/interop-gateway). MLLP is the TCP
transport most hospital HL7v2 feeds actually run over: each message is wrapped between
a start byte (`0x0B`) and an end sequence (`0x1C 0x0D`), and every send waits for the
receiver to acknowledge it with an ACK (`MSA-1 = AA`) or reject it with a NACK
(`AE`/`AR`).

## Install

```bash
npm install @interop-gateway/protocol-mllp
```

## Receive

```js
// JavaScript
import { MllpServer } from "@interop-gateway/protocol-mllp";

const server = new MllpServer({
  handler: async (message) => {
    // validate/route/translate `message` here
    return { code: "AA" };
  },
});
await server.listen(2575);
```

```ts
// TypeScript
import { MllpServer, type MllpHandlerResult } from "@interop-gateway/protocol-mllp";

const server = new MllpServer({
  handler: async (message: string): Promise<MllpHandlerResult> => ({ code: "AA" }),
});
await server.listen(2575);
```

A handler that throws produces an `AE` ACK automatically — the connection stays open
and the next message on it is still processed.

## Send

```js
import { sendMllpMessage } from "@interop-gateway/protocol-mllp";

const result = await sendMllpMessage(hl7v2Message, { host: "lab.example.org", port: 2575 });
if (!result.acknowledged) {
  console.error(`NACK (${result.code}): ${result.rawAck}`);
}
```

`sendMllpMessage` retries (default 3 attempts) on connection failure or ACK timeout —
never on a received NACK, which is a real response from the receiver, not a delivery
failure. After every attempt fails, it throws `GatewayError` with the underlying
connection error as `cause`.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
