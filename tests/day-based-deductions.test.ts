import { describe, expect, it } from "vitest";
import { calculateDayBasedDeduction } from "../server/enterprise";

describe("day-based salary deductions", () => {
  it("calculates selected operating days from monthly base salary divided by 30", () => {
    expect(calculateDayBasedDeduction(9000, 0.25)).toBe(75);
    expect(calculateDayBasedDeduction(9000, 0.5)).toBe(150);
    expect(calculateDayBasedDeduction(9000, 1)).toBe(300);
    expect(calculateDayBasedDeduction(9000, 2)).toBe(600);
    expect(calculateDayBasedDeduction(9000, 3)).toBe(900);
  });
  it("rejects unsupported day counts and invalid salaries", () => {
    expect(() => calculateDayBasedDeduction(9000, 1.5)).toThrow();
    expect(() => calculateDayBasedDeduction(-100, 1)).toThrow();
  });
});
