ALTER TABLE "Admin" ADD COLUMN "uiTheme" VARCHAR(16) NOT NULL DEFAULT 'light',
ADD CONSTRAINT "Admin_uiTheme_check" CHECK ("uiTheme" IN ('light','emerald','purple','orange','coral'));
