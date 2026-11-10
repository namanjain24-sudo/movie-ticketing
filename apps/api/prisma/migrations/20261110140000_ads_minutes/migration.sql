-- Minutes of advertising and trailers between the printed start and the first
-- frame of the film, so a ticket can say when the film actually begins.
--
-- Defaults to zero rather than to the twenty the catalogue uses: zero is the
-- honest answer for a row nobody has measured, and for an event, which runs
-- no trailers at all.
ALTER TABLE "Showtime" ADD COLUMN "adsMinutes" INTEGER NOT NULL DEFAULT 0;
