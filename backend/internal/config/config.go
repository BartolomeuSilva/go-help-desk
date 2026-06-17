package config

import "github.com/kelseyhightower/envconfig"

// Config holds all runtime configuration loaded from environment variables.
type Config struct {
	// Database
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`

	// Server
	HTTPPort int    `envconfig:"HTTP_PORT" default:"8080"`
	BaseURL  string `envconfig:"BASE_URL" required:"true"`

	// Auth
	SessionSecret string `envconfig:"SESSION_SECRET" required:"true"`
	JWTSecret     string `envconfig:"JWT_SECRET" required:"true"`

	// Email is configured entirely through the in-app admin settings
	// (provider, SMTP host/credentials or Resend API key). There is no
	// environment-variable configuration for email.

	// Features
	GuestSubmissionEnabled bool `envconfig:"GUEST_SUBMISSION_ENABLED" default:"false"`
	SLAEnabled             bool `envconfig:"SLA_ENABLED" default:"false"`
	MFAEnabled             bool `envconfig:"MFA_ENABLED" default:"false"`

	// Storage
	AttachmentDir string `envconfig:"ATTACHMENT_DIR" default:"/data/attachments"`

	// Antivirus — optional ClamAV daemon address (e.g. "tcp://localhost:3310").
	// When empty, virus scanning is skipped.
	ClamAVAddr string `envconfig:"CLAMAV_ADDR"`

	// Environment
	AppEnv   string `envconfig:"APP_ENV" default:"production"`
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// IsDevelopment returns true when running in development mode.
func (c *Config) IsDevelopment() bool {
	return c.AppEnv == "development"
}
