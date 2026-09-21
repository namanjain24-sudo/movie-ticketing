-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('PERCENT', 'FLAT');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "discountMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoCodeId" TEXT;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "PromoKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscountMinor" INTEGER,
    "minSubtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "Booking_promoCodeId_status_idx" ON "Booking"("promoCodeId", "status");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
