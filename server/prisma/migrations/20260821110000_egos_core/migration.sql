-- ==========================================================
-- EGOS Core — modelo canônico, evidências, cobertura e grafo
-- Migração estritamente aditiva
-- ==========================================================

CREATE TABLE "egos_entities" (
  "id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "canonical_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "properties" JSONB NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "egos_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_entity_identifiers" (
  "id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "identifier_type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_entity_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_entity_aliases" (
  "id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "alias_type" TEXT NOT NULL DEFAULT 'name',
  "provider" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_entity_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_relationships" (
  "id" TEXT NOT NULL,
  "canonical_key" TEXT NOT NULL,
  "source_entity_id" TEXT NOT NULL,
  "target_entity_id" TEXT NOT NULL,
  "relationship_type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "properties" JSONB NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "egos_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_runs" (
  "id" TEXT NOT NULL,
  "diligence_id" TEXT NOT NULL,
  "root_entity_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "max_depth" INTEGER NOT NULL DEFAULT 2,
  "metrics" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "egos_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_run_entities" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "role" TEXT NOT NULL DEFAULT 'related',
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_run_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_run_relationships" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "relationship_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "confidence" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_run_relationships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_evidences" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "entity_id" TEXT,
  "relationship_id" TEXT,
  "provider" TEXT NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT,
  "query" TEXT,
  "identifier" TEXT,
  "excerpt" TEXT,
  "confidence" INTEGER,
  "raw_reference" JSONB,
  "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_evidences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_coverage" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "axis" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "consulted_at" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  CONSTRAINT "egos_coverage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_findings" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "entity_id" TEXT,
  "relationship_id" TEXT,
  "axis" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "confidence" INTEGER,
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egos_resolutions" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "source_entity_id" TEXT NOT NULL,
  "candidate_entity_id" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "signals" JSONB NOT NULL,
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "egos_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "egos_entities_canonical_key_key" ON "egos_entities"("canonical_key");
CREATE INDEX "egos_entities_entity_type_idx" ON "egos_entities"("entity_type");
CREATE INDEX "egos_entities_normalized_name_idx" ON "egos_entities"("normalized_name");
CREATE UNIQUE INDEX "egos_entity_identifiers_entity_id_identifier_type_value_key" ON "egos_entity_identifiers"("entity_id", "identifier_type", "value");
CREATE INDEX "egos_entity_identifiers_identifier_type_value_idx" ON "egos_entity_identifiers"("identifier_type", "value");
CREATE UNIQUE INDEX "egos_entity_aliases_entity_id_normalized_alias_type_key" ON "egos_entity_aliases"("entity_id", "normalized", "alias_type");
CREATE INDEX "egos_entity_aliases_normalized_idx" ON "egos_entity_aliases"("normalized");
CREATE UNIQUE INDEX "egos_relationships_canonical_key_key" ON "egos_relationships"("canonical_key");
CREATE INDEX "egos_relationships_source_entity_id_relationship_type_idx" ON "egos_relationships"("source_entity_id", "relationship_type");
CREATE INDEX "egos_relationships_target_entity_id_relationship_type_idx" ON "egos_relationships"("target_entity_id", "relationship_type");
CREATE UNIQUE INDEX "egos_runs_diligence_id_key" ON "egos_runs"("diligence_id");
CREATE INDEX "egos_runs_status_completed_at_idx" ON "egos_runs"("status", "completed_at");
CREATE UNIQUE INDEX "egos_run_entities_run_id_entity_id_key" ON "egos_run_entities"("run_id", "entity_id");
CREATE INDEX "egos_run_entities_run_id_depth_idx" ON "egos_run_entities"("run_id", "depth");
CREATE UNIQUE INDEX "egos_run_relationships_run_id_relationship_id_key" ON "egos_run_relationships"("run_id", "relationship_id");
CREATE INDEX "egos_evidences_run_id_provider_idx" ON "egos_evidences"("run_id", "provider");
CREATE INDEX "egos_evidences_entity_id_idx" ON "egos_evidences"("entity_id");
CREATE INDEX "egos_evidences_relationship_id_idx" ON "egos_evidences"("relationship_id");
CREATE UNIQUE INDEX "egos_coverage_run_id_axis_provider_key" ON "egos_coverage"("run_id", "axis", "provider");
CREATE INDEX "egos_coverage_run_id_status_idx" ON "egos_coverage"("run_id", "status");
CREATE INDEX "egos_findings_run_id_status_severity_idx" ON "egos_findings"("run_id", "status", "severity");
CREATE UNIQUE INDEX "egos_resolutions_run_id_source_entity_id_candidate_entity_id_key" ON "egos_resolutions"("run_id", "source_entity_id", "candidate_entity_id");
CREATE INDEX "egos_resolutions_run_id_score_idx" ON "egos_resolutions"("run_id", "score");

ALTER TABLE "egos_entity_identifiers" ADD CONSTRAINT "egos_entity_identifiers_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_entity_aliases" ADD CONSTRAINT "egos_entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_relationships" ADD CONSTRAINT "egos_relationships_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_relationships" ADD CONSTRAINT "egos_relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_runs" ADD CONSTRAINT "egos_runs_diligence_id_fkey" FOREIGN KEY ("diligence_id") REFERENCES "diligences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_runs" ADD CONSTRAINT "egos_runs_root_entity_id_fkey" FOREIGN KEY ("root_entity_id") REFERENCES "egos_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "egos_run_entities" ADD CONSTRAINT "egos_run_entities_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_run_entities" ADD CONSTRAINT "egos_run_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_run_relationships" ADD CONSTRAINT "egos_run_relationships_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_run_relationships" ADD CONSTRAINT "egos_run_relationships_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "egos_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_evidences" ADD CONSTRAINT "egos_evidences_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_evidences" ADD CONSTRAINT "egos_evidences_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "egos_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "egos_evidences" ADD CONSTRAINT "egos_evidences_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "egos_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "egos_coverage" ADD CONSTRAINT "egos_coverage_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_findings" ADD CONSTRAINT "egos_findings_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_findings" ADD CONSTRAINT "egos_findings_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "egos_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "egos_findings" ADD CONSTRAINT "egos_findings_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "egos_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "egos_resolutions" ADD CONSTRAINT "egos_resolutions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "egos_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_resolutions" ADD CONSTRAINT "egos_resolutions_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "egos_resolutions" ADD CONSTRAINT "egos_resolutions_candidate_entity_id_fkey" FOREIGN KEY ("candidate_entity_id") REFERENCES "egos_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
