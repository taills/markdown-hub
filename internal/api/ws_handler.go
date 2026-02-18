package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

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
	CheckOrigin:     func(r *http.Request) bool { return true }, // configure per-origin in production
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
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	tokenString := r.URL.Query().Get("token")
	if tokenString == "" {
		writeError(w, http.StatusUnauthorized, "missing token")
		return
	}
	c, err := parseToken(tokenString)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid token")
		return
	}
	documentID := r.URL.Query().Get("document_id")
	if documentID == "" {
		writeError(w, http.StatusBadRequest, "missing document_id")
		return
	}

	// Verify the user has at least read access.
	doc, err := h.docSvc.GetDocument(r.Context(), documentID, c.UserID)
	if errors.Is(err, core.ErrUnauthorized) {
		writeError(w, http.StatusForbidden, "no access")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "document error")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	cl := &client{
		conn:       conn,
		send:       make(chan WSMessage, 64),
		userID:     c.UserID,
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
