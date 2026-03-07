package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"markdownhub/internal/core"
	"markdownhub/internal/store"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

// checkOrigin validates the WebSocket origin for security.
// In production, configure allowed origins via ALLOWED_ORIGINS environment variable.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// No origin header, allow (same-origin request)
		return true
	}

	// Get allowed origins from environment variable
	allowedOrigins := getAllowedOrigins()
	if len(allowedOrigins) == 0 {
		// No allowed origins configured, allow all (development mode)
		return true
	}

	// Check if origin is in allowed list
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	return false
}

// getAllowedOrigins returns the list of allowed origins from environment variable.
func getAllowedOrigins() []string {
	origins := os.Getenv("ALLOWED_ORIGINS")
	if origins == "" {
		return nil
	}
	return strings.Split(origins, ",")
}

// WSMessage is the envelope for all WebSocket messages.
type WSMessage struct {
	Type       string          `json:"type"`
	DocumentID string          `json:"document_id,omitempty"`
	UserID     string          `json:"user_id,omitempty"`
	Content    string          `json:"content,omitempty"`
	Payload    json.RawMessage `json:"payload,omitempty"`
	Timestamp  int64           `json:"timestamp"`
}

// LinePatch represents a line-based diff patch.
type LinePatch struct {
	StartLine   int      `json:"start_line"`
	DeleteCount int      `json:"delete_count"`
	InsertLines []string `json:"insert_lines"`
}

func splitLines(content string) []string {
	return strings.Split(content, "\n")
}

func applyLinePatch(content string, patch LinePatch) (string, error) {
	lines := splitLines(content)
	if patch.StartLine < 0 || patch.StartLine > len(lines) {
		return "", errors.New("invalid patch start_line")
	}
	if patch.DeleteCount < 0 {
		return "", errors.New("invalid patch delete_count")
	}
	end := patch.StartLine + patch.DeleteCount
	if end > len(lines) {
		return "", errors.New("invalid patch range")
	}
	updated := make([]string, 0, len(lines)-patch.DeleteCount+len(patch.InsertLines))
	updated = append(updated, lines[:patch.StartLine]...)
	updated = append(updated, patch.InsertLines...)
	updated = append(updated, lines[end:]...)
	return strings.Join(updated, "\n"), nil
}

// client represents a single WebSocket connection.
type client struct {
	conn       *websocket.Conn
	send       chan WSMessage
	userID     string
	documentID string
	mu         sync.Mutex
}

func (c *client) writeMessage(msg WSMessage) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
	return c.conn.WriteJSON(msg)
}

// Hub manages all active WebSocket clients per document.
type Hub struct {
	mu     sync.RWMutex
	rooms  map[string]map[*client]struct{} // documentID -> set of clients
	docSvc *core.DocumentService
	db     *store.DB
}

// NewHub constructs a Hub.
func NewHub(docSvc *core.DocumentService, db *store.DB) *Hub {
	return &Hub{
		rooms:  make(map[string]map[*client]struct{}),
		docSvc: docSvc,
		db:     db,
	}
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.documentID] == nil {
		h.rooms[c.documentID] = make(map[*client]struct{})
	}
	h.rooms[c.documentID][c] = struct{}{}
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[c.documentID]; ok {
		delete(room, c)
		if len(room) == 0 {
			delete(h.rooms, c.documentID)
		}
	}
}

// broadcast sends a message to all clients in a document room except the sender.
func (h *Hub) broadcast(sender *client, msg WSMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[msg.DocumentID] {
		if c == sender {
			continue
		}
		select {
		case c.send <- msg:
		default:
			// Slow client; drop message.
		}
	}
}

// ServeWS upgrades the HTTP connection and starts read/write pumps.
// GET /ws?document_id=<id>&token=<jwt>
func (h *Hub) ServeWS(c *gin.Context) {
	tokenString := c.Query("token")
	if tokenString == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}
	claims, err := parseToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	documentID := c.Query("document_id")
	if documentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing document_id"})
		return
	}

	// Verify the user has at least read access.
	doc, err := h.docSvc.GetDocument(c.Request.Context(), documentID, claims.UserID)
	if errors.Is(err, core.ErrUnauthorized) {
		c.JSON(http.StatusForbidden, gin.H{"error": "no access"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "document error"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	cl := &client{
		conn:       conn,
		send:       make(chan WSMessage, 64),
		userID:     claims.UserID,
		documentID: documentID,
	}
	h.register(cl)

	// Send the current document state immediately.
	go func() {
		cl.send <- WSMessage{
			Type:       "init",
			DocumentID: documentID,
			Content:    doc.Content,
			Timestamp:  time.Now().UnixMilli(),
		}
	}()

	go cl.writePump(h)
	cl.readPump(h)
}

func (c *client) readPump(h *Hub) {
	defer func() {
		h.unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		var msg WSMessage
		if err := c.conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws read error user=%s: %v", c.userID, err)
			}
			break
		}
		msg.UserID = c.userID
		msg.DocumentID = c.documentID
		msg.Timestamp = time.Now().UnixMilli()

		switch msg.Type {
		case "update":
			ctx := context.Background()
			doc, err := h.docSvc.UpdateContent(ctx, c.documentID, c.userID, msg.Content)
			if err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   err.Error(),
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			msg.Content = doc.Content
			h.broadcast(c, msg)
		case "patch":
			if len(msg.Payload) == 0 {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   "missing patch payload",
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			var patch LinePatch
			if err := json.Unmarshal(msg.Payload, &patch); err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   "invalid patch payload",
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			ctx := context.Background()
			doc, err := h.docSvc.GetDocument(ctx, c.documentID, c.userID)
			if err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   err.Error(),
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			updatedContent, err := applyLinePatch(doc.Content, patch)
			if err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   err.Error(),
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			_, err = h.docSvc.UpdateContent(ctx, c.documentID, c.userID, updatedContent)
			if err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   err.Error(),
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			patchPayload, err := json.Marshal(patch)
			if err != nil {
				_ = c.writeMessage(WSMessage{
					Type:      "error",
					Content:   "failed to encode patch",
					Timestamp: time.Now().UnixMilli(),
				})
				continue
			}
			msg.Payload = patchPayload
			msg.Content = ""
			h.broadcast(c, msg)
		default:
			h.broadcast(c, msg)
		}
	}
}

func (c *client) writePump(h *Hub) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.writeMessage(WSMessage{Type: "close"})
				return
			}
			if err := c.writeMessage(msg); err != nil {
				return
			}
		case <-ticker.C:
			c.mu.Lock()
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			err := c.conn.WriteMessage(websocket.PingMessage, nil)
			c.mu.Unlock()
			if err != nil {
				return
			}
		}
	}
}
