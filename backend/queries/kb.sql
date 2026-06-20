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

-- name: SearchKBArticlesAll :many
SELECT * FROM kb_articles
WHERE tsv @@ websearch_to_tsquery('simple', $1)
ORDER BY created_at DESC;

-- name: SearchKBArticlesPublic :many
SELECT a.* FROM kb_articles a
JOIN kb_categories c ON a.category_id = c.id
WHERE c.is_public = true AND a.status = 'published'
  AND a.tsv @@ websearch_to_tsquery('simple', $1)
ORDER BY a.created_at DESC;

-- name: UpdateKBArticleEmbedding :exec
UPDATE kb_articles
SET embedding = $2, updated_at = now()
WHERE id = $1;

-- name: GetSimilarKBArticles :many
SELECT id, category_id, title, content, status, views, created_at, updated_at,
       (embedding <=> $1)::float4 as distance
FROM kb_articles
WHERE status = 'published' AND embedding IS NOT NULL
ORDER BY embedding <=> $1
LIMIT $2;
