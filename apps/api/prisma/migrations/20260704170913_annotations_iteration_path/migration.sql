-- Clé stable d'itération (System.IterationPath) pour jalons & flags : survit au
-- réordonnancement/insertion d'itérations ADO. Nullable ; les lignes legacy
-- (sans path) retombent sur iter côté service. Aucun backfill nécessaire.
ALTER TABLE "milestones" ADD COLUMN "iteration_path" TEXT;
ALTER TABLE "row_pins" ADD COLUMN "iteration_path" TEXT;
