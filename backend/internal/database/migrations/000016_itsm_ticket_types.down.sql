DROP TABLE IF EXISTS cti_default_ticket_types;
ALTER TABLE tickets DROP COLUMN IF EXISTS ticket_type;
