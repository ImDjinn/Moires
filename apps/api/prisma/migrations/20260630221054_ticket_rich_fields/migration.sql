-- AlterTable
ALTER TABLE "tickets_cache" ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "story_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "work_item_type" TEXT NOT NULL DEFAULT '';
