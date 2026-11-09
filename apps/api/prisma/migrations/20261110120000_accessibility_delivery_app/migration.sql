-- The app a person needs on their own phone to receive audio description or
-- a sign-language feed, where the cinema does not play it to the room.
--
-- Nullable with no default: null is "nothing to install", which is both the
-- common case and genuinely different from an empty string.
ALTER TABLE "Showtime" ADD COLUMN "accessibilityVia" TEXT;
