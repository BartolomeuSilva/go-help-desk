-- Create whatsapp_sessions table
CREATE TABLE whatsapp_sessions (
    phone VARCHAR(30) PRIMARY KEY,
    initial_message TEXT NOT NULL,
    media_url TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add WhatsApp Chatbot settings
INSERT INTO settings (key, value) VALUES
('whatsapp_chatbot_enabled', 'false'),
('whatsapp_welcome_message', '"Olá! Seja bem-vindo ao suporte. Por favor, digite o número correspondente à opção desejada:\n\n1. Suporte Técnico\n2. Financeiro"'),
('whatsapp_menu_config', '"{}"')
ON CONFLICT (key) DO NOTHING;
