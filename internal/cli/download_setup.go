package cli

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"charm.land/bubbles/v2/progress"
	"charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/paths"
	"github.com/hoangtrung1801/know-me/internal/search"
)

type embeddingModel struct {
	ID          string
	Name        string
	HuggingFace string
	Dimensions  int
	MaxTokens   int
	SizeMB      int
	Files       []string
}

var supportedModels = []embeddingModel{
	{
		ID:          "gte-small",
		Name:        "GTE Small",
		HuggingFace: "Xenova/gte-small",
		Dimensions:  384,
		MaxTokens:   512,
		SizeMB:      67,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "all-MiniLM-L6-v2",
		Name:        "All MiniLM L6 v2",
		HuggingFace: "Xenova/all-MiniLM-L6-v2",
		Dimensions:  384,
		MaxTokens:   256,
		SizeMB:      86,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "gte-base",
		Name:        "GTE Base",
		HuggingFace: "Xenova/gte-base",
		Dimensions:  768,
		MaxTokens:   512,
		SizeMB:      220,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "bge-small-en-v1.5",
		Name:        "BGE Small EN v1.5",
		HuggingFace: "Xenova/bge-small-en-v1.5",
		Dimensions:  384,
		MaxTokens:   512,
		SizeMB:      67,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "bge-base-en-v1.5",
		Name:        "BGE Base EN v1.5",
		HuggingFace: "Xenova/bge-base-en-v1.5",
		Dimensions:  768,
		MaxTokens:   512,
		SizeMB:      220,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "nomic-embed-text-v1.5",
		Name:        "Nomic Embed Text v1.5",
		HuggingFace: "Xenova/nomic-embed-text-v1.5",
		Dimensions:  768,
		MaxTokens:   8192,
		SizeMB:      274,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
	{
		ID:          "multilingual-e5-small",
		Name:        "Multilingual E5 Small",
		HuggingFace: "Xenova/multilingual-e5-small",
		Dimensions:  384,
		MaxTokens:   512,
		SizeMB:      470,
		Files: []string{
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"onnx/model_quantized.onnx",
		},
	},
}

func getModelsDir() string {
	return filepath.Join(paths.GlobalStoreRoot(), "models")
}

func getModelDir(huggingFaceID string) string {
	return filepath.Join(getModelsDir(), huggingFaceID)
}

func isModelInstalled(m *embeddingModel) bool {
	dir := getModelDir(m.HuggingFace)
	for _, name := range []string{"onnx/model_quantized.onnx", "onnx/model.onnx"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			return true
		}
	}
	return false
}


// ─── download step ───────────────────────────────────────────────────

type downloadStep struct {
	label   string
	url     string
	dst     string
	size    int64 // populated at runtime from HEAD
	written int64
	done    bool
	err     error
	// post-download hook (e.g. extract archive)
	postHook func(dst string) error
}

// ─── multi-step setup model (bubbletea) ──────────────────────────────

type setupModel struct {
	steps    []downloadStep
	current  int
	bar      progress.Model
	spinner  spinner.Model
	started  time.Time
	quitting bool
	err      error

	// background download state
	resp    *http.Response
	outFile *os.File
	doneCh  chan error
}

// setupTickMsg triggers periodic UI refresh during download.
type setupTickMsg struct{}

// setupStepDoneMsg signals current step finished downloading.
type setupStepDoneMsg struct{ err error }

// setupPostHookDoneMsg signals post-hook finished.
type setupPostHookDoneMsg struct{ err error }

func newSetupModel(steps []downloadStep) *setupModel {
	bar := NewBrandProgressBar(
		progress.WithoutPercentage(),
	)
	sp := spinner.New(
		spinner.WithSpinner(spinner.Dot),
		spinner.WithStyle(StyleDim),
	)
	return &setupModel{
		steps:   steps,
		bar:     bar,
		spinner: sp,
		started: time.Now(),
	}
}

func (m *setupModel) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.startCurrentStep(),
	)
}

