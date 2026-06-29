/*
  Warnings:

  - Added the required column `ado_org` to the `planning_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "planning_sessions" ADD COLUMN     "ado_org" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_ado_org" TEXT;
