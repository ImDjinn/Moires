-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "iter" INTEGER NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "row_pins" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "row_key" TEXT NOT NULL,
    "iter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "row_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestones_session_id_idx" ON "milestones"("session_id");

-- CreateIndex
CREATE INDEX "row_pins_session_id_idx" ON "row_pins"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "row_pins_session_id_row_key_key" ON "row_pins"("session_id", "row_key");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_pins" ADD CONSTRAINT "row_pins_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "planning_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
