import Foundation

@MainActor
final class MediaChecker: Sendable {
    enum MediaCheckerError: Error {
        case missingResources
        case processExecutionFailed
        case timeout
    }

    func checkDeprecationStatus() async throws -> Bool {
        guard let scriptURL = Bundle.main.url(forResource: "mediaremote-adapter", withExtension: "pl"),
              let frameworkPath =
                    Bundle.main.resourceURL?
                        .appendingPathComponent("MediaRemoteAdapter.framework")
                        .path
        else {
            throw MediaCheckerError.missingResources
        }

        let nowPlayingTestClientPath =
            Bundle.main.bundleURL
                .appendingPathComponent("Contents/Helpers/NowPlayingTestClient")
                .path

        guard FileManager.default.isExecutableFile(atPath: nowPlayingTestClientPath) else {
            throw MediaCheckerError.missingResources
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/perl")
        process.arguments = [scriptURL.path, frameworkPath, nowPlayingTestClientPath, "test"]

        // Capture stderr to distinguish script errors from genuine deprecation.
        // The perl script's fail() and the framework's test function both exit
        // with status 1, but only script-level failures write to stderr.
        let stderrPipe = Pipe()
        process.standardError = stderrPipe

        do {
            try process.run()
        } catch {
            throw MediaCheckerError.processExecutionFailed
        }

        // Timeout after 10 seconds
        let didExit: Bool = try await withThrowingTaskGroup(of: Bool.self) { group in
            group.addTask {
                process.waitUntilExit()
                return true
            }
            group.addTask {
                try await Task.sleep(for: .seconds(10))
                if process.isRunning {
                    process.terminate()
                }
                return false
            }
            for try await exited in group {
                if exited {
                    group.cancelAll()
                    return true
                }
            }
            throw MediaCheckerError.timeout
        }

        if !didExit {
            throw MediaCheckerError.timeout
        }

        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrOutput = String(data: stderrData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        // If the process exited with a non-zero status AND stderr contains
        // output, a script-level error occurred (e.g. framework failed to load,
        // symbol not found). Treat this as an execution failure rather than
        // reporting deprecated, since perl's fail() also uses exit(1).
        if process.terminationStatus != 0, !stderrOutput.isEmpty {
            print("MediaChecker: script error (exit \(process.terminationStatus)): \(stderrOutput)")
            throw MediaCheckerError.processExecutionFailed
        }

        let isDeprecated = process.terminationStatus == 1
        return isDeprecated
    }
}
