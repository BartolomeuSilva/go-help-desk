DROP INDEX IF EXISTS idx_tickets_whatsapp_phone;
ALTER TABLE tickets DROP COLUMN IF EXISTS source;
ALTER TABLE tickets DROP COLUMN IF EXISTS whatsapp_phone;

DROP INDEX IF EXISTS idx_replies_external_message_id;
ALTER TABLE ticket_replies DROP COLUMN IF EXISTS source;
ALTER TABLE ticket_replies DROP COLUMN IF EXISTS external_message_id;

DELETE FROM settings WHERE key IN (
  'whatsapp_enabled',
  'whatsapp_api_url',
  'whatsapp_api_token',
  'whatsapp_instance_name'
);
