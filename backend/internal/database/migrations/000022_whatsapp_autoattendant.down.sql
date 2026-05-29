-- Drop whatsapp_sessions table
DROP TABLE IF EXISTS whatsapp_sessions;

-- Remove WhatsApp Chatbot settings
DELETE FROM settings WHERE key IN ('whatsapp_chatbot_enabled', 'whatsapp_welcome_message', 'whatsapp_menu_config');
