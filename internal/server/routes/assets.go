package routes

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

// AssetRoutes handles asset uploads and downloads under /api/assets.
type AssetRoutes struct {
	store *storage.Store
	mgr   *storage.Manager
}

// Register wires asset endpoints onto the chi router.
func (ar *AssetRoutes) Register(r chi.Router) {
	r.Post("/assets", ar.upload)
	r.Get("/assets/{filename}", ar.get)
}

func (ar *AssetRoutes) getActiveStore() *storage.Store {
	if ar.mgr != nil {
		if s := ar.mgr.GetStore(); s != nil {
			return s
		}
	}
	if ar.store != nil {
		return ar.store
	}
	return nil
}

func (ar *AssetRoutes) getAssetStore() *storage.AssetStore {
	if s := ar.getActiveStore(); s != nil && s.Assets != nil {
		return s.Assets
	}
	return storage.NewAssetStore(storage.GlobalRootPath())
}

func (ar *AssetRoutes) upload(w http.ResponseWriter, r *http.Request) {
	// Restrict request body size to slightly more than MaxAssetBytes to allow multipart overhead.
	r.Body = http.MaxBytesReader(w, r.Body, storage.MaxAssetBytes+1024*1024)

	var originalName string
	var data []byte

	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		if err := r.ParseMultipartForm(storage.MaxAssetBytes + 1024*1024); err != nil {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("parse multipart form: %v", err))
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			file, header, err = r.FormFile("image")
		}
		if err != nil {
			respondError(w, http.StatusBadRequest, "file or image field is required")
			return
		}
		defer file.Close()

		originalName = header.Filename
		data, err = io.ReadAll(file)
		if err != nil {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("read uploaded file: %v", err))
			return
		}
	} else if strings.HasPrefix(mediaType, "image/") {
		// Raw binary upload with Image Content-Type
		var err error
		data, err = io.ReadAll(r.Body)
		if err != nil {
			respondError(w, http.StatusBadRequest, fmt.Sprintf("read request body: %v", err))
			return
		}
		originalName = r.URL.Query().Get("name")
		if originalName == "" {
			originalName = "upload"
		}
	} else {
		respondError(w, http.StatusBadRequest, "expected multipart/form-data or image/* Content-Type")
		return
	}

	assetStore := ar.getAssetStore()
	asset, err := assetStore.Save(originalName, data)
	if err != nil {
		if errors.Is(err, models.ErrAssetTooLarge) {
			respondError(w, http.StatusRequestEntityTooLarge, err.Error())
			return
		}
		if errors.Is(err, models.ErrUnsupportedAsset) || errors.Is(err, models.ErrInvalidAsset) {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, fmt.Sprintf("save asset: %v", err))
		return
	}

	respondJSON(w, http.StatusCreated, asset)
}

func (ar *AssetRoutes) get(w http.ResponseWriter, r *http.Request) {
	filename := chi.URLParam(r, "filename")
	if filename == "" {
		respondError(w, http.StatusNotFound, "asset not found")
		return
	}

	// 1. Try active store
	if s := ar.getActiveStore(); s != nil && s.Assets != nil {
		if path, err := s.Assets.GetAssetPath(filename); err == nil {
			ar.serveAssetFile(w, r, path)
			return
		}
	}

	// 2. Try global store root
	globalStore := storage.NewAssetStore(storage.GlobalRootPath())
	if path, err := globalStore.GetAssetPath(filename); err == nil {
		ar.serveAssetFile(w, r, path)
		return
	}

	// 3. Try registered projects if manager is available
	if ar.mgr != nil && ar.mgr.GetRegistry() != nil {
		projects := ar.mgr.GetRegistry().List()
		for _, proj := range projects {
			if s, err := ar.mgr.ProjectStore(proj.ID); err == nil && s != nil && s.Assets != nil {
				if path, err := s.Assets.GetAssetPath(filename); err == nil {
					ar.serveAssetFile(w, r, path)
					return
				}
			}
		}
	}

	respondError(w, http.StatusNotFound, "asset not found")
}

func (ar *AssetRoutes) serveAssetFile(w http.ResponseWriter, r *http.Request, path string) {
	if _, err := os.Stat(path); err != nil {
		respondError(w, http.StatusNotFound, "asset not found")
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, path)
}
