package core

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"markdownhub/internal/models"
	"markdownhub/internal/store"

	"github.com/google/uuid"
)

// AIService handles AI-related operations including conversation management and AI API calls.
type AIService struct {
	db         *store.DB
	httpClient *http.Client
	aiAPIKey   string
	aiAPIBase  string
	aiModel    string
}

// NewAIService constructs an AIService.
func NewAIService(db *store.DB) *AIService {
	return &AIService{
		db: db,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		aiAPIKey:  "",  // Loaded from settings
		aiAPIBase: "https://api.openai.com/v1",
		aiModel:   "gpt-4",
	}
}

// Configure sets the AI service configuration.
func (s *AIService) Configure(apiKey, apiBase, model string) {
	s.aiAPIKey = apiKey
	s.aiAPIBase = apiBase
	s.aiModel = model
}

// LoadConfig loads AI configuration from database settings.
func (s *AIService) LoadConfig(ctx context.Context) error {
	// Try to load AI settings from database
	settings, err := s.db.GetAllSettings(ctx)
	if err != nil {
		return fmt.Errorf("failed to load settings: %w", err)
	}

	for _, setting := range settings {
		switch setting.Key {
		case "AI_API_KEY":
			s.aiAPIKey = setting.Value
		case "AI_API_BASE":
			s.aiAPIBase = setting.Value
		case "AI_MODEL":
			s.aiModel = setting.Value
		}
	}

	return nil
}

// IsConfigured returns true if AI service is properly configured.
func (s *AIService) IsConfigured() bool {
	return s.aiAPIKey != ""
}

// CreateConversation creates a new AI conversation for a document.
func (s *AIService) CreateConversation(ctx context.Context, userID, documentID, title string) (*models.AIConversation, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	conv, err := s.db.CreateAIConversation(ctx, store.CreateAIConversationParams{
		UserID:     userUUID,
		DocumentID: docUUID,
		Title:      title,
	})
	if err != nil {
		return nil, fmt.Errorf("create AI conversation: %w", err)
	}

	return storeAIConversationToModel(&conv), nil
}

