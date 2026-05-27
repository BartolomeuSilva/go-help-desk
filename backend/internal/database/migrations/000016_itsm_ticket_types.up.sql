-- Add ITSM ticket type field to tickets (nullable for backwards compatibility).
ALTER TABLE tickets
    ADD COLUMN ticket_type TEXT CHECK (ticket_type IN ('incident', 'service_request', 'problem', 'change_request'));

-- Stores the default ticket type for each CTI node.
-- Lookup is hierarchical: item → type → category → NULL (no default).
-- type_id and item_id default to a sentinel UUID so we can use them in the PK.
CREATE TABLE cti_default_ticket_types (
    category_id UUID    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    type_id     UUID    NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    item_id     UUID    NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    ticket_type TEXT    NOT NULL CHECK (ticket_type IN ('incident', 'service_request', 'problem', 'change_request')),
    PRIMARY KEY (category_id, type_id, item_id)
);

CREATE INDEX cti_default_ticket_types_cat_idx  ON cti_default_ticket_types (category_id);
CREATE INDEX cti_default_ticket_types_type_idx ON cti_default_ticket_types (type_id)  WHERE type_id <> '00000000-0000-0000-0000-000000000000';
CREATE INDEX cti_default_ticket_types_item_idx ON cti_default_ticket_types (item_id)  WHERE item_id <> '00000000-0000-0000-0000-000000000000';
