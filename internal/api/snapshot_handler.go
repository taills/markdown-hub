package api

import (
	"net/http"
	"strconv"

	"markdownhub/internal/core"
)

// SnapshotHandler handles version history operations.
type SnapshotHandler struct {
	snapshotService *core.SnapshotService
}

// NewSnapshotHandler constructs a SnapshotHandler.
func NewSnapshotHandler(snapshotService *core.SnapshotService) *SnapshotHandler {
	return &SnapshotHandler{snapshotService: snapshotService}
}

// Create godoc
// POST /api/documents/{id}/snapshots
func (h *SnapshotHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	var body struct {
		Message string `json:"message"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	snap, err := h.snapshotService.CreateSnapshot(r.Context(), docID, userID, body.Message)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, snap)
}

// List godoc
// GET /api/documents/{id}/snapshots?limit=20&offset=0
func (h *SnapshotHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	snaps, err := h.snapshotService.ListSnapshots(r.Context(), docID, userID, limit, offset)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, snaps)
}

// Restore godoc
// POST /api/snapshots/{id}/restore
func (h *SnapshotHandler) Restore(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	snapID := pathParam(r, "id")
	doc, err := h.snapshotService.RestoreSnapshot(r.Context(), snapID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// Diff godoc
// GET /api/snapshots/{id}/diff?compare={otherId}
func (h *SnapshotHandler) Diff(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	snapID := pathParam(r, "id")
	compareID := r.URL.Query().Get("compare")

	snap, err := h.snapshotService.GetSnapshot(r.Context(), snapID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	var compareContent string
	if compareID != "" {
		other, err := h.snapshotService.GetSnapshot(r.Context(), compareID, userID)
		if err != nil {
			writeError(w, errStatus(err), err.Error())
			return
		}
		compareContent = other.Content
	}

	diff := core.DiffSnapshots(compareContent, snap.Content)
	writeJSON(w, http.StatusOK, diff)
}

func queryInt(r *http.Request, key string, defaultVal int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return v
}
