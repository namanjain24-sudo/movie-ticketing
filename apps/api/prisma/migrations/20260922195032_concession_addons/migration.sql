-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "addOnsMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ConcessionItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConcessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAddOn" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "concessionItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,

    CONSTRAINT "BookingAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingAddOn_bookingId_concessionItemId_key" ON "BookingAddOn"("bookingId", "concessionItemId");

-- AddForeignKey
ALTER TABLE "BookingAddOn" ADD CONSTRAINT "BookingAddOn_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAddOn" ADD CONSTRAINT "BookingAddOn_concessionItemId_fkey" FOREIGN KEY ("concessionItemId") REFERENCES "ConcessionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
