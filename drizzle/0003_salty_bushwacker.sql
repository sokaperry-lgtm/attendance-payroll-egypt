CREATE TABLE `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`startTime` varchar(8) NOT NULL,
	`endTime` varchar(8) NOT NULL,
	`crossesMidnight` boolean NOT NULL DEFAULT false,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `shift_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffAccountId` int NOT NULL,
	`scheduleDate` varchar(10) NOT NULL,
	`shiftTemplateId` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_schedules_id` PRIMARY KEY(`id`)
);
