import { describe, expect, it } from "vitest";
import { redactAuditMetadata, redactStoredAuditMetadata } from "../lib/audit-utils";

describe("audit credential redaction", () => {
  it("keeps useful edits while removing passwords and nested credentials", () => {
    const original={department:"Kitchen",password:"new-password",nested:[{accessToken:"token",count:2}]};
    expect(redactAuditMetadata(original)).toEqual({department:"Kitchen",password:"[REDACTED]",nested:[{accessToken:"[REDACTED]",count:2}]});
    expect(original.password).toBe("new-password");
  });
  it("redacts legacy event metadata before it is sent to the client", () => {
    expect(redactStoredAuditMetadata('{"password":"old-secret","name":"Employee"}')).toBe('{"password":"[REDACTED]","name":"Employee"}');
  });
  it("does not expose malformed legacy metadata", () => {
    expect(redactStoredAuditMetadata("not-json")).toBeNull();
    expect(redactStoredAuditMetadata(null)).toBeNull();
  });
});
