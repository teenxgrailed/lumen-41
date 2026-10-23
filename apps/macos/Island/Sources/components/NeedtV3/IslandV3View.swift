import AppKit
import NeedtKit
import SwiftUI

enum IslandV3Format {
    static func clock(_ seconds: Int) -> String { formatClock(seconds) }

    private static let hm: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    static func time(_ date: Date) -> String { hm.string(from: date) }

    /// The speaker glyph for a volume; fixed-width at the call sites so the
    /// row does not shift as it changes.
    static func speakerSymbol(_ volume: Double) -> String {
        switch volume {
        case ..<0.005: return "speaker.slash.fill"
        case ..<0.34: return "speaker.fill"
        case ..<0.67: return "speaker.wave.1.fill"
        case ..<0.9: return "speaker.wave.2.fill"
        default: return "speaker.wave.3.fill"
        }
    }

    static func airpodsSymbol(_ name: String) -> String {
        let n = name.lowercased()
        if n.contains("max") { return "airpodsmax" }
        if n.contains("airpods") { return "airpodspro" }
        return "headphones"
    }
}

/// The island: one black shape, laid out once, never rebuilt. Each state is a
/// layer that fades in (opacity, 6 pt blur to 0, scale 0.96 to 1) after the
/// shape has started to move, and out (0.12 s) before it does.
struct IslandV3View: View {
    @ObservedObject var model: IslandV3Model

