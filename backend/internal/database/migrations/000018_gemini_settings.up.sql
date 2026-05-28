INSERT INTO settings (key, value) VALUES
    ('gemini_api_key', '""')
ON CONFLICT (key) DO NOTHING;
