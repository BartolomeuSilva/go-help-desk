package server

import "testing"

func TestParseSessionMediaRef(t *testing.T) {
	cases := []struct {
		name        string
		ref         string
		wantBase64  string
		wantMessage string
	}{
		{"base64 prefix", "b64:AAAA", "AAAA", ""},
		{"id prefix", "id:MSG123", "", "MSG123"},
		{"legacy value treated as id", "MSG123", "", "MSG123"},
		{"empty", "", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b64, msg := parseSessionMediaRef(tc.ref)
			if b64 != tc.wantBase64 || msg != tc.wantMessage {
				t.Errorf("parseSessionMediaRef(%q) = (%q, %q), want (%q, %q)",
					tc.ref, b64, msg, tc.wantBase64, tc.wantMessage)
			}
		})
	}
}
