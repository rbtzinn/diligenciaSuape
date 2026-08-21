-- ==========================================================
-- DILIGÊNCIA 360 — Migração: Firebase Authentication (firebase_uid)
-- ==========================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firebase_uid" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_key" ON "users"("firebase_uid");
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
