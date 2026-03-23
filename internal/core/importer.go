package core

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	html2md "github.com/JohannesKaufmann/html-to-markdown"
	mdPlugin "github.com/JohannesKaufmann/html-to-markdown/plugin"
	"github.com/google/uuid"

	"markdownhub/internal/store"
)

// ImporterService handles importing articles from URLs.
type ImporterService struct {
	db          *store.DB
	docService  *DocumentService
	attachSvc   *AttachmentService
	httpClient  *http.Client
	conv        *html2md.Converter
}

// NewImporterService constructs an ImporterService.
func NewImporterService(db *store.DB, docService *DocumentService, attachSvc *AttachmentService) *ImporterService {
	conv := html2md.NewConverter("", true, nil)
	conv.Use(mdPlugin.GitHubFlavored())

	return &ImporterService{
		db:         db,
		docService: docService,
		attachSvc:  attachSvc,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		conv: conv,
	}
}

// ImportResult represents the result of an import operation.
type ImportResult struct {
	DocumentID string
	Title      string
	URL        string
}

// ImportFromURL imports an article from a URL.
func (s *ImporterService) ImportFromURL(ctx context.Context, userID, importURL, title string) (*ImportResult, error) {
	// Validate input
	if importURL == "" {
		return nil, fmt.Errorf("%w: URL is required", ErrInvalidInput)
	}

	// Parse URL
	parsedURL, err := url.Parse(importURL)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid URL", ErrInvalidInput)
	}

	// Fetch HTML content
	htmlContent, err := s.fetchHTML(ctx, parsedURL.String())
	if err != nil {
		return nil, fmt.Errorf("fetch HTML: %w", err)
	}

	// Extract title if not provided
	if title == "" {
		title = s.extractTitle(htmlContent)
	}
	if title == "" {
		title = parsedURL.Host
	}

	// Convert HTML to Markdown
	markdownContent, err := s.conv.ConvertString(htmlContent)
	if err != nil {
		return nil, fmt.Errorf("convert HTML to Markdown: %w", err)
	}

	// Create document first to get document ID
	doc, err := s.docService.CreateDocument(ctx, userID, "", title, markdownContent)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	// Download and replace images (using document ID)
	markdownContent, err = s.processImages(ctx, userID, doc.ID, markdownContent, parsedURL)
	if err != nil {
		return nil, fmt.Errorf("process images: %w", err)
	}

	// Update document content with image URLs
	if markdownContent != doc.Content {
		doc, err = s.docService.UpdateContent(ctx, doc.ID, userID, markdownContent)
		if err != nil {
			return nil, fmt.Errorf("update document content: %w", err)
		}
	}

	return &ImportResult{
		DocumentID: doc.ID,
		Title:      doc.Title,
		URL:        importURL,
	}, nil
}

// ImportFromContent imports an article from provided HTML content.
func (s *ImporterService) ImportFromContent(ctx context.Context, userID, title, htmlContent, baseURL string) (*ImportResult, error) {
	// Validate input
	if htmlContent == "" {
		return nil, fmt.Errorf("%w: HTML content is required", ErrInvalidInput)
	}

	// Extract title if not provided
	if title == "" {
		title = s.extractTitle(htmlContent)
	}
	if title == "" {
		title = "Untitled"
	}

	// Convert HTML to Markdown
	markdownContent, err := s.conv.ConvertString(htmlContent)
	if err != nil {
		return nil, fmt.Errorf("convert HTML to Markdown: %w", err)
	}

	// Create document first to get document ID
	doc, err := s.docService.CreateDocument(ctx, userID, "", title, markdownContent)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	// Process images with the provided base URL (using document ID)
	var parsedURL *url.URL
	if baseURL != "" {
		parsedURL, _ = url.Parse(baseURL)
	}
	markdownContent, err = s.processImages(ctx, userID, doc.ID, markdownContent, parsedURL)
	if err != nil {
		return nil, fmt.Errorf("process images: %w", err)
	}

	// Update document content with image URLs
	if markdownContent != doc.Content {
		doc, err = s.docService.UpdateContent(ctx, doc.ID, userID, markdownContent)
		if err != nil {
			return nil, fmt.Errorf("update document content: %w", err)
		}
	}

	return &ImportResult{
		DocumentID: doc.ID,
		Title:      doc.Title,
		URL:        baseURL,
	}, nil
}

// fetchHTML fetches HTML content from a URL.
func (s *ImporterService) fetchHTML(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.5")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	return string(body), nil
}

