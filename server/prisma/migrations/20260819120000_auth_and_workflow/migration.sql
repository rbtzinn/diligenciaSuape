-- ==========================================================
-- DILIGÊNCIA 360 — Migração Fase 6: Autenticação, RBAC e Workflow
-- ==========================================================

-- 1. Criação da tabela de Usuários
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Índice único no e-mail de usuário
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- 2. Atualização da tabela de Diligências (autoria e revisão)
ALTER TABLE "diligences" 
ADD COLUMN IF NOT EXISTS "created_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "reviewed_by_id" TEXT,
ADD COLUMN IF NOT EXISTS "return_justification" TEXT;

-- 3. Atualização das tabelas de Auditoria e Ações de Revisão
ALTER TABLE "review_actions" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- 4. Foreign Keys
ALTER TABLE "diligences" ADD CONSTRAINT "diligences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "diligences" ADD CONSTRAINT "diligences_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
