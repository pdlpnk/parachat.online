ALTER TYPE "Locale" ADD VALUE 'FA';
ALTER TABLE "Client"
 ADD COLUMN "uiTheme" VARCHAR(16) NOT NULL DEFAULT 'light',
 ADD COLUMN "uiFont" VARCHAR(16) NOT NULL DEFAULT 'modern',
 ADD CONSTRAINT "Client_uiTheme_check" CHECK ("uiTheme" IN ('light','emerald','purple','orange','coral')),
 ADD CONSTRAINT "Client_uiFont_check" CHECK ("uiFont" IN ('modern','soft','tech'));
