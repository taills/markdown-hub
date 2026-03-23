package core

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// CommentService handles comment business logic.
type CommentService struct {
	db          *store.DB
	permService *PermissionService
}

// NewCommentService constructs a CommentService.
func NewCommentService(db *store.DB, permService *PermissionService) *CommentService {
	return &CommentService{
		db:          db,
		permService: permService,
	}
}

// CreateComment creates a new comment on a document.
func (s *CommentService) CreateComment(ctx context.Context, documentID, authorID, content string, headingAnchor *string, parentID *string) (*models.Comment, error) {
	if content == "" {
		return nil, fmt.Errorf("%w: content is required", ErrInvalidInput)
	}
	if documentID == "" {
		return nil, fmt.Errorf("%w: document_id is required", ErrInvalidInput)
	}
	if authorID == "" {
		return nil, fmt.Errorf("%w: author_id is required", ErrInvalidInput)
	}

	// Verify document exists and user has read permission
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get document: %w", err)
	}

	authorUUID, err := uuid.Parse(authorID)
	if err != nil {
		return nil, fmt.Errorf("invalid author ID: %w", err)
	}

	// Require at least read permission on the document
	if err := s.permService.RequireDocumentPermission(ctx, documentID, authorID, doc.OwnerID.String(), models.PermissionRead); err != nil {
		return nil, err
	}

	// If parentID is provided, verify it exists and belongs to the same document
	var parentUUID uuid.NullUUID
	if parentID != nil && *parentID != "" {
		parentParsed, err := uuid.Parse(*parentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent ID: %w", err)
		}
		parentUUID = uuid.NullUUID{UUID: parentParsed, Valid: true}

		parentComment, err := s.db.GetCommentByID(ctx, parentParsed)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				return nil, fmt.Errorf("parent comment not found")
			}
			return nil, fmt.Errorf("get parent comment: %w", err)
		}
		if parentComment.DocumentID != docUUID {
			return nil, fmt.Errorf("parent comment belongs to different document")
		}
	}

	// Convert heading anchor
	var headingAnchorNull sql.NullString
	if headingAnchor != nil && *headingAnchor != "" {
		headingAnchorNull = sql.NullString{String: *headingAnchor, Valid: true}
	}

	// Create comment
	comment, err := s.db.CreateComment(ctx, store.CreateCommentParams{
		DocumentID:    docUUID,
		AuthorID:     authorUUID,
		Content:      content,
		HeadingAnchor: headingAnchorNull,
		ParentID:     parentUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create comment: %w", err)
	}

	return storeCommentToModel(&comment), nil
}

// GetComment retrieves a comment by ID.
func (s *CommentService) GetComment(ctx context.Context, commentID, userID string) (*models.Comment, error) {
	commentUUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}

	comment, err := s.db.GetCommentByID(ctx, commentUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get comment: %w", err)
	}

	// Get document to check permission
	doc, err := s.db.GetDocumentByID(ctx, comment.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Require read permission
	if err := s.permService.RequireDocumentPermission(ctx, doc.ID.String(), userID, doc.OwnerID.String(), models.PermissionRead); err != nil {
		return nil, err
	}

	model := storeCommentToModel(&comment)

	// Load replies if this is a root comment
	if !comment.ParentID.Valid {
		replies, err := s.db.ListCommentReplies(ctx, uuid.NullUUID{UUID: commentUUID, Valid: true})
		if err == nil {
			model.Replies = storeCommentsToModels(replies)
		}
	}

	return model, nil
}

// ListCommentsByDocument returns all comments for a document.
func (s *CommentService) ListCommentsByDocument(ctx context.Context, documentID, userID string) ([]*models.Comment, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Require read permission
	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, doc.OwnerID.String(), models.PermissionRead); err != nil {
		return nil, err
	}

	comments, err := s.db.ListCommentsByDocument(ctx, docUUID)
	if err != nil {
		return nil, fmt.Errorf("list comments: %w", err)
	}

	return buildCommentTree(comments), nil
}

