import { describe, expect, it } from "vitest";
import { approvedLeaveDates, calculatePayroll, calculateAttendanceAccrual, calculateAttendancePenalties, calculateEarnedSalary, getAbsencePenaltyDays, PAYROLL_RULES } from "../lib/payroll";

describe("قواعد المرتب الداخلية", () => {
  it("تحسب قيمة اليوم والساعة من 30 يوم و9 ساعات مع 26 يوم عمل و4 إجازة مدفوعة", () => {
    const result = calculatePayroll({ baseSalary: 12000 });
    expect(PAYROLL_RULES.workDays + PAYROLL_RULES.paidLeaveDays).toBe(PAYROLL_RULES.calendarDays);
    expect(result.dailyValue).toBeCloseTo(12000 / PAYROLL_RULES.calendarDays);
    expect(result.hourlyValue).toBeCloseTo(12000 / 30 / 9);
  });

  it("تطبق خصم الغياب ثلاثة أيام لكل يوم غياب", () => {
    const result = calculatePayroll({ baseSalary: 12000, absences: 1 });
    expect(result.absenceDeduction).toBeCloseTo((12000 / 30) * 3);
    expect(result.net).toBeCloseTo(12000 - (12000 / 30) * 3);
  });

  it("تطبق شرائح التأخير عند حدود الدقائق المطلوبة", () => {
    const daily = 12000 / 30;
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 14 }).lateDeduction).toBe(0);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 15 }).lateDeduction).toBeCloseTo(daily * 0.25);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 29 }).lateDeduction).toBeCloseTo(daily * 0.25);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 30 }).lateDeduction).toBeCloseTo(daily * 0.5);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 59 }).lateDeduction).toBeCloseTo(daily * 0.5);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 60 }).lateDeduction).toBeCloseTo(daily);
  });

  it("تحدد خصم الغياب حسب وجود الإذن", () => {
    expect(getAbsencePenaltyDays(false)).toBe(3);
    expect(getAbsencePenaltyDays(true)).toBe(1);
  });

  it("تحسب الأوفر تايم بسعر الساعة العادي دون مضاعفة", () => {
    const result = calculatePayroll({ baseSalary: 12000, overtimeHours: 2, overtimeRate: 50 });
    expect(PAYROLL_RULES.overtimeMultiplier).toBe(1);
    expect(result.overtimeValue).toBe(100);
  });

  it("تجمع الإضافي وتخصم التأخير والخصومات والسلف", () => {
    const result = calculatePayroll({
      baseSalary: 12000,
      allowances: 1500,
      bonuses: 500,
      overtimeHours: 3,
      overtimeRate: 70,
      lateMinutes: 60,
      deductions: 250,
      advances: 1000,
    });
    expect(result.overtimeValue).toBe(210);
    expect(result.totalDeductions).toBeCloseTo(result.lateDeduction + 1250);
    expect(result.net).toBeGreaterThan(0);
  });

  it("لا تسمح أن يصبح صافي الراتب سالبًا", () => {
    const result = calculatePayroll({ baseSalary: 3000, absences: 20, deductions: 10000, advances: 10000 });
    expect(result.net).toBe(0);
  });

  it("تتجاهل دقائق التأخير السالبة وتستخدم سعر الأوفر تايم المخصص", () => {
    const result = calculatePayroll({ baseSalary: 9000, lateMinutes: -30, overtimeHours: 2, overtimeRate: 125 });
    expect(result.lateDeduction).toBe(0);
    expect(result.overtimeValue).toBe(250);
    expect(result.gross).toBe(9250);
  });
});

describe("الراتب المستحق حسب ساعات الحضور الفعلية", () => {
  it("لا يصرف الراتب الشهري كاملًا عند عدم وجود ساعات عمل", () => {
    expect(calculateEarnedSalary(9000, 0)).toBe(0);
  });

  it("يحسب فقط وقت العمل المسجل حتى الآن", () => {
    // 9,000 ÷ 30 يوم ÷ 9 ساعات = 33.33 جنيه تقريبًا في الساعة.
    expect(calculateEarnedSalary(9000, 9 * 60)).toBe(300);
    expect(calculateEarnedSalary(9000, 9 * 60 * 10)).toBe(3000);
  });

  it("لا يسمح بأن يتجاوز المستحق الأساسي قيمة المرتب الشهري", () => {
    expect(calculateEarnedSalary(9000, 60 * 60 * 40)).toBe(9000);
  });

  it("يتجاهل دقائق العمل السالبة", () => {
    expect(calculateEarnedSalary(9000, -120)).toBe(0);
  });
});