    var body: some View {
        let m = model.metrics
        let size = model.targetSize
        let width = size.width * model.grow
        let invisibleIdle = model.shapeMode == .idle && model.prefs.showNothingOnPlan && !m.hasNotch

        ZStack(alignment: .top) {
            layers(m: m)
        }
        .frame(width: width, height: size.height, alignment: .top)
        .clipShape(IslandV3ShapePath(radius: size.radius, shoulders: false, roundTop: !m.hasNotch))
        .contentShape(Rectangle())
        .gesture(closedGestures, including: model.shapeMode == .open ? .subviews : .all)
        .background(
            IslandV3ShapePath(radius: size.radius, shoulders: m.hasNotch, roundTop: !m.hasNotch)
                .fill(Color.black)
                .opacity(invisibleIdle ? 0 : 1)
                .shadow(color: .black.opacity(model.shapeMode == .open || model.shapeMode == .peek ? 0.5 : 0), radius: 18, y: 10)
        )
        .scaleEffect(x: model.pre ? 1.045 : 1, y: model.pre ? 1.12 : 1, anchor: .top)
        .offset(x: model.lean)
        .padding(.top, m.hasNotch ? 0 : 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: gestures on the closed island

    private var closedGestures: some Gesture {
        TapGesture(count: 2).onEnded { model.doubleClicked() }
            .simultaneously(with: TapGesture(count: 1).onEnded { model.clicked() })
            .simultaneously(with: LongPressGesture(minimumDuration: 0.65).onEnded { _ in model.held() })
    }

    // MARK: layers

    @ViewBuilder
    private func layers(m: IslandV3Metrics) -> some View {
        let bar = m.barHeight
        let c = model.contentMode
        let d = model.data

        IslandV3Layer(on: c == .override) {
            IslandEars(m: m, left: { EmptyView() }, right: { IslandV3Dot(size: 7) })
        }
        IslandV3Layer(on: c == .live) {
            IslandV3LiveRow(model: model, warn: false, m: m)
        }
        IslandV3Layer(on: c == .warn) {
            IslandV3LiveRow(model: model, warn: true, m: m)
        }
        IslandV3Layer(on: c == .standby || c == .go) {
            IslandV3Standby(model: model, bar: bar)
        }
        IslandV3Layer(on: c == .done) {
            IslandEars(
                m: m,
                left: { IslandV3CheckBadge() },
                right: {
                    Text("Done \(d.earlyMinutes) min early")
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                }
            )
        }
        IslandV3Layer(on: c == .music) {
            IslandEars(
                m: m,
                left: { IslandV3MiniArt(image: d.music.art) },
                right: { IslandV3EqBars(active: c == .music) }
            )
        }
        IslandV3Layer(on: c == .airpods) {
            IslandEars(
                m: m,
                left: {
                    HStack(spacing: 6) {
                        Image(systemName: IslandV3Format.airpodsSymbol(d.airpodsName))
                            .font(.system(size: 12, weight: .semibold)).frame(width: 18)
                        Text(d.airpodsName).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                    }
                },
                right: {
                    // The level is shown only when the system reports one; the
                    // slot has one fixed width either way.
                    Group {
                        if let percent = d.airpodsPercent {
                            Text("\(percent)%").monospacedDigit()
                        } else {
                            Text("Connected").foregroundStyle(Color.white.opacity(0.7))
                        }
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 66, alignment: .trailing)
                }
            )
        }
        IslandV3Layer(on: c == .charge) {
            IslandEars(
                m: m,
                left: {
                    HStack(spacing: 6) {
                        IslandV3ChargeIcon(percent: d.chargePercent)
                        Text("Charging").font(.system(size: 12, weight: .semibold))
                    }
                },
                right: { Text("\(d.chargePercent)%").font(.system(size: 12, weight: .semibold)).monospacedDigit().frame(width: 40, alignment: .trailing) }
            )
        }
        IslandV3Layer(on: c == .hudv) {
            IslandEars(
                m: m,
                left: { Image(systemName: IslandV3Format.speakerSymbol(d.volume)).font(.system(size: 12, weight: .semibold)).frame(width: 20) },
                right: {
                    HStack(spacing: 8) {
                        IslandV3Meter(value: d.volume).frame(width: 56)
                        Text("\(Int((d.volume * 100).rounded()))")
                            .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                            .frame(width: 26, alignment: .trailing)
                    }
                }
            )
        }
        IslandV3Layer(on: c == .peek) {
            IslandV3Peek(model: model, bar: bar)
        }
        IslandV3Layer(on: c == .drop || c == .dropped) {
            IslandV3Drop(model: model, bar: bar, done: c == .dropped)
        }
        if model.shapeMode == .open || c == .open {
            IslandV3Layer(on: c == .open) {
                IslandV3OpenView(model: model, bar: bar)
            }
        }
    }
}

// MARK: - Layer wrapper

/// The enter/leave look of every state: opacity, blur, scale.
struct IslandV3Layer<Content: View>: View {
    let on: Bool
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .opacity(on ? 1 : 0)
            .blur(radius: on ? 0 : 6)
            .scaleEffect(on ? 1 : 0.96, anchor: .top)
            .allowsHitTesting(on)
    }
}

// MARK: - Closed pieces

/// Content for the two halves of the menu bar either side of the camera
/// housing. Screens without a notch put both together in the middle.
struct IslandEars<Left: View, Right: View>: View {
    let m: IslandV3Metrics
    @ViewBuilder var left: () -> Left
    @ViewBuilder var right: () -> Right

    init(m: IslandV3Metrics, @ViewBuilder left: @escaping () -> Left, @ViewBuilder right: @escaping () -> Right) {
        self.m = m
        self.left = left
        self.right = right
    }

    var body: some View {
        Group {
            if m.hasNotch {
                HStack(spacing: 0) {
                    left().frame(maxWidth: .infinity, alignment: .leading)
                    Color.clear.frame(width: m.notchWidth + 8)
                    right().frame(maxWidth: .infinity, alignment: .trailing)
                }
            } else {
                HStack(spacing: 10) {
                    left()
                    right()
                }
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, 14)
        .frame(height: m.barHeight)
    }
}

struct IslandV3Dot: View {
    var size: CGFloat
    var body: some View {
        Circle()
            .fill(Color.white)
            .frame(width: size, height: size)
            .background(Circle().fill(Color.white.opacity(0.12)).frame(width: size + 6, height: size + 6))
    }
}

struct IslandV3CheckBadge: View {
    @State private var poppedState = false
    @Environment(\.islandStatic) private var isStatic
    private var popped: Bool { poppedState || isStatic }
    var body: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Color.black)
            .frame(width: 18, height: 18)
            .background(Circle().fill(IslandV3Palette.green))
            .scaleEffect(popped ? 1 : 0.01)
            .animation(.spring(response: 0.4, dampingFraction: 0.55).delay(0.25), value: popped)
            .onAppear { poppedState = true }
    }
}

