INSERT INTO settings (key, value)
VALUES ('site_logo_dark_url', '""')
ON CONFLICT (key) DO NOTHING;
