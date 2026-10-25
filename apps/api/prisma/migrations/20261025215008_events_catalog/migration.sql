-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('SPORT', 'CONCERT', 'COMEDY', 'WORKSHOP', 'THEATRE');

-- CreateEnum
CREATE TYPE "VenueKind" AS ENUM ('CINEMA', 'STADIUM', 'ARENA', 'THEATRE', 'STUDIO', 'OUTDOOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SeatTier" ADD VALUE 'VIP';
ALTER TYPE "SeatTier" ADD VALUE 'GOLD';
ALTER TYPE "SeatTier" ADD VALUE 'SILVER';
ALTER TYPE "SeatTier" ADD VALUE 'GENERAL';

-- AlterTable
ALTER TABLE "Cinema" ADD COLUMN     "kind" "VenueKind" NOT NULL DEFAULT 'CINEMA';

-- AlterTable
ALTER TABLE "Showtime" ADD COLUMN     "eventId" TEXT,
ALTER COLUMN "movieId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "EventKind" NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "backdropUrl" TEXT,
    "durationMins" INTEGER NOT NULL,
    "performers" TEXT[],
    "organiser" TEXT,
    "highlights" TEXT[],
    "tags" TEXT[],
    "minAge" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "Event_kind_isPublished_idx" ON "Event"("kind", "isPublished");

-- CreateIndex
CREATE INDEX "Event_isPublished_idx" ON "Event"("isPublished");

-- CreateIndex
CREATE INDEX "Showtime_eventId_startsAt_idx" ON "Showtime"("eventId", "startsAt");

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A showtime is for a film or for an event, never both and never neither.
--
-- A nullable pair of foreign keys cannot say "exactly one of" on its own, and
-- the alternative — trusting every insert site to get it right — is the kind
-- of rule that holds until the first script writes a row directly. Every
-- existing row has `movieId` set and `eventId` null, so this is satisfied by
-- the table as it stands and the migration cannot fail on existing data.
ALTER TABLE "Showtime"
  ADD CONSTRAINT "Showtime_exactly_one_subject"
  CHECK (("movieId" IS NOT NULL) <> ("eventId" IS NOT NULL));
