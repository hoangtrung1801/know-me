package storage

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

type AgentStore struct {
	root      string
	projectID string
}

// AgentRunLock is held for the lifetime of a Codex child process. The lock is
// backed by the existing cross-process file-lock primitives used by task
// lifecycle mutations.
type AgentRunLock struct {
	file *os.File
}

func (lock *AgentRunLock) Close() error {
	if lock == nil || lock.file == nil {
		return nil
	}
	unlockErr := unlockTaskLifecycleFile(lock.file)
	closeErr := lock.file.Close()
	lock.file = nil
	if unlockErr != nil {
		return unlockErr
	}
	return closeErr
}

func (as *AgentStore) filePath() string {
	return filepath.Join(as.root, "agent-workflows.json")
}

func (as *AgentStore) stateLockPath() string {
	return filepath.Join(as.root, ".search", "locks", "agent-state.lock")
}

func (as *AgentStore) withStateLock(fn func() error) error {
	lockDir := filepath.Dir(as.stateLockPath())
	if err := os.MkdirAll(lockDir, 0o755); err != nil {
		return fmt.Errorf("Codex state lock: create directory: %w", err)
	}
	file, err := os.OpenFile(as.stateLockPath(), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return fmt.Errorf("Codex state lock: open: %w", err)
	}
	defer file.Close()
	if err := lockTaskLifecycleFile(context.Background(), file); err != nil {
		return fmt.Errorf("Codex state lock: acquire: %w", err)
	}
	defer unlockTaskLifecycleFile(file)
	return fn()
}

func (as *AgentStore) Load() (models.AgentState, error) {
	state := models.AgentState{
		Workflows:      []models.AgentWorkflow{},
		Runs:           []models.AgentRun{},
		ReviewComments: []models.ReviewComment{},
	}
	if err := as.withStateLock(func() error {
		if err := readJSON(as.filePath(), &state); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		return nil
	}); err != nil {
		return models.AgentState{}, err
	}
	if state.Workflows == nil {
		state.Workflows = []models.AgentWorkflow{}
	}
	if state.Runs == nil {
		state.Runs = []models.AgentRun{}
	}
	if state.ReviewComments == nil {
		state.ReviewComments = []models.ReviewComment{}
	}
	return state, nil
}

func (as *AgentStore) Save(state models.AgentState) error {
	return as.withStateLock(func() error {
		return writeJSON(as.filePath(), state)
	})
}

func (as *AgentStore) runLockPath() string {
	projectID := filepath.Base(as.projectID)
	if projectID == "." || projectID == string(filepath.Separator) || projectID == "" {
		projectID = "default"
	}
	return filepath.Join(as.root, ".search", "locks", "agent-"+projectID+".lock")
}

// AcquireRunLock serializes Codex runs across server processes for one
// project. The returned handle must stay alive until the child exits.
func (as *AgentStore) AcquireRunLock(ctx context.Context) (*AgentRunLock, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	lockDir := filepath.Dir(as.runLockPath())
	if err := os.MkdirAll(lockDir, 0o755); err != nil {
		return nil, fmt.Errorf("Codex run lock: create directory: %w", err)
	}
	file, err := os.OpenFile(as.runLockPath(), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("Codex run lock: open: %w", err)
	}
	if err := lockTaskLifecycleFile(ctx, file); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("Codex run lock: acquire: %w", err)
	}
	return &AgentRunLock{file: file}, nil
}

func (as *AgentStore) TaskSnapshot(taskID string) (models.AgentTaskSnapshot, error) {
	state, err := as.Load()
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	snapshot := models.AgentTaskSnapshot{
		Workflow: models.AgentWorkflow{
			ProjectID: as.projectID,
			TaskID:    taskID,
			Phase:     models.AgentPhaseIdle,
		},
		Runs:           []models.AgentRun{},
		ReviewComments: []models.ReviewComment{},
		DirtyFiles:     []string{},
		AdapterState:   "stopped",
	}
	for _, workflow := range state.Workflows {
		if workflow.ProjectID == as.projectID && workflow.TaskID == taskID {
			snapshot.Workflow = workflow
			break
		}
	}
	snapshot.ChatSessionID = snapshot.Workflow.ChatSessionID
	for _, run := range state.Runs {
		if run.ProjectID == as.projectID && run.TaskID == taskID {
			snapshot.Runs = append(snapshot.Runs, run)
		}
	}
	for _, comment := range state.ReviewComments {
		if comment.ProjectID == as.projectID && comment.TaskID == taskID {
			snapshot.ReviewComments = append(snapshot.ReviewComments, comment)
		}
	}
	sort.SliceStable(snapshot.Runs, func(i, j int) bool {
		return snapshot.Runs[i].StartedAt.Before(snapshot.Runs[j].StartedAt)
	})
	sort.SliceStable(snapshot.ReviewComments, func(i, j int) bool {
		return snapshot.ReviewComments[i].CreatedAt.Before(snapshot.ReviewComments[j].CreatedAt)
	})
	snapshot.Resumable = snapshot.Workflow.CodexSessionID != "" && snapshot.Workflow.ResumePhase != ""
	snapshot.Interrupted = snapshot.Workflow.Phase == models.AgentPhaseInterrupted
	return snapshot, nil
}

func (as *AgentStore) MarkRunningInterrupted(now time.Time) error {
	lock, err := as.AcquireRunLock(context.Background())
	if err != nil {
		return err
	}
	defer lock.Close()

	state, err := as.Load()
	if err != nil {
		return err
	}
	workflowByTask := make(map[string]int)
	for i := range state.Workflows {
		if state.Workflows[i].ProjectID == as.projectID {
			workflowByTask[state.Workflows[i].TaskID] = i
		}
	}
	changed := false
	for i := range state.Runs {
		run := &state.Runs[i]
		if run.ProjectID != as.projectID || run.Status != models.AgentRunStatusRunning {
			continue
		}
		run.Status = models.AgentRunStatusInterrupted
		run.Error = "interrupted by server restart"
		run.FinishedAt = &now
		changed = true
		if workflowIndex, ok := workflowByTask[run.TaskID]; ok {
			workflow := &state.Workflows[workflowIndex]
			workflow.ActiveRunID = ""
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = run.Phase
			workflow.UpdatedAt = now
		}
	}
	if !changed {
		return nil
	}
	return as.Save(state)
}

func (as *AgentStore) LogPath(runID string) string {
	return filepath.Join(as.root, "runtime", "codex", filepath.Base(as.projectID), filepath.Base(runID)+".jsonl")
}
