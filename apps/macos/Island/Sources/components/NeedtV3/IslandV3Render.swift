import AppKit
import NeedtKit
import SwiftUI

/// CI only: `Needt --render-island-states <dir>` draws every island state once
/// with fixture data (ImageRenderer) and writes a PNG per state, so the result
/// can be compared with the HTML lab (additions-2/widgets/index.html). It
/// touches no account, network or window.
@MainActor
enum IslandV3Render {
    static let flag = "--render-island-states"

    static var outputDirectory: URL? {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: flag), args.indices.contains(i + 1) else { return nil }
        return URL(fileURLWithPath: args[i + 1], isDirectory: true)
    }

    struct Case {
        var name: String
        var mode: IslandV3Mode
        var tab: IslandV3Tab = .today
        var module: IslandModuleID?
        var focus = true
        var override = false
    }

    static func cases() -> [Case] {
        var list: [Case] = [
            Case(name: "01-on-plan", mode: .idle, focus: false),
            Case(name: "02-manual-change", mode: .override, focus: false, override: true),
            Case(name: "03-focus-running", mode: .live),
            Case(name: "04-warning", mode: .warn),
            Case(name: "05-standby", mode: .standby),
            Case(name: "06-go", mode: .go),
            Case(name: "07-peek-focus", mode: .peek),
            Case(name: "08-peek-on-plan", mode: .peek, focus: false),
            Case(name: "09-peek-manual", mode: .peek, focus: false, override: true),
            Case(name: "10-open-today", mode: .open, tab: .today),
            Case(name: "11-open-week", mode: .open, tab: .week),
            Case(name: "12-open-focus", mode: .open, tab: .focus),
            Case(name: "13-open-more", mode: .open, tab: .more),
            Case(name: "14-done-early", mode: .done),
            Case(name: "15-music", mode: .music),
            Case(name: "16-airpods", mode: .airpods),
            Case(name: "17-charging", mode: .charge),
            Case(name: "18-volume", mode: .hudv),
            Case(name: "19-drop-to-shelf", mode: .drop, focus: false),
            Case(name: "20-dropped", mode: .dropped, focus: false)
        ]
        for (i, id) in IslandModuleID.allCases.enumerated() {
            list.append(Case(name: String(format: "%02d-module-%@", 21 + i, id.rawValue), mode: .open, tab: .module, module: id))
        }
        return list
    }

    /// Fixture data in the lab's own numbers.
    static func fixture(_ c: Case) -> IslandV3Data {
        var d = IslandV3Data()
        let now = Date()
        d.focusTitle = "Deep work on the main project"
        d.focusShort = "Deep work"
        d.focusTotal = 25 * 60
        d.focusEnd = c.focus ? now.addingTimeInterval(c.mode == .warn ? 299 : (c.mode == .standby ? 30 : 18 * 60 + 4)) : nil
        d.next = IslandV3Next(id: "n1", title: "Write the weekly report", shortTitle: "Weekly report", timeLabel: "15:00", minutes: 60)
        d.rows = [
            IslandV3Row(id: "1", title: "Write the weekly report", time: "15:00", color: IslandV3Palette.area[0]),
            IslandV3Row(id: "2", title: "Call mom", time: "16:30", color: IslandV3Palette.area[2]),
            IslandV3Row(id: "3", title: "Gym", time: "18:00", color: IslandV3Palette.area[1]),
            IslandV3Row(id: "4", title: "Duolingo", time: "21:00", color: IslandV3Palette.area[3])
        ]
        d.leftCount = 5
        d.freeLabel = "6 h free"
        let cal = Calendar.current
        let load = [240, 360, 180, 300, 120, 60, 0]
        if let start = cal.dateInterval(of: .weekOfYear, for: now)?.start {
            d.week = (0..<7).compactMap { i in
                cal.date(byAdding: .day, value: i, to: start).map {
                    IslandWeekDay(date: $0, minutes: load[i], isToday: cal.isDate($0, inSameDayAs: now))
                }
            }
        }
        d.weekPlannedLabel = "21 h"
        d.weekFreeLabel = "19 h free"
        if c.override {
            d.override = IslandOverride(text: "You moved Gym to 19:00", taskIds: ["3"], count: 1)
        }
        d.music = IslandV3Music(title: "Night Swim", artist: "Example Artist", isPlaying: true, art: nil)
        d.dropText = c.mode == .dropped ? "brief.pdf is on the Shelf" : "Drop to Shelf"
        return d
    }

    static func view(for c: Case, metrics: IslandV3Metrics) -> some View {
        let model = IslandV3Model(metrics: metrics, preview: true)
        model.data = fixture(c)
        model.showForRender(c.mode, tab: c.tab, module: c.module)
        let width: CGFloat = 840
        let height: CGFloat = 400
        return ZStack(alignment: .top) {
            LinearGradient(
                colors: [Color(red: 0.62, green: 0.70, blue: 0.82), Color(red: 0.86, green: 0.78, blue: 0.84)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Rectangle().fill(Color.white.opacity(0.35)).frame(height: metrics.barHeight)
                .frame(maxHeight: .infinity, alignment: .top)
            IslandV3View(model: model)
        }
        .frame(width: width, height: height)
        .environment(\.islandStatic, true)
        .environment(\.colorScheme, .dark)
    }

    /// Writes the PNGs and returns the number written.
    @discardableResult
    static func run(into directory: URL) -> Int {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var written = 0
        for (suffix, metrics) in [("notch", IslandV3Metrics.previewNotch), ("pill", IslandV3Metrics.pill)] {
            for c in cases() {
                // The pill is only worth a look in the states people see most.
                if suffix == "pill", !["01-on-plan", "03-focus-running", "04-warning", "05-standby", "07-peek-focus", "10-open-today"].contains(c.name) { continue }
                let renderer = ImageRenderer(content: view(for: c, metrics: metrics))
                renderer.scale = 2
                guard let image = renderer.nsImage,
                      let tiff = image.tiffRepresentation,
                      let rep = NSBitmapImageRep(data: tiff),
                      let png = rep.representation(using: .png, properties: [:]) else { continue }
                let file = directory.appendingPathComponent("island-\(suffix)-\(c.name).png")
                if (try? png.write(to: file)) != nil { written += 1 }
            }
        }
        print("island render: wrote \(written) PNGs to \(directory.path)")
        return written
    }
}
