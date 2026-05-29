-- Add source and whatsapp_phone to tickets
ALTER TABLE tickets ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'web';
ALTER TABLE tickets ADD COLUMN whatsapp_phone VARCHAR(30) DEFAULT NULL;
CREATE INDEX idx_tickets_whatsapp_phone ON tickets(whatsapp_phone);

-- Add source and external_message_id to ticket_replies
ALTER TABLE ticket_replies ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'web';
ALTER TABLE ticket_replies ADD COLUMN external_message_id VARCHAR(255) DEFAULT NULL;
CREATE INDEX idx_replies_external_message_id ON ticket_replies(external_message_id);

-- Add WhatsApp integration settings
INSERT INTO settings (key, value) VALUES
('whatsapp_enabled', 'false'),
('whatsapp_api_url', '""'),
('whatsapp_api_token', '""'),
('whatsapp_instance_name', '""')
ON CONFLICT (key) DO NOTHING;
