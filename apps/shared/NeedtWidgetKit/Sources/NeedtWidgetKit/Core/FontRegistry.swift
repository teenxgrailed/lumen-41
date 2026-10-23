import CoreText
import Foundation

/// Registers the open-licence faces the styles ask for (Resources/Fonts, all
/// SIL OFL). A widget extension cannot list them in Info.plist for a package
/// resource, so they are registered for the process on first use. A face that
/// is missing simply is not in `names`, and the style falls back to a system
/// design.
enum FontRegistry {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var done = false
    nonisolated(unsafe) private(set) static var names: Set<String> = []

    static func registerIfNeeded() {
        lock.lock()
        defer { lock.unlock() }
        guard !done else { return }
        done = true
        for ext in ["ttf", "otf"] {
            let urls = (Bundle.module.urls(forResourcesWithExtension: ext, subdirectory: "Fonts") ?? []) + (Bundle.module.urls(forResourcesWithExtension: ext, subdirectory: nil) ?? [])
            for url in urls {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
                if let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] {
                    for d in descriptors {
                        if let family = CTFontDescriptorCopyAttribute(d, kCTFontFamilyNameAttribute) as? String {
                            names.insert(family)
                        }
                    }
                }
            }
        }
    }
}