struct IslandV3MiniArt: View {
    var image: NSImage?
    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fill)
            } else {
                LinearGradient(
                    colors: [Color(red: 1, green: 0.6, blue: 0.42), Color(red: 0.75, green: 0.22, blue: 0.48), Color(red: 0.23, green: 0.11, blue: 0.43)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
        .frame(width: 20, height: 20)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
}

struct IslandV3EqBars: View {
    var active: Bool
    var count = 4
    var height: CGFloat = 14
    var tint = Color(red: 1, green: 0.56, blue: 0.64)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: !active || reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<count, id: \.self) { i in
                    let phase = sin(t * 6 + Double(i) * 1.7)
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(tint)
                        .frame(width: 3, height: height * (0.25 + 0.75 * abs(phase)))
                }
            }
            .frame(height: height, alignment: .bottom)
        }
    }
}

struct IslandV3ChargeIcon: View {
    var percent: Int
    @State private var pulse = false
    var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .strokeBorder(Color.white.opacity(0.6), lineWidth: 1.5)
            .frame(width: 24, height: 12)
            .overlay(alignment: .leading) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(IslandV3Palette.green)
                    .frame(width: max(2, 20 * CGFloat(percent) / 100), height: 8)
                    .padding(.leading, 2)
                    .opacity(pulse ? 0.5 : 1)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) { pulse = true }
            }
    }
}

struct IslandV3Meter: View {
    var value: Double
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.15))
                Capsule().fill(Color.white).frame(width: proxy.size.width * CGFloat(max(0, min(1, value))))
            }
        }
        .frame(height: 6)
        .animation(.easeOut(duration: 0.2), value: value)
    }
}

// MARK: - Focus running and Warning

struct IslandV3LiveRow: View {
    @ObservedObject var model: IslandV3Model
    var warn: Bool
    var m: IslandV3Metrics

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let d = model.data
            let left = d.secondsLeft(at: context.date)
            IslandEars(
                m: m,
                left: {
                    HStack(spacing: 8) {
                        IslandV3PulseRing(progress: d.progress(at: context.date), twice: warn, active: model.contentMode == (warn ? .warn : .live))
                        Text(d.focusShort).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                    }
                },
                right: {
                    HStack(spacing: 10) {
                        if warn, let next = d.next {
                            Text("Next \(next.timeLabel) · \(next.shortTitle)")
                                .font(.system(size: 11.5, weight: .medium))
                                .foregroundStyle(Color.white.opacity(0.7))
                                .lineLimit(1)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(Capsule().fill(Color.white.opacity(0.1)))
                                .transition(.move(edge: .trailing).combined(with: .opacity))
                        }
                        Text(IslandV3Format.clock(left))
                            .font(.system(size: 12, weight: .semibold)).monospacedDigit()
                            .frame(width: 46, alignment: .trailing)
                    }
                }
            )
        }
    }
}

/// The 15 pt ring of the closed island. It breathes slowly while a block
/// runs; in Warning it pulses twice.
struct IslandV3PulseRing: View {
    var progress: Double
    var twice: Bool
    var active: Bool
    @State private var scale: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        IslandRing(progress: 1 - progress, size: 15, line: 2.6, color: .white, track: Color.white.opacity(0.2), drawIn: false)
            .scaleEffect(scale)
            .onChange(of: active) { _, isOn in
                guard isOn, !reduceMotion else { scale = 1; return }
                if twice {
                    withAnimation(.easeInOut(duration: 0.6).repeatCount(4, autoreverses: true)) { scale = 1.25 }
                } else {
                    withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) { scale = 1.1 }
                }
            }
            .onAppear {
                guard active, !reduceMotion, !twice else { return }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) { scale = 1.1 }
            }
    }
}

