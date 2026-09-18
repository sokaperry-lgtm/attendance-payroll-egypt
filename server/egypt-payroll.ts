/**
 * Egypt payroll calculation helpers.
 * Tax inputs are kept configurable because payroll rules can change by tax year.
 * The 2026 setup follows ETA guidance: annualized payroll, EGP 20,000 personal
 * exemption, employee social-insurance deduction as an input, and progressive tax.
 */
export type EgyptPayrollInput = {
  annualTaxableBeforeExemptions: number;
  employeeSocialInsurance: number;
  employeeInsuranceFunds: number;
  taxYear?: number;
};

export function calculateEgyptAnnualIncomeTax(input: EgyptPayrollInput) {
  const personalExemption = 20_000;
  const insuranceFundsCap = Math.min(Math.max(0, input.employeeInsuranceFunds), 10_000, Math.max(0, input.annualTaxableBeforeExemptions * 0.15));
  const taxable = Math.max(0, input.annualTaxableBeforeExemptions - personalExemption - Math.max(0, input.employeeSocialInsurance) - insuranceFundsCap);
  // Progressive bands. Keep the table isolated so a statutory update is one edit.
  const bands = [
    { upTo: 40_000, rate: 0 },
    { upTo: 55_000, rate: 0.10 },
    { upTo: 70_000, rate: 0.15 },
    { upTo: 200_000, rate: 0.20 },
    { upTo: 400_000, rate: 0.225 },
    { upTo: 600_000, rate: 0.25 },
    { upTo: 700_000, rate: 0.275 },
    { upTo: Infinity, rate: 0.30 },
  ];
  let remaining = taxable;
  let lower = 0;
  let tax = 0;
  for (const band of bands) {
    const slice = Math.max(0, Math.min(remaining, band.upTo - lower));
    tax += slice * band.rate;
    remaining -= slice;
    lower = band.upTo;
    if (remaining <= 0) break;
  }
  return { taxableIncome: Math.round(taxable), annualTax: Math.round(tax), monthlyTax: Math.round(tax / 12), personalExemption, insuranceFundsCap };
}

export function calculateEgyptPayroll(input: {
  monthlyGross: number;
  employeeSocialInsurance?: number;
  employeeInsuranceFunds?: number;
  monthlyOtherDeductions?: number;
}) {
  const annualGross = Math.max(0, input.monthlyGross) * 12;
  const annualSocial = Math.max(0, input.employeeSocialInsurance ?? 0) * 12;
  const annualFunds = Math.max(0, input.employeeInsuranceFunds ?? 0) * 12;
  const tax = calculateEgyptAnnualIncomeTax({
    annualTaxableBeforeExemptions: annualGross,
    employeeSocialInsurance: annualSocial,
    employeeInsuranceFunds: annualFunds,
  });
  const other = Math.max(0, input.monthlyOtherDeductions ?? 0);
  return {
    gross: Math.round(input.monthlyGross),
    employeeSocialInsurance: Math.round(input.employeeSocialInsurance ?? 0),
    employeeIncomeTax: tax.monthlyTax,
    otherDeductions: Math.round(other),
    net: Math.max(0, Math.round(input.monthlyGross - (input.employeeSocialInsurance ?? 0) - tax.monthlyTax - other)),
    annualTaxableIncome: tax.taxableIncome,
    annualTax: tax.annualTax,
  };
}
