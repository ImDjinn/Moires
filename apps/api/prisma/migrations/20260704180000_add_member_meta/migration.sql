-- CreateTable
CREATE TABLE "member_meta" (
    "ado_project_id" TEXT NOT NULL,
    "member_hash" TEXT NOT NULL,
    "poste" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_meta_pkey" PRIMARY KEY ("ado_project_id","member_hash")
);
