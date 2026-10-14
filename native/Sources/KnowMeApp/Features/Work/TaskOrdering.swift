import Foundation

extension TaskItem {
    var scopedID: String {
        guard let projectId, !projectId.isEmpty, !id.hasPrefix(projectId + ":") else { return id }
        return projectId + ":" + id
    }
}

enum TaskOrdering {
    /// Build the destination column from the complete loaded snapshot so filtered-out
    /// cards retain their relative positions. A nil anchor appends to the column.
    static func orders(in tasks: [TaskItem], moving id: String, to status: String, before anchor: String?) -> [ReorderItem]? {
        guard let moving = tasks.first(where: { $0.scopedID == id }), !moving.isArchived, anchor != id else { return nil }
        var column = TaskQuery().apply(to: tasks).filter { $0.status == status && $0.scopedID != id }
        let index: Int
        if let anchor {
            guard let match = column.firstIndex(where: { $0.scopedID == anchor }) else { return nil }
            index = match
        } else { index = column.count }
        column.insert(moving, at: index)
        return column.enumerated().map { ReorderItem(id: $0.element.scopedID, order: $0.offset) }
    }
}
