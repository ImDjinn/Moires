-- Jalons & flags rattachés au projet ADO (au lieu de la session) pour persister
-- entre sessions. Backfill de ado_project_id depuis planning_sessions ; les
-- lignes orphelines (session supprimée) sont retirées.

-- Milestones
ALTER TABLE "milestones" DROP CONSTRAINT "milestones_session_id_fkey";
DROP INDEX "milestones_session_id_idx";
ALTER TABLE "milestones" ADD COLUMN "ado_project_id" TEXT;
UPDATE "milestones" m SET "ado_project_id" = ps."ado_project_id"
  FROM "planning_sessions" ps WHERE ps."id" = m."session_id";
DELETE FROM "milestones" WHERE "ado_project_id" IS NULL;
ALTER TABLE "milestones" ALTER COLUMN "ado_project_id" SET NOT NULL;
ALTER TABLE "milestones" DROP COLUMN "session_id";
CREATE INDEX "milestones_ado_project_id_idx" ON "milestones"("ado_project_id");

-- Row pins (flags)
ALTER TABLE "row_pins" DROP CONSTRAINT "row_pins_session_id_fkey";
DROP INDEX "row_pins_session_id_idx";
ALTER TABLE "row_pins" ADD COLUMN "ado_project_id" TEXT;
UPDATE "row_pins" p SET "ado_project_id" = ps."ado_project_id"
  FROM "planning_sessions" ps WHERE ps."id" = p."session_id";
DELETE FROM "row_pins" WHERE "ado_project_id" IS NULL;
ALTER TABLE "row_pins" ALTER COLUMN "ado_project_id" SET NOT NULL;
ALTER TABLE "row_pins" DROP COLUMN "session_id";
CREATE INDEX "row_pins_ado_project_id_idx" ON "row_pins"("ado_project_id");
