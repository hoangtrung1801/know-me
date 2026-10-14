import Foundation
import KnowMeCore

/// Self-contained contract and serialization verification for the Work feature domain.
/// Does not import Testing or XCTest to ensure the App executable target compiles cleanly.
enum WorkFeatureVerification {
    static func runVerification() {
        testTaskItemDecoding()
        testActiveTimerElapsedCalculation()
        testLifecycleResponseDecoding()
        testVersionHistoryDecoding()
        testActivityFeedDecoding()
        testSearchResponseDecoding()
    }

    private static func testTaskItemDecoding() {
        let json = """
        {
            "id": "task01",
            "projectId": "proj-alpha",
            "title": "Implement authentication",
            "description": "User login flow with session cookie",
            "status": "in-progress",
            "priority": "high",
            "assignee": "alice",
            "labels": ["backend", "security"],
            "parent": "epic01",
            "subtasks": ["sub01", "sub02"],
            "spec": "specs/auth.md",
            "fulfills": ["AC-1", "AC-2"],
            "order": 10,
            "createdAt": "2026-10-14T10:00:00.000Z",
            "updatedAt": "2026-10-14T12:00:00.000Z",
            "completedAt": null,
            "archivedAt": null,
            "archived": false,
            "acceptanceCriteria": [
                {"text": "Login endpoint returns cookie", "completed": true},
                {"text": "Rejects bad password with 401", "completed": false}
            ],
            "timeSpent": 3600,
            "timeEntries": [
                {
                    "id": "te-1",
                    "startedAt": "2026-10-14T10:00:00Z",
                    "endedAt": "2026-10-14T11:00:00Z",
                    "duration": 3600,
                    "note": "Initial scaffolding"
                }
            ],
            "activeTimer": null,
            "implementationPlan": "Step 1: routes. Step 2: cookie.",
            "implementationNotes": "Used secure flag on cookies.",
            "lifecycleState": "active"
        }
        """.data(using: .utf8)!

        let task = try! JSONDecoder().decode(TaskItem.self, from: json)
        assert(task.id == "task01", "Task ID mismatch")
        assert(task.projectId == "proj-alpha", "Project ID mismatch")
        assert(task.title == "Implement authentication", "Title mismatch")
        assert(task.status == "in-progress", "Status mismatch")
        assert(task.priority == "high", "Priority mismatch")
        assert(task.labels.count == 2, "Labels count mismatch")
        assert(task.subtasks.count == 2, "Subtasks count mismatch")
        assert(task.spec == "specs/auth.md", "Spec mismatch")
        assert(task.fulfills == ["AC-1", "AC-2"], "Fulfills mismatch")
        assert(task.acceptanceCriteria.count == 2, "AC count mismatch")
        assert(task.completedAcceptanceCriteriaCount == 1, "Completed AC count mismatch")
        assert(task.acceptanceCriteriaProgress == 0.5, "AC progress mismatch")
        assert(task.timeSpent == 3600, "Time spent mismatch")
        assert(task.timeEntries.count == 1, "Time entries count mismatch")
        assert(!task.isArchived, "Archived check mismatch")
        assert(!task.isDone, "Done check mismatch")
        assert(task.createdDate != nil, "Created date parsing mismatch")
        assert(task.updatedDate != nil, "Updated date parsing mismatch")
    }

    private static func testActiveTimerElapsedCalculation() {
        let startTime = Date().addingTimeInterval(-120) // 120 seconds ago
        let startedAtStr = ISO8601Parser.format(startTime)

        // Running timer with 20 seconds total paused
        let timer = ActiveTimerItem(
            taskId: "task01",
            taskTitle: "Implement authentication",
            startedAt: startedAtStr,
            pausedAt: nil,
            totalPausedMs: 20_000
        )
        let elapsed = timer.elapsedSeconds(now: Date())
        assert(elapsed >= 99 && elapsed <= 101, "Elapsed active seconds expected ~100s, got \(elapsed)")

        // Paused timer
        let pausedTime = startTime.addingTimeInterval(60) // paused 60s into the timer
        let pausedAtStr = ISO8601Parser.format(pausedTime)
        let pausedTimer = ActiveTimerItem(
            taskId: "task01",
            taskTitle: "Implement authentication",
            startedAt: startedAtStr,
            pausedAt: pausedAtStr,
            totalPausedMs: 10_000 // 10s earlier paused
        )
        let pausedElapsed = pausedTimer.elapsedSeconds(now: Date())
        assert(pausedElapsed >= 49 && pausedElapsed <= 51, "Paused elapsed expected ~50s, got \(pausedElapsed)")
    }

