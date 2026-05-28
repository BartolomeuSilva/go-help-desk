INSERT INTO settings (key, value) VALUES
('email_provider', '"disabled"'),
('email_smtp_host', '""'),
('email_smtp_port', '587'),
('email_smtp_user', '""'),
('email_smtp_password', '""'),
('email_smtp_from', '""'),
('email_resend_api_key', '""'),
('email_resend_from', '""')
ON CONFLICT (key) DO NOTHING;
