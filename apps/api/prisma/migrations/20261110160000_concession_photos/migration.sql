-- A photograph for each concession item, with the credit its licence requires.
--
-- Nullable: an item with no picture draws without one. The credit columns are
-- separate from the URL on purpose - a CC BY image shipped without its author
-- named is a licence breach, and keeping them together makes it obvious that
-- one is never useful without the other.
ALTER TABLE "ConcessionItem" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "ConcessionItem" ADD COLUMN "imageCredit" TEXT;
ALTER TABLE "ConcessionItem" ADD COLUMN "imageCreditUrl" TEXT;
