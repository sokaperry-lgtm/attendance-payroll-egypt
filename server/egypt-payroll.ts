/**
 * Egyptian employment payroll calculator.
 * Rules are isolated and versioned so statutory updates do not require
 * rewriting the payroll generation flow.
 */
export type EgyptPayrollRules = {
  taxYear: number;
  personalExemption: number;
  insuranceWageMin: number;
  insuranceWageMax: number;
  employeeSocialRate: number;
  employerSocialRate: number;
  insuranceFundsCap: number;
  insuranceFundsPercentOfNet: number;
  taxBands: Array<{ upTo: number; rate: number }>;
};

export const EGYPT_PAYROLL_RULES_2026: EgyptPayrollRules = {
  taxYear: 2026,
  personalExemption: 20_000,
  insuranceWageMin: 2_700,
  insuranceWageMax: 16_700,
  employeeSocialRate: 0.11,
  employerSocialRate: 0.1875,
  insuranceFundsCap: 10_000,
  insuranceFundsPercentOfNet: 0.15,
  taxBands: [
    { upTo: 40_000, rate: 0 },
    { upTo: 55_000, rate: 0.10 },
    { upTo: 70_000, rate: 0.15 },
    { upTo: 200_000, rate: 0.20 },
    { upTo: 400_000, rate: 0.225 },
    { upTo: 1_200_000, rate: 0.25 },
    { upTo: Infinity, rate: 0.275 },
  ],
};

export type EgyptPayrollInput = {
  monthlyGross: number;
  insuranceWage?: number;
  employeeSocialInsurance?: number;
  employeeInsuranceFunds?: number;
  monthlyOtherDeductions?: number;
  rules?: EgyptPayrollRules;
};

function progressiveTax(taxableIncome: number, rules: EgyptPayrollRules) {
  let remaining = Math.max(0, taxableIncome);
  let lower = 0;
  let tax = 0;
  for (const band of rules.taxBands) {
    const slice = Math.max(0, Math.min(remaining, band.upTo - lower));
    tax += slice * band.rate;
    remaining -= slice;
    lower = band.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export function calculateEgyptAnnualIncomeTax(input: {
  annualTaxableBeforeExemptions: number;
  employeeSocialInsurance: number;
  employeeInsuranceFunds?: number;
  rules?: EgyptPayrollRules;
}) {
  const rules = input.rules ?? EGYPT_PAYROLL_RULES_2026;
  const gross = Math.max(0, input.annualTaxableBeforeExemptions);
  const social = Math.max(0, input.employeeSocialInsurance);
  const insuranceFundsBase = Math.max(0, gross - social);
  const insuranceFundsCap = Math.min(
    Math.max(0, input.employeeInsuranceFunds ?? 0),
    rules.insuranceFundsCap,
    insuranceFundsBase * rules.insuranceFundsPercentOfNet,
  );
  const taxable = Math.max(0, gross - rules.personalExemption - social - insuranceFundsCap);
  const annualTax = progressiveTax(taxable, rules);
  return {
    taxableIncome: Math.round(taxable),
    annualTax,
    monthlyTax: Math.round(annualTax / 12),
    personalExemption: rules.personalExemption,
    insuranceFundsCap,
  };
}

export function calculateEgyptPayroll(input: EgyptPayrollInput) {
  const rules = input.rules ?? EGYPT_PAYROLL_RULES_2026;
  const monthlyGross = Math.max(0, input.monthlyGross);
  const rawInsuranceWage = input.insuranceWage ?? monthlyGross;
  const insuranceWage = Math.min(Math.max(0, rawInsuranceWage), rules.insuranceWageMax);
  const calculatedEmployeeSocial = Math.round(insuranceWage * rules.employeeSocialRate);
  const employeeSocialInsurance = Math.round(input.employeeSocialInsurance ?? calculatedEmployeeSocial);
  const employerSocialInsurance = Math.round(insuranceWage * rules.employerSocialRate);
  const annualGross = monthlyGross * 12;
  const annualSocial = employeeSocialInsurance * 12;
  const annualFunds = Math.max(0, input.employeeInsuranceFunds ?? 0) * 12;
  const tax = calculateEgyptAnnualIncomeTax({ annualTaxableBeforeExemptions: annualGross, employeeSocialInsurance: annualSocial, employeeInsuranceFunds: annualFunds, rules });
  const other = Math.max(0, input.monthlyOtherDeductions ?? 0);
  return {
    gross: Math.round(monthlyGross),
    insuranceWage: Math.round(insuranceWage),
    employeeSocialInsurance,
    employerSocialInsurance,
    employeeIncomeTax: tax.monthlyTax,
    otherDeductions: Math.round(other),
    net: Math.max(0, Math.round(monthlyGross - employeeSocialInsurance - tax.monthlyTax - other)),
    annualTaxableIncome: tax.taxableIncome,
    annualTax: tax.annualTax,
    taxYear: rules.taxYear,
  };
}
