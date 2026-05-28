DELETE FROM settings WHERE key IN (
  'email_provider',
  'email_smtp_host',
  'email_smtp_port',
  'email_smtp_user',
  'email_smtp_password',
  'email_smtp_from',
  'email_resend_api_key',
  'email_resend_from'
);