// MARK: - Standby and Go

struct IslandV3Standby: View {
    @ObservedObject var model: IslandV3Model
    var bar: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let d = model.data
            let total = Double(model.prefs.standbySeconds)
            let remaining = max(0, model.standbyEnd.map { $0.timeIntervalSince(context.date) } ?? total)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("STANDBY")
                        .font(.system(size: 10.5, weight: .bold)).tracking(0.8)
                        .foregroundStyle(IslandV3Palette.yellow)
                    Text(d.next?.title ?? "Nothing next")
                        .font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 4) {
                        Text(subtitle(d)).font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                        if model.prefs.quietDuringStandby {
                            Label("quiet", systemImage: "bell.slash")
                                .font(.system(size: 12)).foregroundStyle(Color.white.opacity(0.55))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                ZStack {
                    IslandRing(progress: remaining / max(1, total), size: 40, line: 3, color: IslandV3Palette.yellow, track: Color.white.opacity(0.12), drawIn: false)
                    Text("0:\(String(format: "%02d", Int(remaining.rounded(.up))))")
                        .font(.system(size: 10.5, weight: .semibold)).monospacedDigit()
                        .frame(width: 30)
                }
                Button("Skip") { model.skip() }
                    .buttonStyle(IslandCapsuleButtonStyle())
                Button("Go") { model.go() }
                    .buttonStyle(IslandCapsuleButtonStyle(prominent: true))
                    .frame(minWidth: 58)
                    .disabled(d.next == nil)
            }
            .foregroundStyle(Color.white)
            .padding(.leading, 20).padding(.trailing, 16)
            .padding(.top, bar).padding(.bottom, 10)
            .frame(maxHeight: .infinity)
            .background(Color(red: 0.039, green: 0.165, blue: 0.302).opacity(model.goFlash ? 1 : 0))
            .opacity(model.goFlash ? 0.5 : 1)
        }
    }

    private func subtitle(_ d: IslandV3Data) -> String {
        guard let next = d.next else { return "Plan something to continue" }
        if let minutes = next.minutes { return "\(next.timeLabel) · \(IslandWeek.hoursLabel(minutes)) ·" }
        return "\(next.timeLabel) ·"
    }
}

// MARK: - Peek

