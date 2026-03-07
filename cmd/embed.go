package main

import "embed"

// staticFiles embeds the compiled frontend (cmd/dist).
// The directory must exist at build time; during development it may be absent,
// in which case the server skips static file serving.
//
//go:embed dist
var staticFiles embed.FS
