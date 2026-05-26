-- name: CreateCannedResponse :one
INSERT INTO canned_responses (name, content)
VALUES ($1, $2)
RETURNING *;

-- name: GetCannedResponse :one
SELECT * FROM canned_responses
WHERE id = $1;

-- name: GetCannedResponseByName :one
SELECT * FROM canned_responses
WHERE name = $1;

-- name: ListCannedResponses :many
SELECT * FROM canned_responses
ORDER BY name ASC;

-- name: UpdateCannedResponse :one
UPDATE canned_responses
SET name = $2, content = $3, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteCannedResponse :exec
DELETE FROM canned_responses
WHERE id = $1;
