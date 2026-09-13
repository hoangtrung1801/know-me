package doctor

import (
	"context"
	"fmt"
	"sort"

	"github.com/hoangtrung1801/know-me/internal/services"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func runtimeCheckers(store *storage.Store, snapshot *serviceSnapshot) []Checker {
	return []Checker{{
		ID:      "runtime.managed-services",
		Scope:   ScopeRuntime,
		Timeout: 5 * defaultCheckTimeout,
		Check: func(context.Context) (CheckResult, error) {
			if store == nil {
				return skippedForMissingProject(), nil
			}
			statuses, err := snapshot.get()
			if err != nil {
				return CheckResult{}, err
			}
			applicable := make([]services.ServiceStatus, 0)
			for _, status := range statuses {
				if status.Type == "opencode" {
					applicable = append(applicable, status)
				}
			}
			if len(applicable) == 0 {
				return CheckResult{
					Status:     StatusSkip,
					Summary:    "No configured managed runtime services",
					SkipReason: "not_configured",
				}, nil
			}

			states := make([]string, 0, len(applicable))
			warnings := 0
			disabled := 0
			for _, status := range applicable {
				states = append(states, status.Name+":"+status.Status)
				switch status.Status {
				case "disabled":
					disabled++
				case "running":
				// Healthy.
				default:
					warnings++
				}
			}
			sort.Strings(states)
			if disabled == len(applicable) {
				return CheckResult{
					Status:     StatusSkip,
					Summary:    "Managed runtime services are disabled",
					Evidence:   Evidence{"services": states},
					SkipReason: "config_disabled",
				}, nil
			}
			if warnings > 0 {
				return CheckResult{
					Status:  StatusWarn,
					Summary: fmt.Sprintf("%d managed runtime services need attention", warnings),
					Evidence: Evidence{
						"services": states,
						"warnings": warnings,
					},
					Remediation: &Remediation{
						Description: "Inspect managed runtime status and start or repair configured services.",
						Command:     "knowme browser",
					},
				}, nil
			}
			return CheckResult{
				Status:  StatusPass,
				Summary: "Configured managed runtime services are healthy",
				Evidence: Evidence{
					"services": states,
				},
			}, nil
		},
	}}
}

