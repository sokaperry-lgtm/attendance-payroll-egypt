CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`checkIn` varchar(8),
	`checkOut` varchar(8),
	`status` varchar(32) NOT NULL DEFAULT 'حاضر',
	`lateMinutes` int NOT NULL DEFAULT 0,
	`distanceMeters` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`passwordHash` varchar(220) NOT NULL,
	`name` varchar(160) NOT NULL,
	`title` varchar(120),
	`department` varchar(120),
	`role` enum('manager','employee') NOT NULL DEFAULT 'employee',
	`baseSalary` int NOT NULL DEFAULT 0,
	`shiftStart` varchar(8) NOT NULL DEFAULT '09:00',
	`shiftEnd` varchar(8) NOT NULL DEFAULT '18:00',
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_accounts_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `staff_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`type` varchar(32) NOT NULL,
	`fromDate` varchar(10) NOT NULL,
	`toDate` varchar(10) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'قيد المراجعة',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