// extractTitle extracts the title from HTML content.
func (s *ImporterService) extractTitle(html string) string {
	// Try to extract from <title> tag
	titleRe := regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	matches := titleRe.FindStringSubmatch(html)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	// Try to extract from <h1> tag
	h1Re := regexp.MustCompile(`(?i)<h1[^>]*>([^<]+)</h1>`)
	matches = h1Re.FindStringSubmatch(html)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	return ""
}

// processImages downloads remote images and uploads them as attachments to a document.
func (s *ImporterService) processImages(ctx context.Context, userID, documentID, content string, baseURL *url.URL) (string, error) {
	// Find all image URLs in the markdown content
	imageRe := regexp.MustCompile(`!\[([^\]]*)\]\(([^)]+)\)`)
	matches := imageRe.FindAllStringSubmatchIndex(content, -1)

	if len(matches) == 0 {
		return content, nil
	}

	// Collect unique image URLs
	imageURLs := make(map[string]bool)
	for _, match := range matches {
		if len(match) >= 6 {
			imgURL := content[match[4]:match[5]]
			imageURLs[imgURL] = true
		}
	}

	// Download and upload each image
	imageMapping := make(map[string]string) // original URL -> attachment filename
	for imgURL := range imageURLs {
		var data []byte
		var contentType string
		var err error

		// Check if this is a base64 data URI
		if strings.HasPrefix(imgURL, "data:image/") {
			// Decode base64 image
			data, contentType, err = DecodeBase64Image(imgURL)
			if err != nil {
				// Skip failed images, keep original URL
				continue
			}
		} else {
			// Resolve relative URLs
			absURL := imgURL
			if baseURL != nil && !strings.HasPrefix(imgURL, "http://") && !strings.HasPrefix(imgURL, "https://") {
				relURL, err := url.Parse(imgURL)
				if err == nil {
					absURL = baseURL.ResolveReference(relURL).String()
				}
			}

			// Download image
			data, contentType, err = s.downloadImage(ctx, absURL)
			if err != nil {
				// Skip failed images, keep original URL
				continue
			}
		}

		// Generate unique filename
		ext := getExtension(contentType)
		if ext == "" {
			ext = ".png"
		}
		filename := fmt.Sprintf("import_%s%s", uuid.New().String()[:8], ext)

		// Create file path using document ID
		uploadPath := filepath.Join("uploads", documentID, filename)

		// Ensure upload directory exists
		uploadDir := filepath.Dir(uploadPath)
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			continue
		}

		// Write file to disk
		if err := os.WriteFile(uploadPath, data, 0644); err != nil {
			continue
		}

		// Create attachment record in database (document-level attachment)
		// Use empty string for workspaceID and ownerID (owner is the uploader)
		_, err = s.attachSvc.UploadAttachment(
			ctx,
			"", // workspaceID - no longer used
			documentID,
			userID,
			userID, // ownerID - the importer is the owner
			filename,
			contentType,
			int64(len(data)),
			uploadPath,
		)
		if err != nil {
			// Clean up file if database operation fails
			os.Remove(uploadPath)
			continue
		}

		// Update the mapping
		imageMapping[imgURL] = fmt.Sprintf("/uploads/%s/%s", documentID, filename)
	}

	// Replace image URLs in markdown
	result := content
	for originalURL, newPath := range imageMapping {
		result = strings.Replace(result, originalURL, newPath, -1)
	}

	return result, nil
}

// downloadImage downloads an image and returns its data and content type.
func (s *ImporterService) downloadImage(ctx context.Context, imageURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("HTTP status: %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}

	return data, contentType, nil
}

// writeFile writes data to a file.
// Deprecated: This function is no longer used. File writing is done directly via os.WriteFile.
func (s *ImporterService) writeFile(filePath string, data []byte) error {
	return os.WriteFile(filePath, data, 0644)
}

// getExtension returns the file extension for a content type.
func getExtension(contentType string) string {
	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	case "image/bmp":
		return ".bmp"
	default:
		return ".png"
	}
}

// DecodeBase64Image decodes a base64-encoded image string.
// The format should be: data:image/png;base64,<data>
func DecodeBase64Image(dataURI string) ([]byte, string, error) {
	// Remove data URI prefix if present
	parts := strings.Split(dataURI, ",")
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("invalid base64 image format")
	}

	// Extract content type from prefix
	prefix := parts[0]
	contentType := "image/png"
	if strings.Contains(prefix, "image/jpeg") {
		contentType = "image/jpeg"
	} else if strings.Contains(prefix, "image/gif") {
		contentType = "image/gif"
	} else if strings.Contains(prefix, "image/webp") {
		contentType = "image/webp"
	}

	// Decode base64 data
	data, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, "", err
	}

	return data, contentType, nil
}
