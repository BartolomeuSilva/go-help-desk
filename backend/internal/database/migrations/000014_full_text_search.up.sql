-- Up migration for Postgres Full-Text Search in Tickets and KB Articles

-- 1. For Tickets
ALTER TABLE tickets ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(description, ''))
) STORED;

CREATE INDEX tickets_tsv_idx ON tickets USING GIN (tsv);

-- 2. For KB Articles
ALTER TABLE kb_articles ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
) STORED;

CREATE INDEX kb_articles_tsv_idx ON kb_articles USING GIN (tsv);
