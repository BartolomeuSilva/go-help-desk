ALTER TABLE tickets ADD COLUMN rating INT CHECK (rating >= 0 AND rating <= 5);
ALTER TABLE tickets ADD COLUMN rating_comment TEXT;
ALTER TABLE tickets ADD COLUMN rated_at TIMESTAMP WITH TIME ZONE;
