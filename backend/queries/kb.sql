-- name: CreateKBCategory :one
INSERT INTO kb_categories (name, description, is_public)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetKBCategory :one
SELECT * FROM kb_categories
WHERE id = $1;

-- name: GetKBCategoryByName :one
SELECT * FROM kb_categories
WHERE name = $1;

-- name: ListKBCategories :many
SELECT * FROM kb_categories
ORDER BY name ASC;

-- name: UpdateKBCategory :one
UPDATE kb_categories
SET name = $2, description = $3, is_public = $4, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteKBCategory :exec
DELETE FROM kb_categories
WHERE id = $1;

-- name: CreateKBArticle :one
INSERT INTO kb_articles (category_id, title, content, status)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetKBArticle :one
SELECT * FROM kb_articles
WHERE id = $1;

-- name: ListKBArticles :many
SELECT * FROM kb_articles
ORDER BY created_at DESC;

-- name: ListKBArticlesByCategory :many
SELECT * FROM kb_articles
WHERE category_id = $1
ORDER BY created_at DESC;

-- name: UpdateKBArticle :one
UPDATE kb_articles
SET category_id = $2, title = $3, content = $4, status = $5, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteKBArticle :exec
DELETE FROM kb_articles
WHERE id = $1;

-- name: IncrementKBArticleViews :exec
UPDATE kb_articles
SET views = views + 1
WHERE id = $1;
