-- CreateTable
CREATE TABLE "CinemaFavorite" (
    "userId" TEXT NOT NULL,
    "cinemaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CinemaFavorite_pkey" PRIMARY KEY ("userId","cinemaId")
);

-- CreateIndex
CREATE INDEX "CinemaFavorite_userId_createdAt_idx" ON "CinemaFavorite"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CinemaFavorite" ADD CONSTRAINT "CinemaFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CinemaFavorite" ADD CONSTRAINT "CinemaFavorite_cinemaId_fkey" FOREIGN KEY ("cinemaId") REFERENCES "Cinema"("id") ON DELETE CASCADE ON UPDATE CASCADE;
