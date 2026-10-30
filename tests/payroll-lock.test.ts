import { afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
import { companyMembers, payrollRecords } from "../drizzle/schema";
import * as db from "../server/db";
import { assertPayrollEditable } from "../server/enterprise";

// Employee 20's approved payroll must not block employee 10's attendance/leave.
function databaseWithApprovedEmployee20() {
  const dialect = new MySqlDialect();
  const select = vi.fn(() => ({from: (table: unknown) => ({where: (condition: SQL) => ({limit: async () => {
    if (table === companyMembers) return [{id:1,staffAccountId:10,companyId:1,branchId:1,role:"employee",active:true}];
    if (table === payrollRecords) {
      const {sql,params} = dialect.sqlToQuery(condition);
      const hasStaffFilter = sql.includes('`payroll_records`.`staffAccountId` = ?');
      return !hasStaffFilter || params.at(-1) === 20 ? [{id:1}] : [];
    }
    throw new Error("Unexpected table");
  }})})}));
  vi.spyOn(db,"getDb").mockResolvedValue({select} as unknown as NonNullable<Awaited<ReturnType<typeof db.getDb>>>);
}

afterEach(()=>vi.restoreAllMocks());
describe("payroll closure boundaries", () => {
  it("allows an employee whose own payroll is still open", async () => {
    databaseWithApprovedEmployee20();
    await expect(assertPayrollEditable(10,"2026-10")).resolves.toBe(true);
  });
  it("blocks changes when the targeted employee's payroll is approved", async () => {
    databaseWithApprovedEmployee20();
    await expect(assertPayrollEditable(10,"2026-10",20)).rejects.toThrow("تم اعتماده");
  });
});
