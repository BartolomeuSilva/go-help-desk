-- Remove default settings for AI support
DELETE FROM settings WHERE key IN (
    'whatsapp_ai_enabled',
    'whatsapp_ai_prompt',
    'whatsapp_ai_handover_msg',
    'whatsapp_ai_threshold'
);

-- Remove AI flags from tickets table
ALTER TABLE tickets DROP COLUMN IF EXISTS ai_active;
ALTER TABLE tickets DROP COLUMN IF EXISTS ai_transferred;

-- Remove HNSW index
DROP INDEX IF EXISTS kb_articles_embedding_hnsw_idx;

-- Remove embedding column from kb_articles
ALTER TABLE kb_articles DROP COLUMN IF EXISTS embedding;

-- Note: We generally don't drop the vector extension in case other tables use it.
