package permissions

import "testing"

func TestLinkActionsAreClassified(t *testing.T) {
	checks := map[string]ActionMeta{
		"link.add":    {Capability: CapWrite, Target: TargetLink, Risk: RiskMedium},
		"link.list":   {Capability: CapRead, Target: TargetLink, Risk: RiskLow},
		"link.update": {Capability: CapWrite, Target: TargetLink, Risk: RiskMedium},
	}
	for action, want := range checks {
		if got := ClassifyAction("link", action[len("link."):]); got != want {
			t.Fatalf("ClassifyAction(%q) = %+v, want %+v", action, got, want)
		}
	}
}

func TestMemoActionsAreClassified(t *testing.T) {
	checks := map[string]ActionMeta{
		"memo.add":    {Capability: CapWrite, Target: TargetMemo, Risk: RiskMedium},
		"memo.list":   {Capability: CapRead, Target: TargetMemo, Risk: RiskLow},
		"memo.update": {Capability: CapWrite, Target: TargetMemo, Risk: RiskMedium},
		"memo.delete": {Capability: CapDelete, Target: TargetMemo, Risk: RiskHigh},
	}
	for action, want := range checks {
		if got := ClassifyAction("memo", action[len("memo."):]); got != want {
			t.Fatalf("ClassifyAction(%q) = %+v, want %+v", action, got, want)
		}
	}
}
