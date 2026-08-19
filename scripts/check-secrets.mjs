#!/usr/bin/env node
// Blocks commits containing likely PHI (SSNs, MRN-shaped identifiers) or credential-shaped
// secrets (private keys, AWS-style keys) in staged files.
import { execSync } from "node:child_process";

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const MRN = /\bMRN[:\s#]*\d{6,10}\b/i;
const PRIVATE_KEY = /-----BEGIN (RSA |EC )?PRIVATE KEY-----/;
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;

const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/\.(png|jpg|jpeg|gif|ico|woff2?|ttf)$/i.test(f));

let blocked = false;

for (const file of staged) {
  let content;
  try {
    content = execSync(`git show :"${file}"`, { encoding: "utf8" });
  } catch {
    continue;
  }
  if (SSN.test(content) || MRN.test(content)) {
    console.error(`Possible PHI pattern (SSN/MRN) found in staged file: ${file}`);
    blocked = true;
  }
  if (PRIVATE_KEY.test(content) || AWS_KEY.test(content)) {
    console.error(`Possible credential/secret material found in staged file: ${file}`);
    blocked = true;
  }
}

if (blocked) {
  console.error("\nCommit blocked. Remove PHI-shaped values or secrets before committing.");
  process.exit(1);
}
