package storage

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

type AgentStore struct {
	root      string
	projectID string
}

func (as *AgentStore) filePath() string {
	return filepath.Join(as.root, "agent-workflows.json")
}

func (as *AgentStore) Load() (models.AgentState, error) {
	state := models.AgentState{
		Workflows:      []models.AgentWorkflow{},
		Runs:           []models.AgentRun{},
		ReviewComments: []models.ReviewComment{},
	}
	if err := readJSON(as.filePath(), &state); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return state, nil
		}
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
	return writeJSON(as.filePath(), state)
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
	}
	for _, workflow := range state.Workflows {
		if workflow.ProjectID == as.projectID && workflow.TaskID == taskID {
			snapshot.Workflow = workflow
			break
		}
	}
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
	return snapshot, nil
}

func (as *AgentStore) MarkRunningInterrupted(now time.Time) error {
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
			if workflow.ActiveRunID == run.ID {
				workflow.ActiveRunID = ""
			}
			switch run.Phase {
			case models.AgentRunPhaseInvestigation:
				workflow.Phase = models.AgentPhaseIdle
			case models.AgentRunPhaseImplementation:
				workflow.Phase = models.AgentPhasePlanReview
			case models.AgentRunPhaseFix:
				workflow.Phase = models.AgentPhaseFixReady
			}
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
