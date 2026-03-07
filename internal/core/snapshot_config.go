package core

import "time"

// SnapshotConfig holds configurable thresholds for automatic snapshot creation.
type SnapshotConfig struct {
	// LineThreshold is the minimum number of line changes to trigger a snapshot
	LineThreshold int

	// ByteThreshold is the minimum number of byte changes to trigger a snapshot
	ByteThreshold int

	// TimeThreshold is the minimum time since last snapshot to trigger a new one
	TimeThreshold time.Duration

	// Enabled controls whether automatic snapshots are created
	Enabled bool
}

// DefaultSnapshotConfig returns the default snapshot configuration.
func DefaultSnapshotConfig() SnapshotConfig {
	return SnapshotConfig{
		LineThreshold: 20,
		ByteThreshold: 2048,
		TimeThreshold: 5 * time.Minute,
		Enabled:       true,
	}
}

// ShouldCreateSnapshot determines if a snapshot should be created based on the config and changes.
func (c *SnapshotConfig) ShouldCreateSnapshot(lastSaveTime time.Time, oldContent, newContent string) bool {
	if !c.Enabled {
		return false
	}

	// Always create snapshot if enough time has passed
	if time.Since(lastSaveTime) > c.TimeThreshold {
		return true
	}

	// Calculate line diff
	oldLines := countLines(oldContent)
	newLines := countLines(newContent)
	lineDiff := abs(newLines - oldLines)

	// Calculate byte diff
	byteDiff := abs(len(newContent) - len(oldContent))

	// Create snapshot if either threshold is exceeded
	return lineDiff >= c.LineThreshold || byteDiff >= c.ByteThreshold
}
