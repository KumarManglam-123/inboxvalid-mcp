import { verifyEmail } from "../src/verify.js";

const samples = [
  "sarah.connor@gmail.com",
  "temp.user99@mailinator.com",
  "invalid-email-address@@",
  "contact@mysterious-startup-xyz.io"
];

async function main() {
  console.log("=== inboxvalid-mcp verification demo ===\n");
  for (const address of samples) {
    console.log(`Verifying: "${address}"`);
    const res = await verifyEmail(address);
    console.log(JSON.stringify(res, null, 2));
    console.log("\n----------------------------------------\n");
  }
}

main().catch(console.error);
