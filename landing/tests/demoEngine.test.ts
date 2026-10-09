import { describe, it, expect } from "bun:test";
import { parseDemoCommand, demoReducer, buildSampleRetrieval } from "../src/lib/demoEngine";
import { createInitialDemoState, SAMPLE_COMMANDS } from "../src/data/demoFixtures";

describe("Demo Engine", () => {
  it("initializes with consistent default state", () => {
    const state = createInitialDemoState();
    expect(state.task.id).toBe("demo-104");
    expect(state.task.status).toBe("todo");
    expect(state.task.criteria.length).toBe(2);
    expect(state.task.criteria[0].completed).toBe(false);
    expect(state.memos.length).toBe(0);
  });

  it("parses and executes task status transition", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.taskStatus,
    });

    expect(nextState.task.status).toBe("in-progress");
    expect(nextState.errorMessage).toBeUndefined();
    expect(nextState.transcript.length).toBe(2);
    expect(nextState.transcript[1].summary).toContain("status changed to 'in-progress'");
  });

  it("parses and executes checking an acceptance criterion", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.taskCheckAc,
    });

    expect(nextState.task.criteria[0].completed).toBe(true);
    expect(nextState.task.criteria[1].completed).toBe(false);
    expect(nextState.transcript[1].summary).toContain("Checked AC #1");
  });

  it("parses and executes unchecking an acceptance criterion", () => {
    let state = createInitialDemoState();
    state = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.taskCheckAc,
    });
    expect(state.task.criteria[0].completed).toBe(true);

    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.taskUncheckAc,
    });
    expect(nextState.task.criteria[0].completed).toBe(false);
    expect(nextState.transcript[2].summary).toContain("Unchecked AC #1");
  });

  it("parses and executes adding a global memo", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.captureMemo,
    });

    expect(nextState.memos.length).toBe(1);
    expect(nextState.memos[0].content).toBe("Idea: weekly review every Friday");
    expect(nextState.memos[0].scope).toBe("global");
    expect(nextState.transcript[1].summary).toContain("Added global memo [memo-1]");
  });

  it("parses and executes search command without mutating task state", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.search,
    });

    expect(nextState.task.status).toBe("todo");
    expect(nextState.transcript[1].summary).toContain('Search "release": found 1 task');
  });

  it("parses and executes retrieve command with accurate projection", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.retrieve,
    });

    expect(nextState.transcript[1].summary).toContain("Context pack generated: 2 items cited");

    const projection = buildSampleRetrieval(nextState);
    expect(projection.query).toBe("release");
    expect(projection.candidates.length).toBe(2);
    expect(projection.contextPack.items.length).toBe(2);
    expect(projection.contextPack.items[0].citation.id).toBe("demo-104");
  });

  it("rejects unknown or invalid commands gracefully", () => {
    const state = createInitialDemoState();
    const nextState = demoReducer(state, {
      type: "run",
      command: "rm -rf /",
    });

    expect(nextState.task.status).toBe("todo");
    expect(nextState.errorMessage).toBeDefined();
    expect(nextState.transcript[1].status).toBe("error");
  });

  it("rejects shell chain operators for security", () => {
    const res = parseDemoCommand("knowme status && whoami");
    expect(res.success).toBe(false);
  });

  it("resets state deterministically", () => {
    let state = createInitialDemoState();
    state = demoReducer(state, {
      type: "run",
      command: SAMPLE_COMMANDS.taskStatus,
    });
    expect(state.task.status).toBe("in-progress");

    const resetState = demoReducer(state, { type: "reset" });
    expect(resetState.task.status).toBe("todo");
    expect(resetState.task.criteria[0].completed).toBe(false);
    expect(resetState.memos.length).toBe(0);
  });
});
