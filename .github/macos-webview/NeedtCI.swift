// The runner-side half of the real-WKWebView check (macos-webview.yml).
// Compiled on the runner: swiftc -O NeedtCI.swift -o needt-ci
//
//   needt-ci display [W H]           list display modes; switch to one >= W x H
//   needt-ci window-id               CGWindowID of the Needt main window
//   needt-ci send <command>          a command for the CI build of the app
//                                    (apps/macos/CI/CIHarness.swift)
//   needt-ci wheel X Y N             N wheel events posted to the system at
//                                    screen point X,Y (needs Accessibility)
//   needt-ci frame A.png B.png S BAR the top BAR points of A and B are the same
//                                    picture (S = pixels per point); prints how
//                                    much of the rest changed
//   needt-ci edge A.png S            no tall fully transparent run at the right edge
//   needt-ci region A.png S X Y W H  the rect (points) is not blank
//   needt-ci strips A.png S X Y W H  distinct colours in 10 vertical strips
//
// Checks print `PASS ...` or `FAIL ...` and exit 1 on FAIL.
import AppKit
import CoreGraphics
import Foundation
import ImageIO

struct Bitmap {
    let width: Int
    let height: Int
    let pixels: [UInt8]

    init?(path: String) {
        guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }
        let w = image.width, h = image.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        let ok = data.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(
                data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8,
                bytesPerRow: w * 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        width = w
        height = h
        pixels = data
    }

    /// RGBA at (x, y), y from the top.
    func at(_ x: Int, _ y: Int) -> (UInt8, UInt8, UInt8, UInt8) {
        let o = (y * width + x) * 4
        return (pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3])
    }
}

func fail(_ message: String) -> Never {
    print("FAIL \(message)")
    exit(1)
}

func load(_ path: String) -> Bitmap {
    guard let bitmap = Bitmap(path: path) else { fail("cannot read \(path)") }
    return bitmap
}

func number(_ text: String) -> Double {
    guard let value = Double(text) else { fail("not a number: \(text)") }
    return value
}

let args = Array(CommandLine.arguments.dropFirst())
guard let verb = args.first else {
    print("usage: needt-ci display|window-id|send|wheel|frame|edge|region|strips ...")
    exit(2)
}

