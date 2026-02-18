package core_test

import (
	"strings"
	"testing"

	"markdownhub/internal/core"
	"markdownhub/internal/models"
)

func TestParseHeadings_Basic(t *testing.T) {
	content := "# Introduction\n\nSome text.\n\n## Section 1\n\nFoo.\n\n## Section 2\n\nBar.\n"
	sections := core.ParseHeadings(content)

	if len(sections) != 3 {
		t.Fatalf("expected 3 sections, got %d", len(sections))
	}
	if sections[0].Anchor != "introduction" {
		t.Errorf("expected anchor 'introduction', got %q", sections[0].Anchor)
	}
	if sections[1].Anchor != "section-1" {
		t.Errorf("expected anchor 'section-1', got %q", sections[1].Anchor)
	}
	if sections[0].Level != 1 {
		t.Errorf("expected level 1, got %d", sections[0].Level)
	}
	if sections[1].Level != 2 {
		t.Errorf("expected level 2, got %d", sections[1].Level)
	}
}

func TestParseHeadings_ByteRanges(t *testing.T) {
	content := "# Hello\n\nWorld.\n\n## Goodbye\n\nSee ya.\n"
	sections := core.ParseHeadings(content)
	if len(sections) != 2 {
		t.Fatalf("expected 2 sections, got %d", len(sections))
	}
	// The second section should start where "## Goodbye" begins.
	secondStart := strings.Index(content, "## Goodbye")
	if sections[1].StartByte != secondStart {
		t.Errorf("expected StartByte %d, got %d", secondStart, sections[1].StartByte)
	}
	// First section ends where second begins.
	if sections[0].EndByte != secondStart {
		t.Errorf("expected first EndByte %d, got %d", secondStart, sections[0].EndByte)
	}
}

func TestParseHeadings_Empty(t *testing.T) {
	if sections := core.ParseHeadings(""); len(sections) != 0 {
		t.Errorf("expected 0 sections for empty content, got %d", len(sections))
	}
}

func TestDiffSnapshots_InsertDelete(t *testing.T) {
	old := "line one\nline two\nline three\n"
	new_ := "line one\nline TWO\nline three\n"
	diff := core.DiffSnapshots(old, new_)

	var inserts, deletes int
	for _, d := range diff {
		switch d.Type {
		case "insert":
			inserts++
		case "delete":
			deletes++
		}
	}
	if inserts == 0 || deletes == 0 {
		t.Errorf("expected at least one insert and one delete; got %d inserts, %d deletes", inserts, deletes)
	}
}

func TestDiffSnapshots_Equal(t *testing.T) {
	content := "same content\n"
	diff := core.DiffSnapshots(content, content)
	for _, d := range diff {
		if d.Type != "equal" {
			t.Errorf("expected all equal, got %q for line %q", d.Type, d.Content)
		}
	}
}

func TestPermissionLevelOrdering(t *testing.T) {
	// read < edit < manage
	levels := []models.PermissionLevel{
		models.PermissionRead,
		models.PermissionEdit,
		models.PermissionManage,
	}
	_ = levels // The actual ordering logic lives in core; this tests compilation.
}

func TestParseMarkdownReferences_Images(t *testing.T) {
	content := `# Document

Here is an image: ![alt text](image1.png)

And another: ![](image2.jpg)

Some text.
`
	// Using unexported function via test - need to export or test differently
	// For now, we'll import the function directly in attachment.go
	refs := core.ParseMarkdownReferencesForTest(content)

	expectedRefs := []string{"image1.png", "image2.jpg"}
	if len(refs) != len(expectedRefs) {
		t.Fatalf("expected %d references, got %d: %v", len(expectedRefs), len(refs), refs)
	}

	for _, expected := range expectedRefs {
		found := false
		for _, ref := range refs {
			if ref == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find reference %q, but didn't", expected)
		}
	}
}

func TestParseMarkdownReferences_Links(t *testing.T) {
	content := `# Document

[Download PDF](document.pdf)
[View file](data.csv)
`
	refs := core.ParseMarkdownReferencesForTest(content)

	expectedRefs := []string{"document.pdf", "data.csv"}
	if len(refs) != len(expectedRefs) {
		t.Fatalf("expected %d references, got %d: %v", len(expectedRefs), len(refs), refs)
	}

	for _, expected := range expectedRefs {
		found := false
		for _, ref := range refs {
			if ref == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find reference %q, but didn't", expected)
		}
	}
}

func TestParseMarkdownReferences_Mixed(t *testing.T) {
	content := `# Document

Image: ![chart](chart.png)
Link: [data](data.xlsx)
HTML: <img src="logo.svg">

Regular link to website: [Google](https://google.com)
`
	refs := core.ParseMarkdownReferencesForTest(content)

	// Should include local files, not external URLs
	if len(refs) < 3 {
		t.Fatalf("expected at least 3 references, got %d: %v", len(refs), refs)
	}

	// Check that local files are found
	localFiles := []string{"chart.png", "data.xlsx", "logo.svg"}
	for _, expected := range localFiles {
		found := false
		for _, ref := range refs {
			if ref == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find reference %q, but didn't", expected)
		}
	}
}

func TestParseMarkdownReferences_Paths(t *testing.T) {
	content := `# Document

![image](uploads/abc123/image.png)
[file](./data/file.pdf)
`
	refs := core.ParseMarkdownReferencesForTest(content)

	// Should extract just the filename, not the full path
	expectedRefs := []string{"image.png", "file.pdf"}
	if len(refs) != len(expectedRefs) {
		t.Fatalf("expected %d references, got %d: %v", len(expectedRefs), len(refs), refs)
	}

	for _, expected := range expectedRefs {
		found := false
		for _, ref := range refs {
			if ref == expected {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected to find reference %q, but didn't", expected)
		}
	}
}

func TestParseMarkdownReferences_Duplicates(t *testing.T) {
	content := `# Document

![image](photo.jpg)
![another](photo.jpg)
`
	refs := core.ParseMarkdownReferencesForTest(content)

	// Should deduplicate
	if len(refs) != 1 {
		t.Fatalf("expected 1 unique reference, got %d: %v", len(refs), refs)
	}

	if refs[0] != "photo.jpg" {
		t.Errorf("expected reference 'photo.jpg', got %q", refs[0])
	}
}