struct IslandV3Peek: View {
    @ObservedObject var model: IslandV3Model
    var bar: CGFloat

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let d = model.data
            HStack(spacing: 14) {
                if d.isFocusRunning && !d.focusPaused {
                    live(d, now: context.date)
                } else if let override = d.override {
                    manual(override)
                } else {
                    onPlan(d)
                }
            }
            .foregroundStyle(Color.white)
            .padding(.leading, 18).padding(.trailing, 16)
            .padding(.top, bar + 4)
            .frame(maxHeight: .infinity, alignment: .top)
        }
    }

    private func mark(_ text: String) -> some View {
        HStack(spacing: 6) {
            IslandV3Mark(size: 13)
            Text(text)
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(Color.white.opacity(0.55))
    }

    private func onPlan(_ d: IslandV3Data) -> some View {
        Group {
            // Dark cockpit: while the day is on plan nothing lights, so the
            // ring is an outline and the white dot is absent.
            Circle()
                .strokeBorder(Color.white.opacity(0.14), lineWidth: 1)
                .frame(width: 42, height: 42)
                .frame(width: 50, height: 50)
            VStack(alignment: .leading, spacing: 2) {
                mark("Needt · On plan")
                Text("Your day runs as planned").font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text(d.next.map { "Next: \($0.title) \($0.timeLabel)" } ?? "Nothing else planned today")
                    .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { model.startFocus(minutes: 25) } label: {
                Label("Start focus", systemImage: "play.fill")
            }
            .buttonStyle(IslandCapsuleButtonStyle(small: true))
        }
    }

    private func manual(_ o: IslandOverride) -> some View {
        Group {
            ZStack {
                Circle().fill(Color.white.opacity(0.07)).frame(width: 50, height: 50)
                IslandV3Dot(size: 12)
            }
            VStack(alignment: .leading, spacing: 2) {
                mark("Needt · \(o.count) manual change\(o.count == 1 ? "" : "s")")
                Text(o.text).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text("Needt keeps the rest of the day on plan")
                    .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button("Hand back to Needt") { model.handBack() }
                .buttonStyle(IslandCapsuleButtonStyle(small: true))
                .disabled(o.taskIds.isEmpty && !model.data.focusPaused)
        }
    }

    private func live(_ d: IslandV3Data, now: Date) -> some View {
        let left = d.secondsLeft(at: now)
        return Group {
            ZStack {
                IslandRing(progress: d.progress(at: now), size: 42, line: 4, color: .white, track: Color.white.opacity(0.14), comet: true)
                Text("\(left / 60)").font(.system(size: 15, weight: .bold)).monospacedDigit().frame(width: 30)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    mark("Needt · Focus")
                    Circle().fill(IslandV3Palette.green).frame(width: 6, height: 6)
                }
                Text(d.focusTitle).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.white.opacity(0.12))
                        Capsule().fill(Color.white.opacity(0.85)).frame(width: proxy.size.width * CGFloat(d.progress(at: now)))
                    }
                }
                .frame(height: 4).padding(.vertical, 3)
                HStack {
                    HStack(spacing: 3) {
                        Text(IslandV3Format.clock(left)).monospacedDigit().frame(width: 44, alignment: .leading)
                        Text("left" + (d.focusEnd.map { " · ends \(IslandV3Format.time($0))" } ?? ""))
                            .monospacedDigit()
                    }
                    Spacer(minLength: 10)
                    if let next = d.next { Text("Next: \(next.shortTitle) \(next.timeLabel)").lineLimit(1) }
                }
                .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                Button { model.togglePause() } label: { Image(systemName: "pause.fill") }
                    .buttonStyle(IslandCircleButtonStyle(large: true))
                    .accessibilityLabel("Pause")
                Button { model.finishFocus() } label: { Image(systemName: "checkmark") }
                    .buttonStyle(IslandCircleButtonStyle(prominent: true, large: true))
                    .accessibilityLabel("Done")
            }
        }
    }
}

/// The Needt mark (the app icon, small).
struct IslandV3Mark: View {
    var size: CGFloat
    var body: some View {
        Group {
            if let icon = NSApp?.applicationIconImage {
                Image(nsImage: icon).resizable()
            } else {
                RoundedRectangle(cornerRadius: 4).fill(Color.white.opacity(0.8))
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
    }
}

// MARK: - Drop to Shelf

struct IslandV3Drop: View {
    @ObservedObject var model: IslandV3Model
    var bar: CGFloat
    var done: Bool

    @State private var bob = false

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: done ? "checkmark" : "arrow.down")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.black)
                .frame(width: 22, height: 22)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(done ? IslandV3Palette.green : IslandV3Palette.tint(.shelf)))
                .offset(y: (!done && bob) ? 2 : 0)
                // The file flies in: the badge lands from a small, offset start.
                .id(done)
                .transition(.scale(scale: 0.3).combined(with: .offset(y: -14)).combined(with: .opacity))
            Text(model.data.dropText).font(.system(size: 13, weight: .semibold)).lineLimit(1)
        }
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, bar + 4)
        .frame(maxHeight: .infinity, alignment: .top)
        .animation(.spring(response: 0.45, dampingFraction: 0.7), value: done)
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { bob = true }
        }
    }
}
