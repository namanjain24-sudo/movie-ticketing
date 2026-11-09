-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "organiserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMember" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanOption" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "showtimeId" TEXT NOT NULL,

    CONSTRAINT "PlanOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Plan_organiserId_expiresAt_idx" ON "Plan"("organiserId", "expiresAt");

-- CreateIndex
CREATE INDEX "PlanMember_userId_idx" ON "PlanMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMember_planId_userId_key" ON "PlanMember"("planId", "userId");

-- CreateIndex
CREATE INDEX "PlanOption_showtimeId_idx" ON "PlanOption"("showtimeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanOption_planId_showtimeId_key" ON "PlanOption"("planId", "showtimeId");

-- CreateIndex
CREATE INDEX "PlanVote_userId_idx" ON "PlanVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanVote_optionId_userId_key" ON "PlanVote"("optionId", "userId");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMember" ADD CONSTRAINT "PlanMember_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMember" ADD CONSTRAINT "PlanMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOption" ADD CONSTRAINT "PlanOption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOption" ADD CONSTRAINT "PlanOption_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVote" ADD CONSTRAINT "PlanVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PlanOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanVote" ADD CONSTRAINT "PlanVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
