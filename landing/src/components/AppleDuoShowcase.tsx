import { useState, useReducer, useEffect } from "react";
import { Terminal, Users, Bot, Sparkles, Layers, Info } from "lucide-react";
import { BorderBeam } from "./magicui/BorderBeam";
import { DemoTerminal } from "./demo/DemoTerminal";
import { SampleWorkspace } from "./demo/SampleWorkspace";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { productSlides } from "../data/landingContent";
import { demoReducer } from "../lib/demoEngine";
import { createInitialDemoState, WORKFLOW_PRESETS } from "../data/demoFixtures";
import type { WorkflowId } from "../lib/demoTypes";

export function AppleDuoShowcase() {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);
  const [currentCommand, setCurrentCommand] = useState(WORKFLOW_PRESETS[1].steps[0]);
  const [mobileTab, setMobileTab] = useState<"workspace" | "cli">("workspace");

  const currentPreset = WORKFLOW_PRESETS.find((w) => w.id === state.selectedWorkflow) || WORKFLOW_PRESETS[1];

  // Sync input command when preset changes
  useEffect(() => {
    const stepIndex = state.workflowStep % currentPreset.steps.length;
    setCurrentCommand(currentPreset.steps[stepIndex]);
  }, [state.selectedWorkflow, state.workflowStep, currentPreset]);

  const handleSelectWorkflow = (workflow: WorkflowId) => {
    dispatch({ type: "select-workflow", workflow });
    const targetPreset = WORKFLOW_PRESETS.find((w) => w.id === workflow);
    if (targetPreset) {
      setCurrentCommand(targetPreset.steps[0]);
    }
  };

  const handleRunCommand = (cmd: string) => {
    dispatch({ type: "run", command: cmd });
  };

  const handleNextCommand = () => {
    dispatch({ type: "next-command" });
    const nextStep = (state.workflowStep + 1) % currentPreset.steps.length;
    setCurrentCommand(currentPreset.steps[nextStep]);
  };

  const handleReset = () => {
    dispatch({ type: "reset" });
    setCurrentCommand(currentPreset.steps[0]);
  };

  return (
    <section id="showcase" className="relative py-20 sm:py-28 px-4 sm:px-6 max-w-7xl mx-auto space-y-16">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] text-xs font-mono text-[var(--landing-primary)] font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>DUAL PERSPECTIVE ARCHITECTURE</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--landing-text)] leading-tight">
          Two Minds. One Shared State.
        </h2>

        <p className="text-base sm:text-lg text-[var(--landing-muted)]">
          The same atomic record simultaneously serves human vision and autonomous agent execution.
          Run CLI commands below to see workspace state update in real time.
        </p>

        {/* Interactive Notice */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <Info className="w-3.5 h-3.5" />
          <span>Interactive sample · changes stay in this page</span>
        </div>
      </div>

      {/* Workflow Preset Selectors */}
      <div className="flex flex-col items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--landing-muted)]">
          Select Workflow Demonstration
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {WORKFLOW_PRESETS.map((preset) => {
            const isSelected = preset.id === state.selectedWorkflow;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectWorkflow(preset.id)}
                aria-pressed={isSelected}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[var(--landing-primary)] text-white shadow-md shadow-[var(--landing-primary)]/20"
                    : "bg-[var(--landing-surface)] text-[var(--landing-muted)] hover:text-[var(--landing-text)] border border-[var(--landing-border)] hover:bg-[var(--landing-surface-muted)]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--landing-muted)] italic">
          {currentPreset.description}
        </p>
      </div>

      {/* Mobile Tab Switcher (< 1024px) */}
      <div className="flex lg:hidden justify-center">
        <div className="p-1 rounded-xl bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobileTab("workspace")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mobileTab === "workspace"
                ? "bg-white text-[var(--landing-text)] shadow-xs"
                : "text-[var(--landing-muted)]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Human Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("cli")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mobileTab === "cli"
                ? "bg-white text-[var(--landing-text)] shadow-xs"
                : "text-[var(--landing-muted)]"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>CLI & Agent Context</span>
          </button>
        </div>
      </div>

      {/* Dual Perspective Interactive Container */}
      <div className="relative rounded-3xl p-1 bg-gradient-to-b from-[var(--landing-primary-soft)] via-[var(--landing-border)] to-[var(--landing-surface-muted)] shadow-xl overflow-hidden">
        <BorderBeam
          size={140}
          duration={10}
          colorFrom="var(--landing-primary)"
          colorTo="var(--landing-primary-hover)"
          borderWidth={1.5}
        />

        <div className="bg-[var(--landing-bg)] rounded-[22px] p-4 sm:p-6">
          {/* Desktop Dual-Pane Grid (>= 1024px) */}
          <div className="hidden lg:grid grid-cols-2 gap-6 min-h-[460px]">
            <div className="min-w-0">
              <SampleWorkspace state={state} onRun={handleRunCommand} />
            </div>
            <div className="min-w-0">
              <DemoTerminal
                state={state}
                command={currentCommand}
                onCommandChange={setCurrentCommand}
                onRun={handleRunCommand}
                onNext={handleNextCommand}
                onReset={handleReset}
              />
            </div>
          </div>

          {/* Mobile Single Active Pane (< 1024px) */}
          <div className="block lg:hidden min-h-[440px]">
            {mobileTab === "workspace" ? (
              <SampleWorkspace state={state} onRun={handleRunCommand} />
            ) : (
              <DemoTerminal
                state={state}
                command={currentCommand}
                onCommandChange={setCurrentCommand}
                onRun={handleRunCommand}
                onNext={handleNextCommand}
                onReset={handleReset}
              />
            )}
          </div>
        </div>
      </div>

      {/* Real Product Screenshot Gallery */}
      <div className="pt-12 space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--landing-text)]">
            Explore the Real Product
          </h3>
          <p className="text-sm text-[var(--landing-muted)]">
            Actual captures from the KnowMe production environment running locally on macOS.
          </p>
        </div>

        <ScreenshotGallery slides={productSlides} />
      </div>
    </section>
  );
}
