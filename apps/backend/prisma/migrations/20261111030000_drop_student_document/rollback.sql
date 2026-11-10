-- Rollback for 20261111030000_drop_student_document (D6). Run with psql. Restores the table empty.
BEGIN;
CREATE TABLE "StudentDocument" (
    id integer NOT NULL,
    "studentUserId" integer NOT NULL,
    "uploadedById" integer,
    "originalName" text NOT NULL,
    "storagePath" text NOT NULL,
    "mimeType" text NOT NULL,
    "sizeBytes" integer NOT NULL,
    "uploadedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE SEQUENCE "StudentDocument_id_seq" AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE "StudentDocument_id_seq" OWNED BY "StudentDocument".id;
ALTER TABLE ONLY "StudentDocument" ALTER COLUMN id SET DEFAULT nextval('"StudentDocument_id_seq"'::regclass);
ALTER TABLE ONLY "StudentDocument" ADD CONSTRAINT "StudentDocument_pkey" PRIMARY KEY (id);
CREATE INDEX "StudentDocument_studentUserId_idx" ON "StudentDocument" USING btree ("studentUserId");
ALTER TABLE ONLY "StudentDocument" ADD CONSTRAINT "StudentDocument_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "StudentDocument" ADD CONSTRAINT "StudentDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111030000_drop_student_document';
COMMIT;