    private static func testLifecycleResponseDecoding() {
        let json = """
        {
            "operation": "archive",
            "execute": false,
            "completed": false,
            "processed": 1,
            "changed": 0,
            "items": [
                {
                    "taskId": "task01",
                    "operation": "archive",
                    "changed": false,
                    "eligible": false,
                    "before": "active",
                    "after": "active",
                    "reasons": [
                        {
                            "code": "active_timer",
                            "message": "Task has an active timer"
                        }
                    ],
                    "warnings": []
                }
            ]
        }
        """.data(using: .utf8)!

        let res = try! JSONDecoder().decode(LifecycleResponse.self, from: json)
        assert(res.operation == "archive", "Operation mismatch")
        assert(!res.execute, "Execute flag mismatch")
        assert(res.items.count == 1, "Items count mismatch")
        assert(!res.items[0].eligible, "Eligibility mismatch")
        assert(res.items[0].reasons.count == 1, "Reason count mismatch")
        assert(res.items[0].reasons[0].code == "active_timer", "Reason code mismatch")
    }

    private static func testVersionHistoryDecoding() {
        let json = """
        {
            "taskId": "task01",
            "currentVersion": 2,
            "versions": [
                {
                    "id": "v1",
                    "taskId": "task01",
                    "version": 1,
                    "timestamp": "2026-10-14T10:00:00Z",
                    "author": "alice",
                    "changes": [
                        {
                            "field": "status",
                            "oldValue": "todo",
                            "newValue": "in-progress"
                        }
                    ]
                }
            ]
        }
        """.data(using: .utf8)!

        let history = try! JSONDecoder().decode(TaskVersionHistoryResponse.self, from: json)
        assert(history.taskId == "task01", "Task ID mismatch")
        assert(history.currentVersion == 2, "Current version mismatch")
        assert(history.versions.count == 1, "Versions count mismatch")
        assert(history.versions[0].changes.count == 1, "Changes count mismatch")
        assert(history.versions[0].changes[0].field == "status", "Field mismatch")
    }

    private static func testActivityFeedDecoding() {
        let json = """
        {
            "activities": [
                {
                    "taskId": "task01",
                    "taskTitle": "Implement authentication",
                    "version": 2,
                    "timestamp": "2026-10-14T12:00:00Z",
                    "author": "alice",
                    "changes": [
                        {
                            "field": "status",
                            "oldValue": "in-progress",
                            "newValue": "done"
                        }
                    ]
                }
            ]
        }
        """.data(using: .utf8)!

        let feed = try! JSONDecoder().decode(ActivityFeedResponse.self, from: json)
        assert(feed.activities.count == 1, "Activity count mismatch")
        assert(feed.activities[0].taskId == "task01", "Task ID mismatch")
        assert(feed.activities[0].changes.count == 1, "Changes count mismatch")
    }

    private static func testSearchResponseDecoding() {
        let json = """
        {
            "tasks": [
                {
                    "type": "task",
                    "id": "task01",
                    "title": "Implement authentication",
                    "score": 0.95,
                    "snippet": "User login flow with session cookie",
                    "status": "in-progress",
                    "priority": "high"
                }
            ],
            "docs": [
                {
                    "type": "doc",
                    "id": "doc01",
                    "title": "Auth Specification",
                    "path": "specs/auth.md",
                    "score": 0.88
                }
            ],
            "memories": [],
            "decisions": [],
            "code": []
        }
        """.data(using: .utf8)!

        let payload = try! JSONDecoder().decode(SearchResponsePayload.self, from: json)
        assert(payload.tasks?.count == 1, "Tasks count mismatch")
        assert(payload.docs?.count == 1, "Docs count mismatch")
        assert(payload.allHits.count == 2, "All hits count mismatch")
        assert(payload.tasks?[0].title == "Implement authentication", "Task title mismatch")
        assert(payload.docs?[0].path == "specs/auth.md", "Doc path mismatch")
    }
}
