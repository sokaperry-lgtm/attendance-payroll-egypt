import { afterEach, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import * as dbQueries from "../server/db";
import { assertOperationalTarget, listAttendancePenaltyRequests, reviewAttendanceException } from "../server/enterprise";
import { attendanceRecords, companyMembers, payrollRecords } from "../drizzle/schema";

afterEach(() => vi.restoreAllMocks());

it("keeps archived employees in the monthly attendance deduction query and preserves approval status", async () => {
  const filters: any[] = [];
  const db = { select: () => ({ from: (table: unknown) => {
    const query: any = {
      innerJoin: () => query,
      where: (filter: unknown) => { if (table !== companyMembers) filters.push(filter); return query; },
      limit: async () => [{ staffAccountId: 1, companyId: 7, role: "owner", active: true }],
      orderBy: async () => [
        { id: 11, staffAccountId: 2, date: "2026-10-14", lateMinutes: 30, note: "تم اعتماد التأخير", status: "حاضر" },
        { id: 12, staffAccountId: 2, date: "2026-10-15", lateMinutes: 20, note: "", status: "حاضر" },
        { id: 13, staffAccountId: 2, date: "2026-10-16", lateMinutes: 0, note: "تم إلغاء التأخير", status: "حاضر" },
      ],
      then: (resolve: any) => Promise.resolve([{ id: 2, name: "موظف مؤرشف", employmentStartedOn: "2026-09-01", employmentEndedOn: "2026-10-31", active: false }]).then(resolve),
    };
    return query;
  } }) };
  vi.spyOn(dbQueries, "getDb").mockResolvedValue(db as any);
  const rows = await listAttendancePenaltyRequests(1, "2026-10");
  expect(rows.map(row => [row.id, row.status])).toEqual([["late-11", "معتمد"], ["late-12", "قيد المراجعة"]]);
  const query = new MySqlDialect().sqlToQuery(filters[filters.length - 1]);
  expect(query.params).toEqual([2, "2026-10"]);
  expect(query.sql).toContain("LEFT(");
});

it("allows archived targets only when requested, while retaining company and owner protection", async () => {
  let target = { staffAccountId: 2, companyId: 7, role: "employee", active: false };
  let calls = 0;
  const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => (++calls % 2 === 1 ? [{ staffAccountId: 1, companyId: 7, role: "manager", active: true }] : [target]) }) }) }) };
  vi.spyOn(dbQueries, "getDb").mockResolvedValue(db as any);
  await expect(assertOperationalTarget(1, 2)).rejects.toThrow("الموظف غير موجود");
  await expect(assertOperationalTarget(1, 2, true)).resolves.toHaveProperty("target.active", false);
  target = { ...target, companyId: 8 };
  await expect(assertOperationalTarget(1, 2, true)).rejects.toThrow("الموظف غير موجود");
  target = { ...target, companyId: 7, role: "owner" };
  await expect(assertOperationalTarget(1, 2, true)).rejects.toThrow("لا يمكن تعديل بيانات المالك");
});


it("cancels only the selected approved deduction and blocks cancellation after payroll approval", async () => {
  let locked = false;
  const record = { id: 11, staffAccountId: 2, date: "2026-10-14", lateMinutes: 30, status: "حاضر", note: "انصراف مبكر: 20 دقيقة · تم اعتماد التأخير · تم اعتماد الانصراف المبكر" };
  const update = vi.fn((values: object) => ({ where: async () => Object.assign(record, values) }));
  const db = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === companyMembers ? [{ staffAccountId: 1, companyId: 7, role: "owner", active: true }] : table === payrollRecords ? (locked ? [{ id: 4 }] : []) : table === attendanceRecords ? [record] : [] }) }) }),
    update: () => ({ set: update }), insert: () => ({ values: async () => [{ insertId: 1 }] }),
  };
  vi.spyOn(dbQueries, "getDb").mockResolvedValue(db as any);
  await reviewAttendanceException(1, { staffAccountId: 2, date: record.date, kind: "late", action: "cancel" });
  expect(record.lateMinutes).toBe(0);
  expect(record.note).toContain("تم إلغاء التأخير");
  expect(record.note).toContain("تم اعتماد الانصراف المبكر");
  expect(record.note).not.toContain("تم اعتماد التأخير");
  locked = true;
  await expect(reviewAttendanceException(1, { staffAccountId: 2, date: record.date, kind: "early", action: "cancel" })).rejects.toThrow("تم اعتماده");
  expect(update).toHaveBeenCalledTimes(1);
});
