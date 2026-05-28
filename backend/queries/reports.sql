-- name: GetOverallCSAT :one
SELECT 
    COALESCE(AVG(rating)::float, 0.0)::float as csat_average, 
    COUNT(*)::int as rated_tickets_count 
FROM tickets 
WHERE rating IS NOT NULL
  AND (sqlc.narg('assignee_user_id')::uuid IS NULL OR assignee_user_id = sqlc.narg('assignee_user_id'))
  AND (sqlc.narg('reporter_user_id')::uuid IS NULL OR reporter_user_id = sqlc.narg('reporter_user_id'));

-- name: GetCSATDistribution :many
SELECT 
    rating::int as rating, 
    COUNT(*)::int as count 
FROM tickets 
WHERE rating IS NOT NULL 
  AND (sqlc.narg('assignee_user_id')::uuid IS NULL OR assignee_user_id = sqlc.narg('assignee_user_id'))
  AND (sqlc.narg('reporter_user_id')::uuid IS NULL OR reporter_user_id = sqlc.narg('reporter_user_id'))
GROUP BY rating
ORDER BY rating;

-- name: GetAgentCSATPerformance :many
SELECT 
    u.id as user_id, 
    u.display_name as user_name, 
    u.email as user_email,
    COUNT(t.id)::int as rated_tickets_count, 
    COALESCE(AVG(t.rating)::float, 0.0)::float as csat_average
FROM tickets t
JOIN users u ON t.assignee_user_id = u.id
WHERE t.rating IS NOT NULL
GROUP BY u.id, u.display_name, u.email
ORDER BY csat_average DESC, rated_tickets_count DESC;

-- name: GetRecentCSATComments :many
SELECT 
    t.id, 
    t.rating::int as rating, 
    t.rating_comment::text as rating_comment, 
    t.rated_at, 
    u.display_name as assignee_name
FROM tickets t
LEFT JOIN users u ON t.assignee_user_id = u.id
WHERE t.rating IS NOT NULL 
  AND t.rating_comment IS NOT NULL 
  AND t.rating_comment != ''
  AND (sqlc.narg('assignee_user_id')::uuid IS NULL OR t.assignee_user_id = sqlc.narg('assignee_user_id'))
  AND (sqlc.narg('reporter_user_id')::uuid IS NULL OR t.reporter_user_id = sqlc.narg('reporter_user_id'))
ORDER BY t.rated_at DESC
LIMIT 50;

