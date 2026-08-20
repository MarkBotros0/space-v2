-- DropForeignKey
ALTER TABLE "JpcEvent" DROP CONSTRAINT "JpcEvent_createdById_fkey";

-- AlterTable
ALTER TABLE "JpcEvent" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "JpcEvent_date_idx" ON "JpcEvent"("date");

-- AddForeignKey
ALTER TABLE "JpcEvent" ADD CONSTRAINT "JpcEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
