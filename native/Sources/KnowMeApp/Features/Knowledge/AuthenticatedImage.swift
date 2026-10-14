import SwiftUI
import AppKit
import KnowMeCore

private final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSString, NSImage>()
    private init() {
        cache.countLimit = 200
        cache.totalCostLimit = 100 * 1024 * 1024 // 100 MB
    }

    func image(for key: String) -> NSImage? {
        cache.object(forKey: key as NSString)
    }

    func set(_ image: NSImage, for key: String) {
        let cost = Int(image.size.width * image.size.height * 4)
        cache.setObject(image, forKey: key as NSString, cost: cost)
    }
}

public struct AuthenticatedImageView: View {
    public let pathOrURL: String
    public let client: APIClient?
    public var contentMode: ContentMode = .fit

    @State private var image: NSImage?
    @State private var isLoading = false
    @State private var hasFailed = false

    public init(pathOrURL: String, client: APIClient?, contentMode: ContentMode = .fit) {
        self.pathOrURL = pathOrURL
        self.client = client
        self.contentMode = contentMode
    }

    public var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else if isLoading {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if hasFailed {
                VStack(spacing: 4) {
                    Image(systemName: "photo")
                        .font(.title3)
                        .foregroundStyle(.tertiary)
                    Text("Unavailable")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Color.secondary.opacity(0.1)
            }
        }
        .task(id: "\(client?.baseURL.absoluteString ?? "external"):\(pathOrURL)") {
            await loadImage()
        }
    }

    private func loadImage() async {
        let key = pathOrURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            hasFailed = true
            return
        }

        let cacheKey = "\(client?.baseURL.absoluteString ?? "external"):\(key)"
        if let cached = ImageCache.shared.image(for: cacheKey) {
            self.image = cached
            return
        }

        isLoading = true
        hasFailed = false

        do {
            let data: Data
            if key.hasPrefix("http://") || key.hasPrefix("https://") {
                guard let url = URL(string: key) else {
                    hasFailed = true
                    isLoading = false
                    return
                }
                if let client, url.scheme == client.baseURL.scheme, url.host == client.baseURL.host, url.port == client.baseURL.port {
                    let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.reduce(into: [String: String]()) { $0[$1.name] = $1.value ?? "" } ?? [:]
                    data = try await client.download(path: url.path, query: query)
                } else {
                let (downloadedData, response) = try await URLSession.shared.data(from: url)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                    hasFailed = true
                    isLoading = false
                    return
                }
                data = downloadedData
                }
            } else if let client {
                // Internal API path e.g. /api/assets/abc.png or /api/links/123/image
                let cleanPath = key.hasPrefix("/") ? key : "/" + key
                data = try await client.download(path: cleanPath)
            } else {
                hasFailed = true
                isLoading = false
                return
            }

            if let nsImage = NSImage(data: data) {
                ImageCache.shared.set(nsImage, for: cacheKey)
                self.image = nsImage
            } else {
                hasFailed = true
            }
        } catch {
            hasFailed = true
        }
        isLoading = false
    }
}
