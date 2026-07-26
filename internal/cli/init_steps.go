package cli

import (
	"fmt"
	"os"
	"strings"
	"sync/atomic"
	"time"

	tea "charm.land/bubbletea/v2"
)

// initStep represents a single step in the init process.
// Either run (task step) or url+dst (download step) should be set.
type initStep struct {
	label    string
	run      func() error       // task step (mutually exclusive with url)
	url      string             // download step
	dst      string             // download destination
	postHook func(string) error // post-download hook
	size     int64
	written  int64
	done     bool
	err      error
}

// spinnerFrames for the simple goroutine-based spinner.
var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// runTaskStepAnimated runs a single task step with spinner animation.
func runTaskStepAnimated(step *initStep) error {
	var stopped atomic.Bool

	go func() {
		i := 0
		for !stopped.Load() {
			frame := StyleDim.Render(spinnerFrames[i%len(spinnerFrames)])
			fmt.Fprintf(os.Stderr, "\r  %s %s", frame, step.label)
			time.Sleep(80 * time.Millisecond)
			i++
		}
	}()

	err := step.run()
	stopped.Store(true)
	// Small pause so spinner is visible even for instant tasks
	time.Sleep(80 * time.Millisecond)

	// Clear spinner line and print final result
	clearLine := fmt.Sprintf("\r  %s %s", "  ", strings.Repeat(" ", len(step.label)+2))
	fmt.Fprint(os.Stderr, clearLine)

	if err != nil {
		fmt.Fprintf(os.Stderr, "\r  %s %s %s\n",
			StyleWarning.Render("✗"), step.label, StyleWarning.Render(err.Error()))
	} else {
		fmt.Fprintf(os.Stderr, "\r  %s %s\n",
			StyleSuccess.Render("✓"), step.label)
	}

	return err
}

// runInitSteps runs all steps sequentially with animated UI.
// Task steps use a goroutine spinner (no bubbletea, no escape sequence leak).
// Download steps are batched and run via bubbletea setupModel with progress bars.
func runInitSteps(steps []initStep) error {
	if len(steps) == 0 {
		return nil
	}

	i := 0
	for i < len(steps) {
		step := &steps[i]

		if step.run != nil {
			// Task step — goroutine spinner
			if err := runTaskStepAnimated(step); err != nil {
				return err
			}
			i++
			continue
		}

		// Collect consecutive download steps
		j := i
		for j < len(steps) && steps[j].url != "" {
			j++
		}

		// Convert to downloadStep for the proven setupModel
		var dlSteps []downloadStep
		for k := i; k < j; k++ {
			dlSteps = append(dlSteps, downloadStep{
				label:    steps[k].label,
				url:      steps[k].url,
				dst:      steps[k].dst,
				postHook: steps[k].postHook,
			})
		}

		m := newSetupModel(dlSteps)
		p := tea.NewProgram(m)
		if _, err := p.Run(); err != nil {
			return err
		}
		if m.err != nil {
			return m.err
		}

		i = j
	}

	return nil
}
