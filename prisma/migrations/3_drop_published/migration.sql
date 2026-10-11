-- Deprecate `published` (db-improvements entry 5, author 2026-09-02):
-- the API owns scheduling now, "published" means "started", and that
-- is derivable: start_time IS NOT NULL AND start_time <= now. The
-- CHECK published => start_time retires with the column (implied).
ALTER TABLE "polls" DROP CONSTRAINT "polls_published_requires_start";
ALTER TABLE "polls" DROP COLUMN "published";