// GetConversation retrieves an AI conversation by ID.
func (s *AIService) GetConversation(ctx context.Context, conversationID string) (*models.AIConversation, error) {
	convUUID, err := uuid.Parse(conversationID)
	if err != nil {
		return nil, fmt.Errorf("invalid conversation ID: %w", err)
	}

	conv, err := s.db.GetAIConversationByID(ctx, convUUID)
	if err != nil {
		if err == store.ErrNotFound {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get AI conversation: %w", err)
	}

	return storeAIConversationToModel(&conv), nil
}

// ListConversationsByDocument returns all AI conversations for a document.
func (s *AIService) ListConversationsByDocument(ctx context.Context, documentID string, limit, offset int) ([]*models.AIConversation, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	convs, err := s.db.ListAIConversationsByDocument(ctx, store.ListAIConversationsByDocumentParams{
		DocumentID: docUUID,
		Limit:      int32(limit),
		Offset:     int32(offset),
	})
	if err != nil {
		return nil, fmt.Errorf("list AI conversations: %w", err)
	}

	return storeAIConversationsToModels(convs), nil
}

// DeleteConversation deletes an AI conversation and all its messages.
func (s *AIService) DeleteConversation(ctx context.Context, conversationID string) error {
	convUUID, err := uuid.Parse(conversationID)
	if err != nil {
		return fmt.Errorf("invalid conversation ID: %w", err)
	}

	return s.db.DeleteAIConversation(ctx, convUUID)
}

// ListMessages returns all messages in a conversation.
func (s *AIService) ListMessages(ctx context.Context, conversationID string) ([]*models.AIMessage, error) {
	convUUID, err := uuid.Parse(conversationID)
	if err != nil {
		return nil, fmt.Errorf("invalid conversation ID: %w", err)
	}

	msgs, err := s.db.ListAIMessagesByConversation(ctx, convUUID)
	if err != nil {
		return nil, fmt.Errorf("list AI messages: %w", err)
	}

	return storeAIMessagesToModels(msgs), nil
}

// AddMessage adds a new message to a conversation.
func (s *AIService) AddMessage(ctx context.Context, conversationID, role, content string) (*models.AIMessage, error) {
	convUUID, err := uuid.Parse(conversationID)
	if err != nil {
		return nil, fmt.Errorf("invalid conversation ID: %w", err)
	}

	msg, err := s.db.CreateAIMessage(ctx, store.CreateAIMessageParams{
		ConversationID: convUUID,
		Role:           role,
		Content:        content,
	})
	if err != nil {
		return nil, fmt.Errorf("create AI message: %w", err)
	}

	return storeAIMessageToModel(&msg), nil
}

// Ask sends a question to the AI and returns the response.
// It supports streaming via a callback function.
func (s *AIService) Ask(ctx context.Context, conversationID, question string, streamCallback func(string) error) error {
	if !s.IsConfigured() {
		return fmt.Errorf("AI service not configured")
	}

	// Get conversation to access document
	conv, err := s.GetConversation(ctx, conversationID)
	if err != nil {
		return fmt.Errorf("get conversation: %w", err)
	}

	// Get document content for context
	docUUID, err := uuid.Parse(conv.DocumentID)
	if err != nil {
		return fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		return fmt.Errorf("get document: %w", err)
	}

	// Save user message
	_, err = s.AddMessage(ctx, conversationID, models.AIRoleUser, question)
	if err != nil {
		return fmt.Errorf("save user message: %w", err)
	}

	// Build messages for AI
	messages := s.buildMessages(doc.Content, question)

	// Call AI API
	response, err := s.callAIAPI(ctx, messages)
	if err != nil {
		return fmt.Errorf("AI API call: %w", err)
	}

	// Call stream callback if provided
	if streamCallback != nil {
		if err := streamCallback(response); err != nil {
			return err
		}
	}

	// Save assistant response
	_, err = s.AddMessage(ctx, conversationID, models.AIRoleAssistant, response)
	if err != nil {
		return fmt.Errorf("save assistant message: %w", err)
	}

	return nil
}

// Summarize generates a summary of the document content.
func (s *AIService) Summarize(ctx context.Context, documentID string) (string, error) {
	if !s.IsConfigured() {
		return "", fmt.Errorf("AI service not configured")
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return "", fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		return "", fmt.Errorf("get document: %w", err)
	}

	prompt := fmt.Sprintf("请总结以下文档内容的要点，以 Markdown 格式返回：\n\n%s", doc.Content)

	messages := []map[string]string{
		{"role": "user", "content": prompt},
	}

	return s.callAIAPI(ctx, messages)
}

// Complete generates a completion for the given text.
func (s *AIService) Complete(ctx context.Context, documentID, text string) (string, error) {
	if !s.IsConfigured() {
		return "", fmt.Errorf("AI service not configured")
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return "", fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		return "", fmt.Errorf("get document: %w", err)
	}

	prompt := fmt.Sprintf("基于以下文档内容，续写或补全这段文字：\n\n文档内容：\n%s\n\n需要补全的文字：\n%s", doc.Content, text)

	messages := []map[string]string{
		{"role": "user", "content": prompt},
	}

	return s.callAIAPI(ctx, messages)
}

// Expand generates an expansion of the given paragraph.
func (s *AIService) Expand(ctx context.Context, documentID, paragraph string) (string, error) {
	if !s.IsConfigured() {
		return "", fmt.Errorf("AI service not configured")
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return "", fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		return "", fmt.Errorf("get document: %w", err)
	}

	prompt := fmt.Sprintf("基于以下文档内容，扩写或详细阐述这段文字：\n\n文档内容：\n%s\n\n需要扩写的段落：\n%s", doc.Content, paragraph)

	messages := []map[string]string{
		{"role": "user", "content": prompt},
	}

	return s.callAIAPI(ctx, messages)
}

// buildMessages constructs the message list for AI API call with conversation history.
func (s *AIService) buildMessages(documentContent, question string) []map[string]string {
	var messages []map[string]string

	// Add system prompt with document context
	systemPrompt := fmt.Sprintf("你是一个专业的 Markdown 文档助手。用户正在编辑一个文档，你可以基于文档内容回答问题。\n\n当前文档内容：\n%s", documentContent)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})

	// Add user question
	messages = append(messages, map[string]string{"role": "user", "content": question})

	return messages
}

// callAIAPI makes a call to the OpenAI-compatible API.
func (s *AIService) callAIAPI(ctx context.Context, messages []map[string]string) (string, error) {
	url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(s.aiAPIBase, "/"))

	requestBody := map[string]interface{}{
		"model": s.aiModel,
	}
	if len(messages) > 0 {
		requestBody["messages"] = messages
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", s.aiAPIKey))

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	return result.Choices[0].Message.Content, nil
}

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// storeAIConversationToModel converts a store.AiConversation to *models.AIConversation
func storeAIConversationToModel(c *store.AiConversation) *models.AIConversation {
	return &models.AIConversation{
		ID:         c.ID.String(),
		UserID:     c.UserID.String(),
		DocumentID: c.DocumentID.String(),
		Title:      c.Title,
		CreatedAt:  c.CreatedAt,
	}
}

// storeAIConversationsToModels converts []store.AiConversation to []*models.AIConversation
func storeAIConversationsToModels(convs []store.AiConversation) []*models.AIConversation {
	result := make([]*models.AIConversation, len(convs))
	for i := range convs {
		result[i] = storeAIConversationToModel(&convs[i])
	}
	return result
}

// storeAIMessageToModel converts a store.AiMessage to *models.AIMessage
func storeAIMessageToModel(m *store.AiMessage) *models.AIMessage {
	return &models.AIMessage{
		ID:             m.ID.String(),
		ConversationID: m.ConversationID.String(),
		Role:           m.Role,
		Content:        m.Content,
		CreatedAt:      m.CreatedAt,
	}
}

// storeAIMessagesToModels converts []store.AiMessage to []*models.AIMessage
func storeAIMessagesToModels(msgs []store.AiMessage) []*models.AIMessage {
	result := make([]*models.AIMessage, len(msgs))
	for i := range msgs {
		result[i] = storeAIMessageToModel(&msgs[i])
	}
	return result
}
