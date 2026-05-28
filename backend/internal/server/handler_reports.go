package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
)

type csatReportsStore interface {
	GetOverallCSAT(ctx context.Context, arg dbgen.GetOverallCSATParams) (dbgen.GetOverallCSATRow, error)
	GetCSATDistribution(ctx context.Context, arg dbgen.GetCSATDistributionParams) ([]dbgen.GetCSATDistributionRow, error)
	GetAgentCSATPerformance(ctx context.Context) ([]dbgen.GetAgentCSATPerformanceRow, error)
	GetRecentCSATComments(ctx context.Context, arg dbgen.GetRecentCSATCommentsParams) ([]dbgen.GetRecentCSATCommentsRow, error)
}

type CSATReportResponse struct {
	CSATAverage        float64                `json:"csat_average"`
	RatedTicketsCount  int                    `json:"rated_tickets_count"`
	StarsDistribution  map[int]int            `json:"stars_distribution"`
	AgentPerformance   []AgentCSATPerformance `json:"agent_performance"`
	AISentimentSummary string                 `json:"ai_sentiment_summary"`
	AICoachingTips     []string               `json:"ai_coaching_tips"`
}

type AgentCSATPerformance struct {
	UserID            string  `json:"user_id"`
	UserName          string  `json:"user_name"`
	UserEmail         string  `json:"user_email"`
	RatedTicketsCount int     `json:"rated_tickets_count"`
	CSATAverage       float64 `json:"csat_average"`
}

type SendFeedbackRequest struct {
	AgentID          string   `json:"agent_id"`
	SentimentSummary string   `json:"sentiment_summary"`
	CoachingTips     []string `json:"coaching_tips"`
}

type emailSender interface {
	SendCSATFeedbackEmail(to, agentName, sentimentSummary string, coachingTips []string) error
}

