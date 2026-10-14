import SwiftUI
import UniformTypeIdentifiers

extension View {
    func onImagePaste(perform action: @escaping @MainActor @Sendable (Data, String, String) async -> Void) -> some View {
        onPasteCommand(of: [.png, .jpeg, .tiff]) { providers in
            for provider in providers {
                guard let type = [UTType.png, .jpeg, .tiff].first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) else { continue }
                provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
                    guard let data else { return }
                    Task { @MainActor in await action(data, "pasted-image.\(type.preferredFilenameExtension ?? "png")", type.preferredMIMEType ?? "image/png") }
                }
            }
        }
    }
}
