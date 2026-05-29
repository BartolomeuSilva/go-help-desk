-- name: CreateWhatsAppSession :exec
INSERT INTO whatsapp_sessions (phone, initial_message, media_url, mime_type, created_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (phone) DO UPDATE SET 
    initial_message = EXCLUDED.initial_message, 
    media_url = EXCLUDED.media_url,
    mime_type = EXCLUDED.mime_type,
    created_at = NOW();

-- name: GetWhatsAppSession :one
SELECT initial_message, media_url, mime_type FROM whatsapp_sessions
WHERE phone = $1;

-- name: DeleteWhatsAppSession :exec
DELETE FROM whatsapp_sessions
WHERE phone = $1;
