CREATE TABLE "internal_datasets" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "reference_period" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "unique_person_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "internal_datasets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_people" (
    "id" TEXT NOT NULL,
    "employee_key" TEXT NOT NULL,
    "employee_id" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "masked_cpf" TEXT,
    "organization" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "internal_people_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "internal_affiliations" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "employment_type" TEXT,
    "organization" TEXT NOT NULL,
    "reference_period" TEXT,
    "source_sheet" TEXT NOT NULL,
    "source_row" INTEGER,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_affiliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_datasets_file_hash_key" ON "internal_datasets"("file_hash");
CREATE INDEX "internal_datasets_organization_reference_period_idx" ON "internal_datasets"("organization", "reference_period");
CREATE UNIQUE INDEX "internal_people_employee_key_key" ON "internal_people"("employee_key");
CREATE INDEX "internal_people_normalized_name_idx" ON "internal_people"("normalized_name");
CREATE INDEX "internal_people_organization_idx" ON "internal_people"("organization");
CREATE UNIQUE INDEX "internal_affiliations_person_id_dataset_id_employment_type_source_sheet_key" ON "internal_affiliations"("person_id", "dataset_id", "employment_type", "source_sheet");
CREATE INDEX "internal_affiliations_dataset_id_idx" ON "internal_affiliations"("dataset_id");
CREATE INDEX "internal_affiliations_organization_current_idx" ON "internal_affiliations"("organization", "current");

ALTER TABLE "internal_affiliations" ADD CONSTRAINT "internal_affiliations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "internal_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_affiliations" ADD CONSTRAINT "internal_affiliations_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "internal_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
