import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { verifyEmail } from "./verify.js";

const server = new McpServer({
  name: "inboxvalid-mcp",
  version: "1.0.0"
});

const VerificationResultSchema = z.object({
  email: z.string(),
  status: z.enum(["valid", "invalid", "risky"]),
  reasons: z.array(z.string()),
  checks: z.object({
    syntaxValid: z.boolean(),
    disposableDomain: z.boolean(),
    mxPlausible: z.boolean()
  }),
  latencyMs: z.number()
});

server.tool(
  "verify_email",
  "Verify email address syntax, disposable domain status, and MX plausibility",
  {
    address: z.string().describe("The email address to verify")
  },
  async ({ address }) => {
    const raw = await verifyEmail(address);
    const validated = VerificationResultSchema.parse(raw);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validated, null, 2)
        }
      ]
    };
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
