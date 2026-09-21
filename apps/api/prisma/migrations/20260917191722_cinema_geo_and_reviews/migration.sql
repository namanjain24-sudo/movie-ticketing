-- AlterTable: Cinema gains a brand and a real location.
--
-- The three new columns are NOT NULL and existing rows have no value for them,
-- so they are added with a backfill default and the default is then dropped.
-- Keeping the default would let a future insert quietly place a cinema off the
-- coast of Africa rather than fail, which is the whole reason it is dropped.
--
-- (0, 0) is deliberately absurd as a Mumbai coordinate: the seed rewrites every
-- row immediately, and anything it missed is obvious on the map rather than
-- plausible.
ALTER TABLE "Cinema"
  ADD COLUMN "amenities" TEXT[],
  ADD COLUMN "brand"     TEXT             NOT NULL DEFAULT 'Independent',
  ADD COLUMN "latitude"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "longitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "phone"     TEXT;

ALTER TABLE "Cinema"
  ALTER COLUMN "brand"     DROP DEFAULT,
  ALTER COLUMN "latitude"  DROP DEFAULT,
  ALTER COLUMN "longitude" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_movieId_createdAt_idx" ON "Review"("movieId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_movieId_rating_idx" ON "Review"("movieId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_movieId_key" ON "Review"("userId", "movieId");

-- CreateIndex
CREATE INDEX "Cinema_brand_idx" ON "Cinema"("brand");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
