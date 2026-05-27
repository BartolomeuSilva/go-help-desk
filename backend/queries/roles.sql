-- name: CreateRole :exec
INSERT INTO roles (name, description, permissions, is_system, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: GetRole :one
SELECT * FROM roles
WHERE name = $1;

-- name: UpdateRole :exec
UPDATE roles
SET description = $2, permissions = $3, updated_at = $4
WHERE name = $1 AND is_system = false;

-- name: DeleteRole :exec
DELETE FROM roles
WHERE name = $1 AND is_system = false;

-- name: ListRoles :many
SELECT * FROM roles
ORDER BY is_system DESC, name ASC;