// ListCommentsByHeading returns all comments for a specific heading in a document.
func (s *CommentService) ListCommentsByHeading(ctx context.Context, documentID, userID, headingAnchor string) ([]*models.Comment, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Require read permission
	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, doc.OwnerID.String(), models.PermissionRead); err != nil {
		return nil, err
	}

	comments, err := s.db.ListCommentsByDocumentAndAnchor(ctx, store.ListCommentsByDocumentAndAnchorParams{
		DocumentID:    docUUID,
		HeadingAnchor: sql.NullString{String: headingAnchor, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("list comments by heading: %w", err)
	}

	return storeCommentsToModels(comments), nil
}

// UpdateComment updates a comment's content.
func (s *CommentService) UpdateComment(ctx context.Context, commentID, userID, content string) (*models.Comment, error) {
	if content == "" {
		return nil, fmt.Errorf("%w: content is required", ErrInvalidInput)
	}

	commentUUID, err := uuid.Parse(commentID)
	if err != nil {
		return nil, fmt.Errorf("invalid comment ID: %w", err)
	}

	comment, err := s.db.GetCommentByID(ctx, commentUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.ErrNotFound
		}
		return nil, fmt.Errorf("get comment: %w", err)
	}

	// Only author can update their comment
	if comment.AuthorID.String() != userID {
		return nil, ErrForbidden
	}

	updatedComment, err := s.db.UpdateComment(ctx, store.UpdateCommentParams{
		ID:      commentUUID,
		Content: content,
	})
	if err != nil {
		return nil, fmt.Errorf("update comment: %w", err)
	}

	return storeCommentToModel(&updatedComment), nil
}

// DeleteComment deletes a comment.
func (s *CommentService) DeleteComment(ctx context.Context, commentID, userID string) error {
	commentUUID, err := uuid.Parse(commentID)
	if err != nil {
		return fmt.Errorf("invalid comment ID: %w", err)
	}

	comment, err := s.db.GetCommentByID(ctx, commentUUID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return store.ErrNotFound
		}
		return fmt.Errorf("get comment: %w", err)
	}

	// Get document to check permission
	doc, err := s.db.GetDocumentByID(ctx, comment.DocumentID)
	if err != nil {
		return fmt.Errorf("get document: %w", err)
	}

	// Only author can delete their comment, or document owner/manager can delete any comment
	isAuthor := comment.AuthorID.String() == userID

	// Check if user has manage permission by attempting to require it
	hasManagePermission := s.permService.RequireDocumentPermission(ctx, doc.ID.String(), userID, doc.OwnerID.String(), models.PermissionManage) == nil

	if !isAuthor && !hasManagePermission {
		return ErrForbidden
	}

	return s.db.DeleteComment(ctx, commentUUID)
}

// buildCommentTree builds a tree structure from flat comment list.
func buildCommentTree(comments []store.Comment) []*models.Comment {
	// Build map of root comments
	rootMap := make(map[string]*models.Comment)
	var rootComments []*models.Comment

	// First pass: create all comment models
	for _, c := range comments {
		model := storeCommentToModel(&c)
		if !c.ParentID.Valid {
			rootMap[c.ID.String()] = model
			rootComments = append(rootComments, model)
		}
	}

	// Second pass: attach replies to parents
	for _, c := range comments {
		if c.ParentID.Valid {
			parentID := c.ParentID.UUID.String()
			if parent, ok := rootMap[parentID]; ok {
				if parent.Replies == nil {
					parent.Replies = []*models.Comment{}
				}
				parent.Replies = append(parent.Replies, storeCommentToModel(&c))
			}
		}
	}

	return rootComments
}

// storeCommentToModel converts store.Comment to *models.Comment.
func storeCommentToModel(c *store.Comment) *models.Comment {
	model := &models.Comment{
		ID:         c.ID.String(),
		DocumentID: c.DocumentID.String(),
		AuthorID:   c.AuthorID.String(),
		Content:    c.Content,
		CreatedAt:  c.CreatedAt,
		UpdatedAt:  c.UpdatedAt,
	}

	if c.HeadingAnchor.Valid {
		model.HeadingAnchor = &c.HeadingAnchor.String
	}
	if c.ParentID.Valid {
		parentIDStr := c.ParentID.UUID.String()
		model.ParentID = &parentIDStr
	}

	return model
}

// storeCommentsToModels converts []store.Comment to []*models.Comment.
func storeCommentsToModels(comments []store.Comment) []*models.Comment {
	result := make([]*models.Comment, len(comments))
	for i := range comments {
		result[i] = storeCommentToModel(&comments[i])
	}
	return result
}