switch verb {
case "display":
    let display = CGMainDisplayID()
    let options = [kCGDisplayShowDuplicateLowResolutionModes: kCFBooleanTrue] as CFDictionary
    let modes = (CGDisplayCopyAllDisplayModes(display, options) as? [CGDisplayMode]) ?? []
    let current = CGDisplayCopyDisplayMode(display)
    print("display \(display): current \(current.map { "\($0.width)x\($0.height) px \($0.pixelWidth)x\($0.pixelHeight)" } ?? "?")")
    for mode in modes {
        print("  mode \(mode.width)x\(mode.height) px \(mode.pixelWidth)x\(mode.pixelHeight) usable=\(mode.isUsableForDesktopGUI())")
    }
    if args.count >= 3 {
        let w = Int(number(args[1])), h = Int(number(args[2]))
        let fits = modes.filter { $0.width >= w && $0.height >= h && $0.isUsableForDesktopGUI() }
            .sorted { ($0.width * $0.height, $0.pixelWidth) < ($1.width * $1.height, $1.pixelWidth) }
        let pick = fits.first ?? modes.filter { $0.isUsableForDesktopGUI() }.max { $0.width * $0.height < $1.width * $1.height }
        if let pick, pick.width != current?.width || pick.height != current?.height {
            var config: CGDisplayConfigRef?
            CGBeginDisplayConfiguration(&config)
            CGConfigureDisplayWithDisplayMode(config, display, pick, nil)
            let result = CGCompleteDisplayConfiguration(config, .permanently)
            print("switch to \(pick.width)x\(pick.height): \(result == .success ? "ok" : "error \(result.rawValue)")")
        }
        let now = CGDisplayCopyDisplayMode(display)
        print("display now \(now.map { "\($0.width)x\($0.height) px \($0.pixelWidth)x\($0.pixelHeight)" } ?? "?")")
    }

case "window-id":
    let list = (CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    var best: (id: Int, area: Double, bounds: String)?
    for info in list {
        guard (info[kCGWindowOwnerName as String] as? String) == "Needt",
              (info[kCGWindowLayer as String] as? Int) == 0,
              let id = info[kCGWindowNumber as String] as? Int,
              let b = info[kCGWindowBounds as String] as? [String: Any],
              let w = (b["Width"] as? NSNumber)?.doubleValue,
              let h = (b["Height"] as? NSNumber)?.doubleValue
        else { continue }
        // The start window is 440 x 520; the main window is never that small.
        guard w >= 800, h >= 500 else { continue }
        if best == nil || w * h > best!.area {
            best = (id, w * h, "\(b["X"] ?? 0),\(b["Y"] ?? 0) \(w)x\(h)")
        }
    }
    guard let best else { exit(1) }
    FileHandle.standardError.write(Data("window \(best.id) at \(best.bounds)\n".utf8))
    print(best.id)

case "send":
    guard args.count >= 2 else { exit(2) }
    DistributedNotificationCenter.default().postNotificationName(
        Notification.Name("app.needt.mac.ci"), object: args[1], userInfo: nil, deliverImmediately: true
    )

case "wheel":
    guard args.count >= 4 else { exit(2) }
    let point = CGPoint(x: number(args[1]), y: number(args[2]))
    CGWarpMouseCursorPosition(point)
    for _ in 0..<Int(number(args[3])) {
        let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -120, wheel2: 0, wheel3: 0)
        event?.location = point
        event?.post(tap: .cghidEventTap)
        usleep(40_000)
    }

case "frame":
    guard args.count >= 5 else { exit(2) }
    let a = load(args[1]), b = load(args[2])
    let scale = number(args[3]), bar = Int(number(args[4]) * scale)
    guard a.width == b.width, a.height == b.height else {
        fail("frame: sizes differ \(a.width)x\(a.height) vs \(b.width)x\(b.height)")
    }
    func differs(_ p: (UInt8, UInt8, UInt8, UInt8), _ q: (UInt8, UInt8, UInt8, UInt8)) -> Bool {
        abs(Int(p.0) - Int(q.0)) > 12 || abs(Int(p.1) - Int(q.1)) > 12 || abs(Int(p.2) - Int(q.2)) > 12 || abs(Int(p.3) - Int(q.3)) > 12
    }
    var barDiff = 0, restDiff = 0
    for y in 0..<a.height {
        for x in stride(from: 0, to: a.width, by: y < bar ? 1 : 2) where differs(a.at(x, y), b.at(x, y)) {
            if y < bar { barDiff += 1 } else { restDiff += 1 }
        }
    }
    let barShare = Double(barDiff) / Double(max(1, a.width * min(bar, a.height)))
    let restShare = Double(restDiff) / Double(max(1, (a.width / 2) * max(1, a.height - bar)))
    let summary = String(format: "top %d pt: %.2f%% of pixels changed; below it: %.1f%% changed", bar / max(1, Int(scale)), barShare * 100, restShare * 100)
    if restShare < 0.005 { print("NOTE the wheel moved nothing below the bar (\(summary))") }
    if barShare > 0.01 { fail("frame: the top bar moved (\(summary))") }
    print("PASS frame: \(summary)")

case "edge":
    guard args.count >= 3 else { exit(2) }
    let a = load(args[1])
    let scale = number(args[2])
    // Rounded window corners are transparent; skip them.
    let skip = Int(24 * scale)
    var longest = 0, run = 0, at = 0
    for y in skip..<max(skip, a.height - skip) {
        var clear = true
        for x in max(0, a.width - 3)..<a.width where a.at(x, y).3 > 8 { clear = false }
        run = clear ? run + 1 : 0
        if run > longest { longest = run; at = y - run + 1 }
    }
    let limit = Int(40 * scale)
    if longest > limit { fail("edge: \(longest) px fully transparent at the right edge from y \(at)") }
    print("PASS edge: longest transparent run at the right edge is \(longest) px")

case "region", "strips":
    guard args.count >= 7 else { exit(2) }
    let a = load(args[1])
    let scale = number(args[2])
    let x0 = max(0, Int(number(args[3]) * scale)), y0 = max(0, Int(number(args[4]) * scale))
    let x1 = min(a.width, x0 + Int(number(args[5]) * scale)), y1 = min(a.height, y0 + Int(number(args[6]) * scale))
    guard x1 > x0, y1 > y0 else { fail("\(verb): rect outside the picture") }
    if verb == "region" {
        var sum = 0.0, sumSq = 0.0, n = 0.0
        var colours = Set<Int>()
        for y in y0..<y1 {
            for x in x0..<x1 {
                let p = a.at(x, y)
                let l = 0.2126 * Double(p.0) + 0.7152 * Double(p.1) + 0.0722 * Double(p.2)
                sum += l; sumSq += l * l; n += 1
                colours.insert((Int(p.0) >> 3) << 10 | (Int(p.1) >> 3) << 5 | Int(p.2) >> 3)
            }
        }
        let mean = sum / n
        let sd = (sumSq / n - mean * mean).squareRoot()
        let summary = String(format: "luminance sd %.1f, %d colours", sd, colours.count)
        if sd < 10 || colours.count < 6 { fail("region \(args[3...6].joined(separator: ",")) is blank (\(summary))") }
        print("PASS region \(args[3...6].joined(separator: ",")): \(summary)")
    } else {
        var counts: [Int] = []
        for k in 0..<10 {
            let sx0 = x0 + (x1 - x0) * k / 10, sx1 = x0 + (x1 - x0) * (k + 1) / 10
            var colours = Set<Int>()
            for y in stride(from: y0, to: y1, by: 2) {
                for x in stride(from: sx0, to: sx1, by: 2) {
                    let p = a.at(x, y)
                    colours.insert(Int(p.0) << 16 | Int(p.1) << 8 | Int(p.2))
                }
            }
            counts.append(colours.count)
        }
        let left = counts.prefix(4).max() ?? 0
        let right = counts.suffix(3).max() ?? 0
        let summary = "distinct colours per tenth: \(counts.map(String.init).joined(separator: " "))"
        if left > 40 && right * 4 < left { fail("strips: the right of the rect is flat next to its left (\(summary))") }
        print("PASS strips: \(summary)")
    }

default:
    print("unknown verb \(verb)")
    exit(2)
}
