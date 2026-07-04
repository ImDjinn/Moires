-- CreateTable
CREATE TABLE "capacities" (
    "ado_project_id" TEXT NOT NULL,
    "iteration_path" TEXT NOT NULL,
    "member_hash" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacities_pkey" PRIMARY KEY ("ado_project_id","iteration_path","member_hash")
);
