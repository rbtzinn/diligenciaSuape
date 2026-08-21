-- ==========================================================
-- DILIGÊNCIA 360 — Migração Fase 7: Dossiês e Relatórios PDF
-- ==========================================================

CREATE TABLE IF NOT EXISTS "diligence_reports" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "report_number" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "hash_algorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "hash_value" TEXT NOT NULL,
    "generated_by_id" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diligence_reports_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "diligence_reports" ADD CONSTRAINT "diligence_reports_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diligence_reports" ADD CONSTRAINT "diligence_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