describe("attendance based accrual", () => {
  it("pays only attended dates and explicitly scheduled rest, once per date", () => {
    const records = [
      {date:"2026-10-01",checkIn:"18:00",status:"حاضر"},
      {date:"2026-10-01",checkIn:"18:00",status:"حاضر"},
      {date:"2026-10-02",checkIn:null,status:"غياب"},
      {date:"2026-10-05",checkIn:"09:00",status:"متأخر"},
      {date:"2026-09-30",checkIn:"09:00",status:"حاضر"},
    ];
    const result = calculateAttendanceAccrual(9000,"2026-10",records,["2026-10-01","2026-10-03","2026-10-06"],"2026-10-04");
    expect(result).toMatchObject({earnedBaseSalary:900,workedDays:1,paidRestDays:1,unpaidAbsenceDays:1,restOvertimeValue:300});
  });
  it("does not pay unrecorded calendar days, past or future months", () => {
    expect(calculateAttendanceAccrual(9000,"2026-09",[],[],"2026-10-04").earnedBaseSalary).toBe(0);
    expect(calculateAttendanceAccrual(9000,"2026-11",[],["2026-11-01"],"2026-10-04").earnedBaseSalary).toBe(0);
  });
  it("counts an open overnight shift on its original attendance date", () => {
    expect(calculateAttendanceAccrual(9000,"2026-10",[{date:"2026-10-03",checkIn:"18:00",status:"متأخر"}],[],"2026-10-04").earnedBaseSalary).toBe(300);
  });
  it("a scheduled rest overrides a stale absence record", () => {
    const record = {date:"2026-10-01",status:"غياب"};
    const rest = [record.date];
    const accrual = calculateAttendanceAccrual(9000,"2026-10",[record],rest,"2026-10-04");
    expect(accrual.earnedBaseSalary).toBe(300);
    expect(calculateAttendancePenalties(9000,[record],accrual.unpaidAbsenceDays,rest).absenceDeduction).toBe(0);
  });
  it("caps the base and adds four worked-rest days even in a 31-day month", () => {
    const dates = Array.from({length:31},(_,i)=>`2026-10-${String(i+1).padStart(2,"0")}`);
    expect(calculateAttendanceAccrual(9000,"2026-10",dates.map(date=>({date,checkIn:"09:00",status:"حاضر"})),[],"2026-10-31").earnedBaseSalary).toBe(10200);
  });
  it("keeps the total absence penalty at three days without double deduction", () => {
    const records = [{date:"2026-10-01",status:"غياب",note:""}];
    expect(calculateAttendancePenalties(9000,records,1).absenceDeduction).toBe(600);
    expect(calculateAttendancePenalties(9000,[{...records[0],note:"بإذن"}],1).absenceDeduction).toBe(0);
  });
  it("applies late bands per approved record rather than accumulated minutes", () => {
    expect(calculateAttendancePenalties(9000,[15,29,30,59,60,14].map((lateMinutes,i)=>({date:`2026-10-0${i+1}`,status:"متأخر",lateMinutes,note:"تم اعتماد التأخير"})),0).lateDeduction).toBe(750);
  });
});


describe("paid leave and worked rest accrual", () => {
  it("pays approved leave across months only through today, without duplicating rest", () => {
    const leave = approvedLeaveDates([
      {type:"إجازة",status:"مقبول",fromDate:"2026-09-30",toDate:"2026-10-03"},
      {type:"إجازة",status:"مرفوض",fromDate:"2026-10-04",toDate:"2026-10-04"},
    ]);
    const records=[{date:"2026-10-02",status:"غياب",note:"غياب تلقائي"}];
    const accrual=calculateAttendanceAccrual(9000,"2026-10",records,["2026-10-01"],"2026-10-02",leave);
    expect(accrual.earnedBaseSalary).toBe(600);
    expect(calculateAttendancePenalties(9000,records,accrual.unpaidAbsenceDays,leave).absenceDeduction).toBe(0);
  });
  it("does not grant paid leave for an unapproved attendance label", () => {
    expect(calculateAttendanceAccrual(9000,"2026-10",[{date:"2026-10-01",status:"إجازة"}],[],"2026-10-31").earnedBaseSalary).toBe(0);
  });
  it("pays two days for worked rest and keeps the premium above the monthly cap", () => {
    const dates=Array.from({length:30},(_,i)=>`2026-10-${String(i+1).padStart(2,"0")}`);
    const records=dates.map(date=>({date,checkIn:"08:00",status:"حاضر"}));
    expect(calculateAttendanceAccrual(9000,"2026-10",records,[dates[0]],"2026-10-31").earnedBaseSalary).toBe(10200);
    expect(calculateAttendanceAccrual(9000,"2026-10",[records[0]],[dates[0]],"2026-10-31").earnedBaseSalary).toBe(600);
  });
});
