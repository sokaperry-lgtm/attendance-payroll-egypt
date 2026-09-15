import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../server/db";

describe("حسابات الاستاف الداخلية", () => {
  it("لا يخزن كلمة المرور كنص واضح ويمكنه التحقق منها", () => {
    const stored = hashPassword("secret-123");
    expect(stored).not.toContain("secret-123");
    expect(verifyPassword("secret-123", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("ينتج salt مختلفًا عند كل إنشاء", () => {
    expect(hashPassword("secret-123")).not.toBe(hashPassword("secret-123"));
  });
});
