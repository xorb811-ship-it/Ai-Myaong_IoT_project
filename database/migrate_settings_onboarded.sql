-- Add onboarding-completion flag to SETTINGS (per-user first-run guide).
-- Run once on the deployed Oracle DB. New DBs get it from the model via create_tables.
--
-- Adds ONBOARDED ('Y'/'N'); existing rows default to 'N' so the guide re-shows once,
-- then is marked done in the DB (source of truth) instead of browser localStorage.

ALTER TABLE SETTINGS ADD onboarded VARCHAR2(1) DEFAULT 'N';

COMMIT;
