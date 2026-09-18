CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  legalName VARCHAR(200),
  email VARCHAR(320),
  phone VARCHAR(32),
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude VARCHAR(32) NOT NULL,
  longitude VARCHAR(32) NOT NULL,
  radiusMeters INT NOT NULL DEFAULT 200,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_branches_company (companyId)
);
CREATE TABLE IF NOT EXISTS company_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  branchId INT NULL,
  staffAccountId INT NOT NULL UNIQUE,
  role VARCHAR(24) NOT NULL DEFAULT 'employee',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_members_company (companyId)
);
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leave_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  staffAccountId INT NOT NULL,
  year INT NOT NULL,
  annualDays INT NOT NULL DEFAULT 21,
  sickDays INT NOT NULL DEFAULT 14,
  emergencyDays INT NOT NULL DEFAULT 6,
  annualUsed INT NOT NULL DEFAULT 0,
  sickUsed INT NOT NULL DEFAULT 0,
  emergencyUsed INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_staff_year (staffAccountId, year)
);
CREATE TABLE IF NOT EXISTS payroll_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  staffAccountId INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  baseSalary INT NOT NULL DEFAULT 0,
  allowances INT NOT NULL DEFAULT 0,
  bonuses INT NOT NULL DEFAULT 0,
  overtime INT NOT NULL DEFAULT 0,
  absenceDeduction INT NOT NULL DEFAULT 0,
  lateDeduction INT NOT NULL DEFAULT 0,
  otherDeductions INT NOT NULL DEFAULT 0,
  advances INT NOT NULL DEFAULT 0,
  grossSalary INT NOT NULL DEFAULT 0,
  netSalary INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  approvedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_staff_month (staffAccountId, month),
  INDEX idx_payroll_company_month (companyId, month)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staffAccountId INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  readAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_staff (staffAccountId, readAt)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL UNIQUE,
  plan VARCHAR(32) NOT NULL DEFAULT 'trial',
  status VARCHAR(32) NOT NULL DEFAULT 'trialing',
  seats INT NOT NULL DEFAULT 10,
  monthlyPrice INT NOT NULL DEFAULT 0,
  trialEndsAt TIMESTAMP NULL,
  currentPeriodStart TIMESTAMP NULL,
  currentPeriodEnd TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NULL,
  staffAccountId INT NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80),
  entityId VARCHAR(64),
  metadata TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_company (companyId, createdAt)
);
INSERT INTO companies (name) SELECT 'الشركة الرئيسية' FROM (SELECT 1) x WHERE NOT EXISTS (SELECT 1 FROM companies);
INSERT INTO branches (companyId,name,address,latitude,longitude,radiusMeters)
SELECT c.id,'الفرع الرئيسي','مدينة نصر، القاهرة','30.0444','31.2357',200 FROM companies c
WHERE c.id = (SELECT MIN(id) FROM companies)
AND NOT EXISTS (SELECT 1 FROM branches WHERE companyId=c.id);
INSERT INTO company_members (companyId,branchId,staffAccountId,role)
SELECT c.id,b.id,s.id,CASE WHEN s.role='manager' THEN 'manager' ELSE 'employee' END
FROM staff_accounts s CROSS JOIN (SELECT MIN(id) id FROM companies) c CROSS JOIN (SELECT MIN(id) id FROM branches) b
WHERE NOT EXISTS (SELECT 1 FROM company_members m WHERE m.staffAccountId=s.id);
INSERT INTO subscriptions (companyId,plan,status,seats,monthlyPrice,trialEndsAt)
SELECT c.id,'trial','trialing',10,0,DATE_ADD(NOW(),INTERVAL 14 DAY) FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.companyId=c.id);
