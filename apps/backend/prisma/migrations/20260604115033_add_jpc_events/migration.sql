-- CreateEnum
CREATE TYPE "JpcVisibility" AS ENUM ('ALL', 'ALUMNI_ONLY');

-- CreateTable
CREATE TABLE "JpcEvent" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "visibility" "JpcVisibility" NOT NULL DEFAULT 'ALL',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JpcEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "JpcEvent" ADD CONSTRAINT "JpcEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
