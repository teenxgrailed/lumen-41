import Foundation
import OSLog
import SwiftUI
import Defaults

enum LogCategory: String {
    case lifecycle = "🔄"
    case memory = "💾"
    case performance = "⚡️"
    case ui = "🎨"
    case network = "🌐"
    case error = "❌"
    case warning = "⚠️"
    case success = "✅"
    case debug = "🔍"
    case extensions = "🧩"

    var osCategoryName: String {
        switch self {
        case .lifecycle: return "lifecycle"
        case .memory: return "memory"
        case .performance: return "performance"
        case .ui: return "ui"
        case .network: return "network"
        case .error: return "error"
        case .warning: return "warning"
        case .success: return "success"
        case .debug: return "debug"
        case .extensions: return "extensions"
        }
    }

    var defaultLevel: LogLevel {
        switch self {
        case .error: return .error
        case .warning: return .warning
        case .success, .ui, .network, .lifecycle, .memory, .performance, .extensions: return .info
        case .debug: return .debug
        }
    }
}

struct Logger {
    private static let subsystem = "com.dynamicisland.app"
    private static let dateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static var osLoggerCache: [LogCategory: OSLog] = [:]

    private static func osLogger(for category: LogCategory) -> OSLog {
        if let cached = osLoggerCache[category] {
            return cached
        }
        let logger = OSLog(subsystem: subsystem, category: category.osCategoryName)
        osLoggerCache[category] = logger
        return logger
    }

    static func log(
        _ message: String,
        category: LogCategory,
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        let configuredLevel = Defaults[.logLevel]
        if configuredLevel == .none || category.defaultLevel.rawValue > configuredLevel.rawValue {
            return
        }

        let fileName = (file as NSString).lastPathComponent
        let timestamp = dateFormatter.string(from: Date())
        let entry = "\(category.rawValue) [\(timestamp)] [\(fileName):\(line)] \(function) - \(message)"
        let logger = osLogger(for: category)
        os_log("%{public}@", log: logger, type: .default, entry)

#if DEBUG
        Swift.print(entry)
#endif
    }
    
    static func trackMemory(
        file: String = #file,
        function: String = #function,
        line: Int = #line
    ) {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_,
                         task_flavor_t(MACH_TASK_BASIC_INFO),
                         $0,
                         &count)
            }
        }
        
        if kerr == KERN_SUCCESS {
            let usedMB = Double(info.resident_size) / 1024.0 / 1024.0
            log(String(format: "Memory used: %.2f MB", usedMB),
                category: .memory,
                file: file,
                function: function,
                line: line)
        }
    }
}

extension View {
    func trackLifecycle(_ identifier: String) -> some View {
        self.modifier(ViewLifecycleTracker(identifier: identifier))
    }
}

struct ViewLifecycleTracker: ViewModifier {
    let identifier: String
    
    func body(content: Content) -> some View {
        content
            .onAppear {
                Logger.log("\(identifier) appeared", category: .lifecycle)
                Logger.trackMemory()
            }
            .onDisappear {
                Logger.log("\(identifier) disappeared", category: .lifecycle)
                Logger.trackMemory()
            }
    }
}

// Global overrides to filter scattered print and NSLog statements throughout the app

public func NSLog(_ format: String, _ args: CVarArg...) {
    let configuredLevel = Defaults[.logLevel]
    if configuredLevel == .none { return }
    
    let message = String(format: format, arguments: args)
    let lowerMessage = message.lowercased()
    
    let isError = message.contains("❌") || lowerMessage.contains("error") || lowerMessage.contains("failed")
    let isWarning = message.contains("⚠️") || lowerMessage.contains("warning")
    
    let simulatedLevel: LogLevel = isError ? .error : (isWarning ? .warning : .debug)
    
    if simulatedLevel.rawValue > configuredLevel.rawValue { return }
    
    Foundation.NSLog("%@", message)
} 