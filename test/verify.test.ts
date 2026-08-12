import { describe, it, expect } from "vitest";
import { checkSyntax, checkDisposable, checkMx, verifyEmail } from "../src/verify.js";
import { withRetry } from "../src/retry.js";

describe("syntax check", () => {
  it("accepts valid email format", () => {
    expect(checkSyntax("alex@gmail.com")).toBe(true);
    expect(checkSyntax("user.name+tag@sub.example.com")).toBe(true);
  });

  it("rejects malformed email format", () => {
    expect(checkSyntax("plainaddress")).toBe(false);
    expect(checkSyntax("@missinguser.com")).toBe(false);
    expect(checkSyntax("user@nodot")).toBe(false);
    expect(checkSyntax("")).toBe(false);
  });
});

describe("disposable domain check", () => {
  it("flags known disposable domains", () => {
    expect(checkDisposable("mailinator.com")).toBe(true);
    expect(checkDisposable("tempmail.com")).toBe(true);
    expect(checkDisposable("10minutemail.com")).toBe(true);
  });

  it("passes legitimate domains", () => {
    expect(checkDisposable("gmail.com")).toBe(false);
    expect(checkDisposable("outlook.com")).toBe(false);
  });
});

describe("mx check", () => {
  it("resolves true for known domains", async () => {
    const res = await checkMx("gmail.com");
    expect(res).toBe(true);
  });

  it("resolves false for unknown domains", async () => {
    const res = await checkMx("unknown-fake-domain-12345.xyz");
    expect(res).toBe(false);
  });
});

describe("retry helper", () => {
  it("succeeds on first attempt", async () => {
    const res = await withRetry(async () => 42, 3, 10);
    expect(res).toBe(42);
  });

  it("retries and succeeds on subsequent attempt", async () => {
    let calls = 0;
    const res = await withRetry(async () => {
      calls++;
      if (calls < 2) throw new Error("temporary error");
      return "recovered";
    }, 3, 10);
    expect(res).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("throws after exhausting max retries", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("permanent failure");
      }, 3, 10)
    ).rejects.toThrow("permanent failure");
    expect(calls).toBe(3);
  });
});

describe("verifyEmail combined logic", () => {
  it("returns valid status for standard email", async () => {
    const res = await verifyEmail("test.user@gmail.com");
    expect(res.status).toBe("valid");
    expect(res.reasons).toEqual([]);
    expect(res.checks.syntaxValid).toBe(true);
    expect(res.checks.disposableDomain).toBe(false);
    expect(res.checks.mxPlausible).toBe(true);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns invalid status for malformed syntax", async () => {
    const res = await verifyEmail("not-an-email");
    expect(res.status).toBe("invalid");
    expect(res.reasons).toContain("invalid email syntax");
    expect(res.checks.syntaxValid).toBe(false);
    expect(res.checks.disposableDomain).toBe(false);
    expect(res.checks.mxPlausible).toBe(false);
  });

  it("returns risky status for disposable domain", async () => {
    const res = await verifyEmail("burner@mailinator.com");
    expect(res.status).toBe("risky");
    expect(res.reasons).toContain("disposable domain");
    expect(res.checks.syntaxValid).toBe(true);
    expect(res.checks.disposableDomain).toBe(true);
  });

  it("returns risky status for unknown mx domain", async () => {
    const res = await verifyEmail("user@unregistered-host-domain.org");
    expect(res.status).toBe("risky");
    expect(res.reasons).toContain("no MX records found");
    expect(res.checks.syntaxValid).toBe(true);
    expect(res.checks.mxPlausible).toBe(false);
  });
});
