package search

import (
	"fmt"
	"os"
	"path/filepath"
)

// Embedder produces embedding vectors using the native Go ONNX runtime.
type Embedder struct {
	runtime    ORTRuntime
	dimensions int
	modelCfg   EmbeddingModelConfig
}

// EmbedderConfig specifies how to create an Embedder.
type EmbedderConfig struct {
	ModelDir   string // optional; passed as ONNX model cache dir
	ModelName  string // key into EmbeddingModels
	Dimensions int
	MaxTokens  int
}

// NewEmbedder initializes the native ONNX runtime for the given model.
func NewEmbedder(cfg EmbedderConfig) (*Embedder, error) {
	modelCfg, ok := EmbeddingModels[cfg.ModelName]
	if !ok {
		return nil, fmt.Errorf("unknown embedding model %q", cfg.ModelName)
	}

	dims := cfg.Dimensions
	if dims <= 0 {
		dims = modelCfg.Dimensions
	}
	maxTok := cfg.MaxTokens
	if maxTok <= 0 {
		maxTok = modelCfg.MaxTokens
	}

	cacheDir := cfg.ModelDir
	if cacheDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cacheDir = filepath.Join(home, ".knowns", "models")
		}
	}

	e := &Embedder{
		dimensions: dims,
		modelCfg:   modelCfg,
	}

	if err := e.runtime.InitORT(ORTModelConfig{
		Name:          modelCfg.Name,
		HuggingFaceID: modelCfg.HuggingFaceID,
		Dimensions:    dims,
		MaxTokens:     maxTok,
		QueryPrefix:   modelCfg.QueryPrefix,
		DocPrefix:     modelCfg.DocPrefix,
	}, cacheDir); err != nil {
		return nil, fmt.Errorf("init onnx runtime: %w", err)
	}

	if d := e.runtime.Dimensions(); d > 0 {
		e.dimensions = d
	}

	return e, nil
}

// Embed returns the document embedding for a single text.
func (e *Embedder) Embed(text string) ([]float32, error) {
	return e.EmbedDocument(text)
}

// EmbedDocument returns the document embedding for a single text.
func (e *Embedder) EmbedDocument(text string) ([]float32, error) {
	vs, err := e.runtime.EmbedORT([]string{text}, "doc")
	if err != nil {
		return nil, err
	}
	return vs[0], nil
}

// EmbedQuery returns the query embedding for a single text.
func (e *Embedder) EmbedQuery(text string) ([]float32, error) {
	vs, err := e.runtime.EmbedORT([]string{text}, "query")
	if err != nil {
		return nil, err
	}
	return vs[0], nil
}

// EmbedBatch returns document embeddings for multiple texts.
func (e *Embedder) EmbedBatch(texts []string) ([][]float32, error) {
	return e.runtime.EmbedORT(texts, "doc")
}

// EmbedDocumentBatch returns document embeddings for multiple texts.
func (e *Embedder) EmbedDocumentBatch(texts []string) ([][]float32, error) {
	return e.runtime.EmbedORT(texts, "doc")
}

// EmbedQueryBatch returns query embeddings for multiple texts.
func (e *Embedder) EmbedQueryBatch(texts []string) ([][]float32, error) {
	return e.runtime.EmbedORT(texts, "query")
}

// Dimensions returns the embedding vector dimensionality.
func (e *Embedder) Dimensions() int {
	if e == nil {
		return 0
	}
	return e.dimensions
}

// ModelConfig returns the model configuration.
func (e *Embedder) ModelConfig() EmbeddingModelConfig {
	if e == nil {
		return EmbeddingModelConfig{}
	}
	return e.modelCfg
}

// GetTokenizer returns nil; tokenization is handled internally by the runtime.
func (e *Embedder) GetTokenizer() Tokenizer {
	return nil
}

// Close releases all ONNX runtime resources.
func (e *Embedder) Close() {
	if e == nil {
		return
	}
	e.runtime.Close()
}

// IsONNXAvailable reports whether the ONNX runtime shared library can be found.
func IsONNXAvailable() (bool, string) {
	lib := ResolveORTLibraryPath()
	if lib != "" {
		return true, lib
	}
	return false, ""
}
