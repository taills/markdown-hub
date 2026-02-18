package main

import "embed"

// staticFiles embeds the compiled frontend (web/dist).
// The directory must exist at build time; during development it may be absent,
// in which case the server skips static file serving.
//
//go:embed all:dist
var staticFiles embed.FS
