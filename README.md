# inboxvalid-mcp

An MCP (Model Context Protocol) server built with TypeScript and Node.js that exposes a mock email verification tool (`verify_email`) over stdio transport.

---

## Getting Started

### Prerequisites
- Node.js 18+ (or 20+)
- npm 9+

### Installation & Build

```bash
# Clone or navigate to the directory
cd inboxvalid-mcp

# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run unit tests
npm test

# Run the console demo
npm run demo
```

### Starting the Server

```bash
npm start
# or directly: node dist/server.js
```

---

## Testing with the MCP Inspector

You can test `inboxvalid-mcp` interactively in the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

1. Open the inspector URL shown in the terminal (usually `http://localhost:5173` or similar).
2. Connect to the stdio transport.
3. Select `verify_email` from the Tools tab.
4. Provide an argument such as:
   ```json
   {
     "address": "user@gmail.com"
   }
   ```
5. Click **Run Tool** to inspect the structured response.

---

## Tool Interface: `verify_email`

### Input Schema
```json
{
  "address": "string (email address to verify)"
}
```

### Output Schema
```json
{
  "email": "user@gmail.com",
  "status": "valid",
  "reasons": [],
  "checks": {
    "syntaxValid": true,
    "disposableDomain": false,
    "mxPlausible": true
  },
  "latencyMs": 120
}
```

---

## Interface Design Choices

1. **Structured JSON vs Plain Text**:
   LLMs and agentic pipelines require predictable, machine-parseable outputs to make reliable branching decisions (e.g. asking the user for a new email vs proceeding with signup). Structured JSON prevents ambiguous text parsing errors.

2. **Three-State Status (`valid` | `invalid` | `risky`) instead of Binary (`valid` | `invalid`)**:
   Email verification in practice is probabilistic. Syntax failure is binary (`invalid`), but disposable domains or unverified MX servers don't always mean the inbox cannot receive mail—they signal elevated fraud or deliverability risk. A `risky` state allows consuming systems to decide custom business logic (e.g. challenge with 2FA, flag for manual review, or display a warning) rather than forcing an artificial pass/fail.

3. **Separated `checks` in Response**:
   Exposing granular flags (`syntaxValid`, `disposableDomain`, `mxPlausible`) alongside the high-level `status` and human-readable `reasons` lets downstream callers inspect exactly which rule triggered without reverse-engineering error messages.

---

## Error Handling & Retry/Backoff Reasoning

- **Fail-Fast Syntax Validation**: If email syntax fails regex checks, execution terminates immediately without triggering network operations or retry loops.
- **Exponential Backoff with Jitter**: Mock MX lookups are wrapped in a generic retry utility (`withRetry`) that attempts up to 3 times with exponential backoff (`baseDelay * 2^(attempt - 1)`) plus randomized jitter. Jitter prevents thundering herd issues under concurrent load.
- **Fail-Open vs Fail-Closed Strategy**:
  When external verification/MX lookup exhausts all retries, the server **fails open with caution**: instead of throwing an unhandled exception or returning `invalid`, it returns `status: "risky"` with reason `"verification service unavailable, defaulting to caution"`.
  - *Why*: Crashing the MCP tool breaks the agent's execution loop. Rejecting valid users because of a transient network blip causes false positives and bad UX. Flagging as `risky` keeps the pipeline resilient while alerting callers to proceed carefully.

---

## Assumptions

- **Mock Verification Engine**: Simulates network latency (50–200ms) and uses a deterministic list of known reputable mail providers (`gmail.com`, `outlook.com`, `yahoo.com`, `icloud.com`, `proton.me`, etc.) to provide reproducible demo results without live SMTP/DNS queries.
- **Static Disposable List**: Bundles a local `disposableDomains.json` file representing ~18 known temporary email services (`mailinator.com`, `10minutemail.com`, `yopmail.com`, etc.).
- **Transport**: Standard stdio transport for local integration with LLM hosts (Claude Desktop, MCP Inspector, etc.).

---

## Production Readiness Roadmap

To transition this server to production:

1. **Real DNS MX Resolution**:
   Replace mock MX logic with Node's native `node:dns/promises` (`dns.resolveMx(domain)`), inspecting record priority and fallback A records.
2. **Real-time Disposable & Fraud Feed**:
   Integrate with live disposable domain feeds or APIs (e.g. Kickbox, Debounce, or daily synchronized blocklists).
3. **Caching Layer**:
   Add an in-memory (LRU) or Redis cache keyed by domain to prevent redundant DNS lookups for popular domains (`gmail.com`, `outlook.com`), dramatically lowering latency and upstream traffic.
4. **SMTP Handshake / Mailbox Ping**:
   Optional RCPT TO verification with connection pooling and strict timeout handling where deliverability guarantees are critical.
5. **Rate Limiting & Concurrency Control**:
   Apply token bucket or leaky bucket rate limiting per client to guard upstream DNS resolvers and APIs.

---

## Scalability & Architecture

- **Stateless MCP Server**: The server maintains no local session state. Multiple worker processes can run behind load balancers or container orchestrators without coordination.
- **Shared Cache & Feed Storage**: In a distributed setup, domain MX cache and disposable lists move to Redis or an edge KV store (Cloudflare Workers KV, AWS ElastiCache) for real-time invalidation and synchronized updates.
- **Transport Flexibility**: While stdio is ideal for local desktop clients, the server logic is isolated from the transport layer and can be mounted over SSE (Server-Sent Events) or WebSockets for cloud-hosted agent deployments.
