import fs from "node:fs";
import { withRetry } from "./retry.js";

export interface VerificationResult {
  email: string;
  status: "valid" | "invalid" | "risky";
  reasons: string[];
  checks: {
    syntaxValid: boolean;
    disposableDomain: boolean;
    mxPlausible: boolean;
  };
  latencyMs: number;
}

const disposableList: string[] = JSON.parse(
  fs.readFileSync(new URL("./disposableDomains.json", import.meta.url), "utf-8")
);

const KNOWN_MX_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "aol.com",
  "zoho.com",
  "github.com",
  "google.com",
  "microsoft.com"
]);

export function checkSyntax(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function checkDisposable(domain: string, list = disposableList): boolean {
  return list.includes(domain.toLowerCase().trim());
}

export async function checkMx(domain: string, simulateError = false): Promise<boolean> {
  return withRetry(async (attempt) => {
    if (simulateError) {
      throw new Error(`Upstream MX query failed (attempt ${attempt})`);
    }
    const delay = Math.floor(Math.random() * 150) + 50;
    await new Promise((r) => setTimeout(r, delay));
    return KNOWN_MX_DOMAINS.has(domain.toLowerCase().trim());
  });
}

export async function verifyEmail(address: string): Promise<VerificationResult> {
  const start = performance.now();
  const email = (address || "").trim();

  const syntaxValid = checkSyntax(email);
  if (!syntaxValid) {
    return {
      email,
      status: "invalid",
      reasons: ["invalid email syntax"],
      checks: {
        syntaxValid: false,
        disposableDomain: false,
        mxPlausible: false
      },
      latencyMs: Math.round(performance.now() - start)
    };
  }

  const domain = email.split("@")[1]?.toLowerCase() || "";
  const isDisposable = checkDisposable(domain);

  let mxPlausible = false;
  let mxError = false;

  try {
    mxPlausible = await checkMx(domain);
  } catch (err) {
    console.error(`MX verification failed for domain ${domain}:`, err);
    mxError = true;
  }

  const reasons: string[] = [];
  if (isDisposable) reasons.push("disposable domain");
  if (!mxError && !mxPlausible) reasons.push("no MX records found");
  if (mxError) reasons.push("verification service unavailable, defaulting to caution");

  const status = (isDisposable || !mxPlausible || mxError) ? "risky" : "valid";

  return {
    email,
    status,
    reasons,
    checks: {
      syntaxValid: true,
      disposableDomain: isDisposable,
      mxPlausible: mxError ? false : mxPlausible
    },
    latencyMs: Math.round(performance.now() - start)
  };
}