type geminiRequest struct {
	Contents         []geminiContent  `json:"contents"`
	GenerationConfig *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenConfig struct {
	ResponseMimeType string `json:"responseMimeType,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

type aiCoachResult struct {
	SentimentSummary string   `json:"sentiment_summary"`
	CoachingTips     []string `json:"coaching_tips"`
}

func (s *Server) handleGetCSATReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	store, ok := s.db.(csatReportsStore)
	if !ok {
		Error(w, http.StatusInternalServerError, "server_error", "database store does not support report operations")
		return
	}

	// 0. Obter filtro opcional de atendente
	assigneeIDStr := r.URL.Query().Get("assignee_id")
	var assigneeUUID uuid.NullUUID
	if assigneeIDStr != "" {
		id, err := uuid.Parse(assigneeIDStr)
		if err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "invalid assignee_id")
			return
		}
		assigneeUUID = uuid.NullUUID{UUID: id, Valid: true}
	}

	// 0.1 Obter filtro opcional de cliente (reporter_id)
	reporterIDStr := r.URL.Query().Get("reporter_id")
	var reporterUUID uuid.NullUUID
	if reporterIDStr != "" {
		id, err := uuid.Parse(reporterIDStr)
		if err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "invalid reporter_id")
			return
		}
		reporterUUID = uuid.NullUUID{UUID: id, Valid: true}
	}

	// 1. CSAT Geral
	overall, err := store.GetOverallCSAT(ctx, dbgen.GetOverallCSATParams{
		AssigneeUserID: assigneeUUID,
		ReporterUserID: reporterUUID,
	})
	if err != nil {
		handleError(w, err)
		return
	}

	// 2. Distribuição das Estrelas
	distRows, err := store.GetCSATDistribution(ctx, dbgen.GetCSATDistributionParams{
		AssigneeUserID: assigneeUUID,
		ReporterUserID: reporterUUID,
	})
	if err != nil {
		handleError(w, err)
		return
	}
	starsDist := map[int]int{1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
	for _, row := range distRows {
		if row.Rating >= 1 && row.Rating <= 5 {
			starsDist[int(row.Rating)] = int(row.Count)
		}
	}

	// 3. Desempenho por Agente (lista comparativa de todo o time)
	agentRows, err := store.GetAgentCSATPerformance(ctx)
	if err != nil {
		handleError(w, err)
		return
	}
	agents := make([]AgentCSATPerformance, len(agentRows))
	for i, row := range agentRows {
		agents[i] = AgentCSATPerformance{
			UserID:            row.UserID.String(),
			UserName:          row.UserName,
			UserEmail:         row.UserEmail,
			RatedTicketsCount: int(row.RatedTicketsCount),
			CSATAverage:       row.CsatAverage,
		}
	}

	// 4. Gemini AI Coach
	sentimentSummary := "Sem avaliações com comentários suficientes para análise da IA. Avalie mais atendimentos para obter feedback da IA."
	var coachingTips []string

	apiKey := s.adminSvc.GeminiAPIKey(ctx)
	if apiKey == "" {
		sentimentSummary = "IA Coach indisponível: Chave de API do Gemini não configurada nas configurações do sistema."
	} else {
		// Buscar comentários recentes (filtrados ou gerais)
		comments, err := store.GetRecentCSATComments(ctx, dbgen.GetRecentCSATCommentsParams{
			AssigneeUserID: assigneeUUID,
			ReporterUserID: reporterUUID,
		})
		if err == nil && len(comments) > 0 {
			var sb strings.Builder
			for _, c := range comments {
				assignee := "Sem atendente"
				if c.AssigneeName.Valid {
					assignee = c.AssigneeName.String
				}
				sb.WriteString(fmt.Sprintf("- Nota: %d estrelas. Comentário: %q. Atendente: %s\n", c.Rating, c.RatingComment, assignee))
			}

			aiRes, err := callGemini(ctx, apiKey, sb.String())
			if err != nil {
				slog.Error("Failed to get coaching tips from Gemini", "error", err)
				sentimentSummary = "Erro ao se comunicar com o IA Coach. Verifique se a sua Gemini API Key está correta e ativa."
			} else {
				sentimentSummary = aiRes.SentimentSummary
				coachingTips = aiRes.CoachingTips
			}
		} else if err != nil {
			slog.Error("Failed to fetch recent CSAT comments", "error", err)
		}
	}

	if coachingTips == nil {
		coachingTips = []string{}
	}

	res := CSATReportResponse{
		CSATAverage:        overall.CsatAverage,
		RatedTicketsCount:  int(overall.RatedTicketsCount),
		StarsDistribution:  starsDist,
		AgentPerformance:   agents,
		AISentimentSummary: sentimentSummary,
		AICoachingTips:     coachingTips,
	}

	JSON(w, http.StatusOK, res)
}

func (s *Server) handleSendCSATFeedback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req SendFeedbackRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	agentID, err := uuid.Parse(req.AgentID)
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid agent ID")
		return
	}

	u, err := s.users.GetByID(ctx, agentID)
	if err != nil {
		handleError(w, err)
		return
	}

	sender, ok := s.registration.Mailer().(emailSender)
	if !ok {
		Error(w, http.StatusInternalServerError, "server_error", "email sender is not configured or supported")
		return
	}

	err = sender.SendCSATFeedbackEmail(u.Email, u.DisplayName, req.SentimentSummary, req.CoachingTips)
	if err != nil {
		handleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func callGemini(ctx context.Context, apiKey, data string) (*aiCoachResult, error) {
	prompt := fmt.Sprintf("Você é um analista de qualidade e coach de suporte técnico de um help desk.\n" +
		"Analise os seguintes comentários e avaliações de clientes recentes sobre o atendimento da equipe.\n" +
		"Gere um JSON no seguinte formato:\n" +
		"{\n" +
		"  \"sentiment_summary\": \"Um parágrafo resumindo os pontos positivos e negativos destacados pelos clientes recentemente de forma construtiva (máximo de 3 a 4 frases). Escreva sempre em português.\",\n" +
		"  \"coaching_tips\": [\n" +
		"    \"Dica prática 1 em português baseada nas reclamações ou feedbacks dos clientes para a equipe melhorar o atendimento.\",\n" +
		"    \"Dica prática 2 em português...\",\n" +
		"    \"Dica prática 3 em português...\"\n" +
		"  ]\n" +
		"}\n\n" +
		"Comentários e avaliações dos clientes:\n%s\n\n" +
		"Responda APENAS com o JSON estruturado acima. Não inclua Markdown como blocos de código com três crases ou qualquer outro texto explicativo antes ou depois.", data)

	reqPayload := geminiRequest{
		Contents: []geminiContent{
			{
				Parts: []geminiPart{
					{Text: prompt},
				},
			},
		},
		GenerationConfig: &geminiGenConfig{
			ResponseMimeType: "application/json",
		},
	}

	bodyBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("marshalling gemini request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("creating HTTP request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending HTTP request to Gemini: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errMap map[string]interface{}
		_ = json.NewDecoder(resp.Body).Decode(&errMap)
		return nil, fmt.Errorf("gemini API returned status %d: %v", resp.StatusCode, errMap)
	}

	var geminiRes geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&geminiRes); err != nil {
		return nil, fmt.Errorf("decoding gemini response: %w", err)
	}

	if len(geminiRes.Candidates) == 0 || len(geminiRes.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty candidates or parts in gemini response")
	}

	responseText := geminiRes.Candidates[0].Content.Parts[0].Text

	var result aiCoachResult
	if err := json.Unmarshal([]byte(responseText), &result); err != nil {
		cleaned := strings.TrimSpace(responseText)
		cleaned = strings.TrimPrefix(cleaned, "```json")
		cleaned = strings.TrimPrefix(cleaned, "```")
		cleaned = strings.TrimSuffix(cleaned, "```")
		cleaned = strings.TrimSpace(cleaned)

		if err2 := json.Unmarshal([]byte(cleaned), &result); err2 != nil {
			return nil, fmt.Errorf("parsing gemini text response as JSON: %w (original: %q)", err2, responseText)
		}
	}

	return &result, nil
}
