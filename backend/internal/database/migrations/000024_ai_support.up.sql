-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to kb_articles (768 dimensions for Gemini text-embedding-004)
ALTER TABLE kb_articles ADD COLUMN embedding vector(768);

-- Create HNSW index for cosine similarity search
CREATE INDEX kb_articles_embedding_hnsw_idx ON kb_articles USING hnsw (embedding vector_cosine_ops);

-- Add AI flags to tickets table
ALTER TABLE tickets ADD COLUMN ai_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tickets ADD COLUMN ai_transferred BOOLEAN NOT NULL DEFAULT FALSE;

-- Add default settings for AI support
INSERT INTO settings (key, value) VALUES
    ('whatsapp_ai_enabled', 'false'),
    ('whatsapp_ai_prompt', '"Você é o assistente virtual de suporte do Zendflow. Responda à dúvida do usuário com base nos seguintes artigos de ajuda da base de conhecimento fornecidos."'),
    ('whatsapp_ai_handover_msg', '"Não tenho essa resposta na minha base de conhecimento. Vou transferir você para um atendente humano. Por favor, aguarde um momento."'),
    ('whatsapp_ai_threshold', '0.4')
ON CONFLICT (key) DO NOTHING;
