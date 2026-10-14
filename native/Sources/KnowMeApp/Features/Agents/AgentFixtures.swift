import Foundation
import KnowMeCore

/// Test fixtures and mock contracts for Agents domain verification.
/// Usable in unit verification and preview fixtures without external network requests.
enum AgentFixtures {
    static let sampleToolCall = ChatToolCallDTO(
        id: "tool_bash_001",
        name: "bash",
        input: .object(["command": .string("swift test")]),
        output: "Test run with 16 tests passed after 0.482 seconds.",
        status: "success",
        title: "Running test suite"
    )

    static let sampleQuestionBlock = ChatQuestionBlockDTO(
        id: "q_block_001",
        prompts: [
            ChatQuestionPromptDTO(
                header: "Permission Request",
                question: "Do you want to run `git merge` into main?",
                multiple: false,
                options: [
                    ChatQuestionOptionDTO(label: "Approve", description: "Merge changes to main"),
                    ChatQuestionOptionDTO(label: "Deny", description: "Keep on worktree branch")
                ]
            )
        ],
        status: "idle"
    )

    static let sampleSession = ChatSessionDTO(
        id: "chat_001",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        title: "Test Task Agent Chat",
        agentType: "omp",
        model: "omp",
        status: "idle",
        projectId: "proj_default",
        taskId: "c9axmk",
        createdAt: "2026-10-14T08:00:00Z",
        updatedAt: "2026-10-14T08:30:00Z",
        messages: [
            ChatMessageDTO(
                id: "msg_user_1",
                role: "user",
                content: "Implement native Agents and Chat features",
                model: "omp",
                createdAt: "2026-10-14T08:00:00Z"
            ),
            ChatMessageDTO(
                id: "msg_asst_1",
                role: "assistant",
                content: "I have investigated the task and created an implementation plan.",
                model: "omp",
                createdAt: "2026-10-14T08:01:00Z",
                phase: "investigation",
                toolCalls: [sampleToolCall]
            )
        ]
    )

    static let sampleTaskSnapshot = AgentTaskSnapshotDTO(
        workflow: AgentWorkflowDTO(
            projectId: "proj_default",
            taskId: "c9axmk",
            phase: .planReview,
            activeRunId: "run_001",
            ompSessionId: "omp_session_001",
            codexSessionId: "omp_session_001",
            chatSessionId: "chat_001",
            worktreePath: "/tmp/worktree-c9axmk",
            worktreeBranch: "worktree/c9axmk",
            updatedAt: "2026-10-14T08:30:00Z"
        ),
        chatSessionId: "chat_001",
        runs: [
            AgentRunDTO(
                id: "run_001",
                projectId: "proj_default",
                taskId: "c9axmk",
                phase: "investigation",
                status: "succeeded",
                startedAt: "2026-10-14T08:00:00Z",
                finishedAt: "2026-10-14T08:05:00Z",
                exitCode: 0,
                summary: "Investigation complete; plan ready for human review."
            )
        ],
        reviewComments: [
            ReviewCommentDTO(
                id: "rev_001",
                projectId: "proj_default",
                taskId: "c9axmk",
                stage: "plan",
                body: "Ensure Swift 6 strict concurrency checks pass.",
                createdAt: "2026-10-14T08:10:00Z"
            )
        ],
        dirtyFiles: ["native/Sources/KnowMeApp/Features/Agents/ChatView.swift"],
        diff: """
        --- a/native/Sources/KnowMeApp/Features/Agents/ChatView.swift
        +++ b/native/Sources/KnowMeApp/Features/Agents/ChatView.swift
        @@ -1,5 +1,6 @@
        +import SwiftUI
        """,
        adapterState: "stopped",
        resumable: false,
        interrupted: false
    )

    static let sampleCodexStatus = CodexStatusDTO(
        installed: true,
        loggedIn: true,
        version: "18.10.0",
        executable: "/opt/homebrew/bin/omp",
        installCommand: "brew install can1357/tap/omp",
        loginCommand: "omp auth-broker",
        docsUrl: "https://github.com/can1357/omp"
    )

    static let sampleOpenCodeDisabledStatus = OpenCodeStatusDTO(
        configured: false,
        mode: "managed",
        state: "unavailable",
        available: false,
        ready: false,
        lastError: "OpenCode is disabled by server browser command"
    )
}
