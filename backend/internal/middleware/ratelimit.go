package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ipLimit struct {
	failures []time.Time
}

// LoginRateLimiter implements thread-safe rate limiting for login attempts by IP.
type LoginRateLimiter struct {
	mu     sync.Mutex
	limits map[string]*ipLimit
	max    int
	window time.Duration
}

// NewLoginRateLimiter creates a new rate limiter instance.
func NewLoginRateLimiter(max int, window time.Duration) *LoginRateLimiter {
	limiter := &LoginRateLimiter{
		limits: make(map[string]*ipLimit),
		max:    max,
		window: window,
	}

	// Periodically clean up stale entries to prevent memory leaks
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			limiter.cleanup()
		}
	}()

	return limiter
}

func (l *LoginRateLimiter) cleanup() {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	for ip, val := range l.limits {
		var valid []time.Time
		for _, t := range val.failures {
			if now.Sub(t) < l.window {
				valid = append(valid, t)
			}
		}
		if len(valid) == 0 {
			delete(l.limits, ip)
		} else {
			val.failures = valid
		}
	}
}

func getIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		parts := strings.Split(ip, ",")
		return strings.TrimSpace(parts[0])
	}
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// statusWriter wraps http.ResponseWriter to capture the returned status code.
type statusWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *statusWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

// Limit returns a middleware that limits failed login attempts.
func (l *LoginRateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getIP(r)

		l.mu.Lock()
		val, exists := l.limits[ip]
		if !exists {
			val = &ipLimit{}
			l.limits[ip] = val
		}

		now := time.Now()
		var valid []time.Time
		for _, t := range val.failures {
			if now.Sub(t) < l.window {
				valid = append(valid, t)
			}
		}
		val.failures = valid

		if len(val.failures) >= l.max {
			l.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"code":"too_many_requests","message":"Too many failed login attempts. Please try again in 15 minutes."}}`))
			return
		}
		l.mu.Unlock()

		sw := &statusWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(sw, r)

		if sw.statusCode == http.StatusUnauthorized {
			l.mu.Lock()
			val.failures = append(val.failures, now)
			l.mu.Unlock()
		}
	})
}
