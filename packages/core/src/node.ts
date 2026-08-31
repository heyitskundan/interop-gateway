// Node-only exports — anything here uses `node:fs`/`node:path` and must never be
// pulled into the main `@interop-gateway/core` entry point, which a browser bundle
// (this repo's own client docs site included) also imports. Import from
// `@interop-gateway/core/node` explicitly to use these.
export { FileStore } from "./file-store.js";
