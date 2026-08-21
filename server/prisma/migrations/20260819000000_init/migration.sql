-- ==========================================================
-- DILIGÊNCIA 360 — Migração Inicial PostgreSQL (Fase 5A)
-- ==========================================================

-- 1. Tabela de Empresas
CREATE TABLE IF NOT EXISTS "companies" (
    "id" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "corporate_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "companies_cnpj_key" ON "companies"("cnpj");

-- 2. Tabela de Diligências (Snapshots Históricos)
CREATE TABLE IF NOT EXISTS "diligences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "preliminary_score" INTEGER NOT NULL DEFAULT 0,
    "preliminary_level" TEXT NOT NULL DEFAULT 'Atenção Baixa',
    "recommendation" TEXT NOT NULL,
    "summary" TEXT,
    "company_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diligences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "diligences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Sócios e Administradores da Diligência
CREATE TABLE IF NOT EXISTS "diligence_shareholders" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualification" TEXT,
    "entry_date" TEXT,
    "cpf_cnpj" TEXT,
    "raw_data" JSONB,

    CONSTRAINT "diligence_shareholders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "diligence_shareholders_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4. Possíveis Correspondências PEP
CREATE TABLE IF NOT EXISTS "pep_matches" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "shareholder_id" TEXT,
    "name_searched" TEXT NOT NULL,
    "matched_name" TEXT,
    "organization" TEXT,
    "role" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'possible_match',
    "review_status" TEXT NOT NULL DEFAULT 'pending',
    "raw_data" JSONB,

    CONSTRAINT "pep_matches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pep_matches_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pep_matches_shareholder_id_fkey" FOREIGN KEY ("shareholder_id") REFERENCES "diligence_shareholders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 5. Sanções Oficiais (CEIS / CNEP)
CREATE TABLE IF NOT EXISTS "sanctions" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sanction_type" TEXT,
    "sanctioning_body" TEXT,
    "state" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT,
    "process_number" TEXT,
    "legal_basis" TEXT,
    "raw_data" JSONB,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sanctions_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 6. Ocorrências de Mídia Adversa
CREATE TABLE IF NOT EXISTS "adverse_media_results" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "published_at" TEXT,
    "snippet" TEXT,
    "match_strength" TEXT NOT NULL DEFAULT 'low',
    "matched_terms" JSONB,
    "categories" JSONB,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "searched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_data" JSONB,

    CONSTRAINT "adverse_media_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "adverse_media_results_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. Processos Judiciais (Entidade Canônica)
CREATE TABLE IF NOT EXISTS "judicial_processes" (
    "id" TEXT NOT NULL,
    "process_number" TEXT NOT NULL,
    "formatted_number" TEXT,
    "tribunal" TEXT NOT NULL,
    "degree" TEXT DEFAULT 'G1',
    "class_code" INTEGER,
    "class_name" TEXT,
    "filing_date" TEXT,
    "secrecy_level" INTEGER DEFAULT 0,
    "court_name" TEXT,
    "court_city" TEXT,
    "system_name" TEXT DEFAULT 'PJe',
    "last_datajud_update" TEXT,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judicial_processes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "judicial_processes_process_number_key" ON "judicial_processes"("process_number");

-- 8. Descobertas Processuais por Fonte
CREATE TABLE IF NOT EXISTS "process_discoveries" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "judicial_process_id" TEXT,
    "process_number" TEXT NOT NULL,
    "formatted_process_number" TEXT,
    "tribunal" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT,
    "excerpt" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'candidate',

    CONSTRAINT "process_discoveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "process_discoveries_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "process_discoveries_judicial_process_id_fkey" FOREIGN KEY ("judicial_process_id") REFERENCES "judicial_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 9. Evidências e Rastreabilidade de Consultas
CREATE TABLE IF NOT EXISTS "evidences" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "result_status" TEXT NOT NULL,
    "consulted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url" TEXT,
    "metadata" JSONB,

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidences_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. Avaliação do Indicador Preliminar
CREATE TABLE IF NOT EXISTS "risk_assessments" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decision_desc" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "methodology_version" TEXT NOT NULL DEFAULT 'v1.0',
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "risk_assessments_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "risk_assessments_diligence_id_key" ON "risk_assessments"("diligence_id");

-- 11. Ações de Revisão Humana
CREATE TABLE IF NOT EXISTS "review_actions" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "justification" TEXT,
    "reviewed_by" TEXT NOT NULL DEFAULT 'Auditor Compliance SUAPE',
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_actions_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 12. Trilha de Auditoria
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT NOT NULL,
    "diligence_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "actor" TEXT NOT NULL DEFAULT 'Sistema / Diligência 360',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_events_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