func (m *setupModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyPressMsg:
		if msg.String() == "ctrl+c" {
			m.err = fmt.Errorf("cancelled")
			m.quitting = true
			m.cleanup()
			return m, tea.Quit
		}

	case setupTickMsg:
		if m.quitting {
			return m, nil
		}
		step := &m.steps[m.current]
		if step.size > 0 {
			pct := float64(step.written) / float64(step.size)
			cmd := m.bar.SetPercent(pct)
			return m, tea.Batch(cmd, m.tickCmd())
		}
		return m, m.tickCmd()

	case setupStepDoneMsg:
		step := &m.steps[m.current]
		if msg.err != nil {
			step.err = msg.err
			m.err = msg.err
			m.quitting = true
			return m, tea.Quit
		}
		// Run post-hook if present
		if step.postHook != nil {
			return m, func() tea.Msg {
				err := step.postHook(step.dst)
				return setupPostHookDoneMsg{err: err}
			}
		}
		return m, m.advanceStep()

	case setupPostHookDoneMsg:
		if msg.err != nil {
			m.steps[m.current].err = msg.err
			m.err = msg.err
			m.quitting = true
			return m, tea.Quit
		}
		return m, m.advanceStep()

	case progress.FrameMsg:
		var cmd tea.Cmd
		m.bar, cmd = m.bar.Update(msg)
		return m, cmd

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m *setupModel) View() tea.View {
	var b strings.Builder

	for i, step := range m.steps {
		if step.done {
			sizeInfo := ""
			if step.written > 0 {
				sizeInfo = StyleDim.Render(fmt.Sprintf(" (%s)", formatBytes(step.written)))
			}
			b.WriteString(fmt.Sprintf("  %s %s%s\n",
				StyleSuccess.Render("✓"),
				step.label,
				sizeInfo,
			))
		} else if i == m.current && !m.quitting {
			// Active step
			pct := 0.0
			if step.size > 0 {
				pct = float64(step.written) / float64(step.size)
			}
			pctStr := fmt.Sprintf("%.0f%%", pct*100)

			elapsed := time.Since(m.started).Seconds()
			speed := ""
			if elapsed > 0.5 && step.written > 0 {
				speed = fmt.Sprintf("  %s/s", formatBytes(int64(float64(step.written)/elapsed)))
			}

			sizeInfo := ""
			if step.size > 0 {
				sizeInfo = fmt.Sprintf("  %s/%s", formatBytes(step.written), formatBytes(step.size))
			}

			b.WriteString(fmt.Sprintf("  %s %s\n", m.spinner.View(), step.label))
			b.WriteString(fmt.Sprintf("    %s %s%s%s\n",
				m.bar.View(),
				StyleDim.Render(pctStr),
				StyleDim.Render(sizeInfo),
				StyleDim.Render(speed),
			))
		} else if step.err != nil {
			b.WriteString(fmt.Sprintf("  %s %s %s\n",
				StyleWarning.Render("✗"),
				step.label,
				StyleWarning.Render(step.err.Error()),
			))
		} else {
			b.WriteString(fmt.Sprintf("  %s %s\n",
				StyleDim.Render("○"),
				StyleDim.Render(step.label),
			))
		}
	}

	return tea.NewView(b.String())
}

func (m *setupModel) tickCmd() tea.Cmd {
	return tea.Tick(80*time.Millisecond, func(t time.Time) tea.Msg {
		return setupTickMsg{}
	})
}

func (m *setupModel) advanceStep() tea.Cmd {
	m.steps[m.current].done = true
	m.current++
	if m.current >= len(m.steps) {
		m.quitting = true
		return tea.Quit
	}
	m.started = time.Now()
	return m.startCurrentStep()
}

func (m *setupModel) startCurrentStep() tea.Cmd {
	step := &m.steps[m.current]
	url := step.url
	dst := step.dst

	return func() tea.Msg {
		client := &http.Client{Timeout: 30 * time.Minute}

		// HEAD to get content length
		headResp, err := client.Head(url)
		if err == nil {
			step.size = headResp.ContentLength
			headResp.Body.Close()
		}

		// Ensure parent dir
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return setupStepDoneMsg{err: err}
		}

		resp, err := client.Get(url)
		if err != nil {
			return setupStepDoneMsg{err: err}
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return setupStepDoneMsg{err: fmt.Errorf("HTTP %d", resp.StatusCode)}
		}

		if step.size <= 0 {
			step.size = resp.ContentLength
		}

		outFile, err := os.Create(dst)
		if err != nil {
			resp.Body.Close()
			return setupStepDoneMsg{err: err}
		}

		// Stream download with progress tracking
		buf := make([]byte, 32*1024)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				if _, writeErr := outFile.Write(buf[:n]); writeErr != nil {
					outFile.Close()
					resp.Body.Close()
					return setupStepDoneMsg{err: writeErr}
				}
				step.written += int64(n)
			}
			if readErr != nil {
				if readErr == io.EOF {
					break
				}
				outFile.Close()
				resp.Body.Close()
				return setupStepDoneMsg{err: readErr}
			}
		}

		outFile.Close()
		resp.Body.Close()
		return setupStepDoneMsg{err: nil}
	}
}

