package main

import (
	"encoding/base64"
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func decodeDataURLPayload(dataURL string) ([]byte, error) {
	raw := strings.TrimSpace(dataURL)
	if raw == "" {
		return nil, errors.New("empty export payload")
	}

	// Supports both full data URLs and raw base64 payload.
	if strings.HasPrefix(raw, "data:") {
		commaIndex := strings.Index(raw, ",")
		if commaIndex < 0 || commaIndex == len(raw)-1 {
			return nil, errors.New("invalid data URL payload")
		}
		raw = raw[commaIndex+1:]
	}

	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("decode base64 export payload: %w", err)
	}
	return decoded, nil
}

// SaveExportFile opens native save dialog and writes export bytes to selected path.
func (a *App) SaveExportFile(defaultFilename string, extension string, dataURL string) (string, error) {
	if a.ctx == nil {
		return "", errors.New("application context is not ready")
	}

	ext := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(extension)), ".")
	if ext == "" {
		ext = "dat"
	}

	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:                "Save export file",
		DefaultFilename:      defaultFilename,
		CanCreateDirectories: true,
		Filters: []runtime.FileFilter{
			{
				DisplayName: strings.ToUpper(ext) + " file",
				Pattern:     "*." + ext,
			},
		},
	})
	if err != nil {
		return "", err
	}
	if savePath == "" {
		return "", errors.New("cancelled")
	}

	content, err := decodeDataURLPayload(dataURL)
	if err != nil {
		return "", err
	}

	if err := os.WriteFile(savePath, content, 0o644); err != nil {
		return "", fmt.Errorf("write export file: %w", err)
	}
	return savePath, nil
}
