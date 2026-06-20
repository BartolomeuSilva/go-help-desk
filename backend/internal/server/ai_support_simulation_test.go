package server_test

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/kb"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/stretchr/testify/require"
)

func TestAISupport_FullSimulation(t *testing.T) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		t.Skip("GEMINI_API_KEY environment variable not set, skipping simulation test")
	}

	h, cleanup := newHarness(t)
	defer cleanup()

	ctx := context.Background()

	// 1. Configure settings
	require.NoError(t, h.adminSvc.SetBool(ctx, admin.KeyWhatsAppChatbotEnabled, false))
	require.NoError(t, h.adminSvc.SetBool(ctx, admin.KeyWhatsAppAIEnabled, true))
	require.NoError(t, h.adminSvc.SetString(ctx, admin.KeyGeminiAPIKey, apiKey))
	require.NoError(t, h.adminSvc.SetString(ctx, admin.KeyWhatsAppAIThreshold, "0.4"))
	require.NoError(t, h.adminSvc.SetString(ctx, admin.KeyWhatsAppAIPrompt, "Você é um assistente de IA prestativo. Use estritamente as informações fornecidas nos artigos para responder."))
	require.NoError(t, h.adminSvc.SetString(ctx, admin.KeyWhatsAppAIHandoverMsg, "Transferindo para atendimento humano."))

	// 2. Create a Category
	catResp := h.doAsAdmin(t, http.MethodPost, "/api/v1/admin/kb/categories", map[string]any{
		"name":        "Suporte Técnico",
		"description": "Artigos para dúvidas de suporte",
		"is_public":    true,
	})
	require.Equal(t, http.StatusCreated, catResp.StatusCode)
	var cat kb.Category
	decodeJSON(t, catResp, &cat)

	// 3. Create a published Article
	artResp := h.doAsAdmin(t, http.MethodPost, "/api/v1/admin/kb/articles", map[string]any{
		"category_id": cat.ID,
		"title":       "Como redefinir a senha",
		"content":     "Para redefinir sua senha, vá em Login e clique em Esqueci minha senha. Um link de redefinição de senha será enviado ao seu e-mail.",
		"status":      "published",
	})
	require.Equal(t, http.StatusCreated, artResp.StatusCode)
	var art kb.Article
	decodeJSON(t, artResp, &art)

	// 4. Sync embeddings (triggers async background job)
	syncResp := h.doAsAdmin(t, http.MethodPost, "/api/v1/admin/kb/sync-embeddings", nil)
	require.Equal(t, http.StatusAccepted, syncResp.StatusCode)

	// Wait for sync background job to generate embedding
	time.Sleep(5 * time.Second)
	t.Log("Embeddings sync wait period completed")

	// 5. Send greeting message (Olá) -> Opens ticket, AIActive must remain true
	payload1 := map[string]any{
		"event":    "messages.upsert",
		"instance": "test",
		"data": map[string]any{
			"key": map[string]any{
				"remoteJid": "5511999999999@s.whatsapp.net",
				"fromMe":    false,
				"id":        "msg-sim-1",
			},
			"pushName": "Cliente Teste",
			"message": map[string]any{
				"conversation": "Olá",
			},
			"messageType": "conversation",
		},
	}
	resp1 := h.doUnauth(t, http.MethodPost, "/api/v1/webhooks/whatsapp", payload1)
	require.Equal(t, http.StatusCreated, resp1.StatusCode)

	var tk ticket.Ticket
	decodeJSON(t, resp1, &tk)
	require.True(t, tk.AIActive, "AIActive should be true after greeting")

	// 6. Send the actual question: "Como posso redefinir minha senha?"
	payload2 := map[string]any{
		"event":    "messages.upsert",
		"instance": "test",
		"data": map[string]any{
			"key": map[string]any{
				"remoteJid": "5511999999999@s.whatsapp.net",
				"fromMe":    false,
				"id":        "msg-sim-2",
			},
			"pushName": "Cliente Teste",
			"message": map[string]any{
				"conversation": "Como posso redefinir minha senha?",
			},
			"messageType": "conversation",
		},
	}
	resp2 := h.doUnauth(t, http.MethodPost, "/api/v1/webhooks/whatsapp", payload2)
	require.Equal(t, http.StatusOK, resp2.StatusCode)

	// Wait for processAISupport goroutine to run (e.g. 5 seconds)
	time.Sleep(5 * time.Second)

	// 7. Verify replies on the ticket
	t.Logf("Simulating replies request. Staff API Key: %s, Admin API Key: %s", h.apiKey, h.adminKey)
	repliesResp := h.doAsAdmin(t, http.MethodGet, fmt.Sprintf("/api/v1/tickets/%s/replies", tk.ID), nil)
	require.Equal(t, http.StatusOK, repliesResp.StatusCode)
	var replies []ticket.Reply
	decodeJSON(t, repliesResp, &replies)

	t.Logf("Total replies on ticket: %d", len(replies))
	for _, rep := range replies {
		t.Logf("Reply: %s", rep.Body)
	}

	// Verify that the ticket was NOT handed over (AIActive should still be true)
	getResp := h.doAsAdmin(t, http.MethodGet, "/api/v1/tickets/"+tk.ID.String(), nil)
	require.Equal(t, http.StatusOK, getResp.StatusCode)
	var updatedTk ticket.Ticket
	decodeJSON(t, getResp, &updatedTk)

	t.Logf("Ticket AIActive status: %v", updatedTk.AIActive)

	// Make sure we have a reply containing info from our KB article
	foundAnswer := false
	for _, rep := range replies {
		if !rep.Internal && rep.AuthorID == nil && rep.Body != "Como posso redefinir minha senha?" {
			foundAnswer = true
			require.Contains(t, rep.Body, "Esqueci minha senha")
		}
	}
	require.True(t, foundAnswer, "AI should have answered the question using KB article content")
	require.True(t, updatedTk.AIActive, "AI should remain active since it successfully answered the question")
}
