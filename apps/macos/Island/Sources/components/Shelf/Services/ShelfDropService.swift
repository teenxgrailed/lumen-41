import AppKit
import Foundation
import UniformTypeIdentifiers

struct ShelfDropService {
    static func items(from providers: [NSItemProvider]) async -> [ShelfItem] {
        var results: [ShelfItem] = []

        for provider in providers {
            if let item = await processProvider(provider) {
                results.append(item)
            }
        }

        return results
    }

    static func items(from fileURLs: [URL]) async -> [ShelfItem] {
        var results: [ShelfItem] = []
        let fileManager = FileManager.default

        for fileURL in fileURLs {
            let resolvedURL = fileURL.standardizedFileURL
            guard resolvedURL.isFileURL else { continue }
            guard fileManager.fileExists(atPath: resolvedURL.path) else {
                NSLog("⚠️ Ignoring non-existent file URL: \(resolvedURL.path)")
                continue
            }

            if let bookmark = createBookmark(for: resolvedURL) {
                results.append(await ShelfItem(kind: .file(bookmark: bookmark), isTemporary: false))
            }
        }

        return results
    }
    
    private static func processProvider(_ provider: NSItemProvider) async -> ShelfItem? {
        if let actualFileURL = await provider.extractFileURL() {
            if let bookmark = createBookmark(for: actualFileURL) {
                return await ShelfItem(kind: .file(bookmark: bookmark), isTemporary: false)
            }
            return nil
        }
        
        if let url = await provider.extractURL() {
            if url.isFileURL {
                if let bookmark = createBookmark(for: url) {
                    return await ShelfItem(kind: .file(bookmark: bookmark), isTemporary: false)
                }
            } else {
                return await ShelfItem(kind: .link(url: url), isTemporary: false)
            }
            return nil
        }
        
        if let text = await provider.extractText() {
            return await ShelfItem(kind: .text(string: text), isTemporary: false)
        }
        
        if let data = await provider.loadData() {
            if let tempDataURL = await TemporaryFileStorageService.shared.createTempFile(for: .data(data, suggestedName: provider.suggestedName)),
               let bookmark = createBookmark(for: tempDataURL) {
                return await ShelfItem(kind: .file(bookmark: bookmark), isTemporary: true)
            }
            return nil
        }
        
        if let fileURL = await provider.extractItem() {
            if let bookmark = createBookmark(for: fileURL) {
                return await ShelfItem(kind: .file(bookmark: bookmark), isTemporary: false)
            }
        }
        
        return nil
    }
    
    private static func createBookmark(for url: URL) -> Data? {
        return (try? Bookmark(url: url))?.data
    }
}
