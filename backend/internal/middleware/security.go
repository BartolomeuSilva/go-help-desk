package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders injects standard security headers to protect the client and server.
func SecurityHeaders(baseURL string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-XSS-Protection", "1; mode=block")
			
			// Allow self for assets, unsafe-inline for React and embedded styles, and WebSocket for SSE/Real-time.
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:;")

			// Enable HSTS only if base URL starts with https.
			if strings.HasPrefix(strings.ToLower(baseURL), "https://") {
				w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}

			next.ServeHTTP(w, r)
		})
	}
}
