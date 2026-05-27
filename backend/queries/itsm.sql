-- name: GetDefaultTicketType :one
-- Hierarchical lookup: item → type → category → no row.
-- Uses sentinel UUID '00000000-...' for missing type_id / item_id.
SELECT ticket_type FROM cti_default_ticket_types
WHERE category_id = $1
  AND type_id  = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
  AND item_id  = COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
LIMIT 1;

-- name: UpsertDefaultTicketType :exec
INSERT INTO cti_default_ticket_types (category_id, type_id, item_id, ticket_type)
VALUES (
    $1,
    COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid),
    $4
)
ON CONFLICT (category_id, type_id, item_id)
DO UPDATE SET ticket_type = EXCLUDED.ticket_type;

-- name: DeleteDefaultTicketType :exec
DELETE FROM cti_default_ticket_types
WHERE category_id = $1
  AND type_id  = COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
  AND item_id  = COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid);

-- name: ListDefaultTicketTypes :many
SELECT
    category_id,
    CASE WHEN type_id = '00000000-0000-0000-0000-000000000000' THEN NULL ELSE type_id END AS type_id,
    CASE WHEN item_id = '00000000-0000-0000-0000-000000000000' THEN NULL ELSE item_id END AS item_id,
    ticket_type
FROM cti_default_ticket_types
ORDER BY category_id, type_id, item_id;
