-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "azure_ad_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_sessions" (
    "id" TEXT NOT NULL,
    "ado_project_id" TEXT NOT NULL,
    "ado_iteration_ids" TEXT[],
    "area_paths" TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ado_sync_status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "operations_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets_cache" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee_id" TEXT,
    "area_path" TEXT NOT NULL,
    "iteration_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "estimate_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ado_rev" INTEGER NOT NULL,
    "sync_status" TEXT NOT NULL DEFAULT 'synced',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_azure_ad_id_key" ON "users"("azure_ad_id");

-- CreateIndex
CREATE INDEX "operations_log_session_id_idx" ON "operations_log"("session_id");

-- CreateIndex
CREATE INDEX "operations_log_ticket_id_idx" ON "operations_log"("ticket_id");

-- CreateIndex
CREATE INDEX "tickets_cache_iteration_id_idx" ON "tickets_cache"("iteration_id");

-- AddForeignKey
ALTER TABLE "planning_sessions" ADD CONSTRAINT "planning_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_log" ADD CONSTRAINT "operations_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_log" ADD CONSTRAINT "operations_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets_cache" ADD CONSTRAINT "tickets_cache_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
