-- Down migration to revert Postgres Full-Text Search

DROP INDEX IF EXISTS kb_articles_tsv_idx;
ALTER TABLE kb_articles DROP COLUMN IF EXISTS tsv;

DROP INDEX IF EXISTS tickets_tsv_idx;
ALTER TABLE tickets DROP COLUMN IF EXISTS tsv;