func (m *setupModel) cleanup() {
	if m.resp != nil {
		m.resp.Body.Close()
	}
	if m.outFile != nil {
		m.outFile.Close()
	}
}

// runSemanticSetup downloads ONNX Runtime (if needed) and the model
// using a unified bubbletea multi-step progress UI.
// Pass force=true to re-download even if already installed.
func runSemanticSetup(modelID string, force ...bool) error {
	if err := search.RequireLocalONNX(); err != nil {
		return err
	}
	forceDownload := len(force) > 0 && force[0]

	// Find the model
	var selected *embeddingModel
	for i := range supportedModels {
		if supportedModels[i].ID == modelID {
			selected = &supportedModels[i]
			break
		}
	}
	if selected == nil {
		return fmt.Errorf("unknown model %q", modelID)
	}

	if !forceDownload && isModelInstalled(selected) {
		return nil
	}

	// Build download steps
	var steps []downloadStep

	// Model files (lazy-download via transformers.js cache;
	// pre-download is optional, intended for offline-prep).
	if forceDownload || !isModelInstalled(selected) {
		modelDir := getModelDir(selected.HuggingFace)
		for _, file := range selected.Files {
			url := fmt.Sprintf("https://huggingface.co/%s/resolve/main/%s", selected.HuggingFace, file)
			dst := filepath.Join(modelDir, file)
			steps = append(steps, downloadStep{
				label: fmt.Sprintf("%s — %s", selected.Name, file),
				url:   url,
				dst:   dst,
			})
		}
	}

	if len(steps) == 0 {
		fmt.Println(StyleSuccess.Render("✓ Semantic search already set up"))
		return nil
	}

	fmt.Println()
	fmt.Printf("  %s\n\n", RenderInfo(fmt.Sprintf("Setting up semantic search (%d downloads)...", len(steps))))

	if !isTTY() {
		for i, step := range steps {
			if err := os.MkdirAll(filepath.Dir(step.dst), 0755); err != nil {
				return err
			}
			n, err := downloadSimple(step.url, step.dst)
			if err != nil {
				return err
			}
			if step.postHook != nil {
				if err := step.postHook(step.dst); err != nil {
					return err
				}
			}
			fmt.Printf("  %s %s (%d/%d, %s)\n", StyleSuccess.Render("✓"), step.label, i+1, len(steps), formatBytes(n))
		}
		fmt.Println()
		fmt.Println(StyleSuccess.Render("✓ Semantic search ready"))
		return nil
	}

	// Drain any pending terminal escape responses from prior bubbletea/huh
	// programs to prevent ^[[?2026;2$y leak in output.
	drainStdin()

	m := newSetupModel(steps)
	p := tea.NewProgram(m, tea.WithInput(os.Stdin))
	if _, err := p.Run(); err != nil {
		return err
	}

	if m.err != nil {
		return m.err
	}

	fmt.Println()
	fmt.Println(StyleSuccess.Render("✓ Semantic search ready"))
	return nil
}


func semanticProviderForSettings(settings *models.SemanticSearchSettings) string {
	if settings != nil && settings.Provider != "" {
		return settings.Provider
	}
	return "local"
}

func localONNXUnsupportedForCapability(settings *models.SemanticSearchSettings, capability search.LocalONNXCapability) bool {
	return semanticProviderForSettings(settings) == "local" && !capability.Supported
}

func currentLocalONNXUnsupported(settings *models.SemanticSearchSettings) (search.LocalONNXCapability, bool) {
	capability := search.CurrentLocalONNXCapability()
	return capability, localONNXUnsupportedForCapability(settings, capability)
}


func findSupportedModel(modelID string) *embeddingModel {
	for i := range supportedModels {
		if supportedModels[i].ID == modelID {
			return &supportedModels[i]
		}
	}
	return nil
}


func downloadSimple(url, dst string) (int64, error) {
	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	out, err := os.Create(dst)
	if err != nil {
		return 0, err
	}
	defer out.Close()
	n, err := io.Copy(out, resp.Body)
	if err != nil {
		_ = os.Remove(dst)
		return 0, err
	}
	return n, nil
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}
