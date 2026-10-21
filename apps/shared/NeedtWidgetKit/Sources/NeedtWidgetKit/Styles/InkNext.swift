import NeedtKit
import SwiftUI
import WidgetKit

/// D · Ink, Next event: small (six states), medium timeline, accessories.
struct InkNext: View {
    @Environment(\.needt) private var c
    @Environment(\.redactionReasons) private var redaction
    var model: NextModel

    var body: some View {
        switch c.family {
        case .small: small
        case .medium: medium
        case .circular: circular
        case .rectangular: rectangular
        case .inline: inline
        default: small
        }
    }

    private var locked: Bool { redaction.contains(.privacy) && !c.showTitles }

    private func time(_ d: Date) -> String { WidgetClock.hhmm(d, calendar: c.calendar) }

    // MARK: small

    @ViewBuilder
    private var small: some View {
        switch model.state {
        case .placeholder:
            VStack(alignment: .leading, spacing: 8) {
                PlaceholderBar(width: 80, height: 10)
                PlaceholderBar(width: 100, height: 12)
                PlaceholderBar(width: 70, height: 10)
                Spacer(minLength: 0)
            }
        case .signedOut:
            StateCenter(symbol: "person.crop.circle", title: "Sign in to see your day", detail: nil).widgetURL(NeedtLink.signIn)
        case .none:
            StateCenter(symbol: "checkmark", title: "No more events",
                        detail: model.tomorrow.map { "Tomorrow: \($0.title) \(time($0.start))" }).widgetURL(NeedtLink.calendar)
        case .allDayOnly:
            StateCenter(symbol: "sun.max", title: model.allDayTitle ?? "All day", detail: "No timed events").widgetURL(NeedtLink.calendar)
        case .upcoming, .soon, .inProgress:
            if let e = model.event { smallEvent(e) }
        }
    }

    private func smallEvent(_ e: WidgetEvent) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            switch model.state {
            case .soon:
                HStack(spacing: 6) {
                    InkMark()
                    UntilText(date: e.start).font(c.fonts.t13(.bold)).foregroundStyle(c.palette.ink)
                }
                Text(time(e.start)).font(c.fonts.num(30)).monospacedDigit().foregroundStyle(c.palette.ink).padding(.top, 10)
                titleLine(e).padding(.top, 4)
            case .inProgress:
                HStack(spacing: 12) {
                    InkRing(progress: model.progress, diameter: 60, lineWidth: 4)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Now").font(c.fonts.t12()).foregroundStyle(c.palette.a2)
                        titleLine(e)
                    }
                }
                .frame(maxHeight: .infinity)
            default:
                HStack(spacing: 6) {
                    InkMark()
                    HStack(spacing: 3) { Text("Next ·"); UntilText(date: e.start) }
                        .font(c.fonts.t12()).foregroundStyle(c.palette.a2).lineLimit(1)
                }
                titleLine(e).padding(.top, 8)
                Text("\(time(e.start))–\(time(e.end))\(e.location.map { " · \($0)" } ?? "")")
                    .font(c.fonts.t12()).foregroundStyle(c.palette.a2).monospacedDigit().lineLimit(1)
                if let conflict = model.conflict {
                    HStack(spacing: 4) {
                        Image(systemName: "rectangle.on.rectangle").font(.system(size: 10))
                        Text("Overlaps \(conflict.title)").lineLimit(1).titleSensitive(c.showTitles)
                    }.font(c.fonts.t12()).foregroundStyle(c.palette.a2).padding(.top, 2)
                }
                Spacer(minLength: 0)
                if let after = model.after {
                    Rectangle().fill(c.palette.line).frame(height: 1)
                    HStack(spacing: 8) {
                        Text("Then").font(c.fonts.t12()).foregroundStyle(c.palette.a3)
                        Text("\(after.title) \(time(after.start))").font(c.fonts.t12()).foregroundStyle(c.palette.ink).lineLimit(1).titleSensitive(c.showTitles)
                    }.padding(.top, 8)
                }
            }
            if model.state == .soon || model.state == .inProgress { Spacer(minLength: 0) }
            Footer(status: model.status, failed: false)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(NeedtLink.calendar)
    }

    private func titleLine(_ e: WidgetEvent) -> some View {
        Text(e.title).font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).lineLimit(2).titleSensitive(c.showTitles)
    }

    // MARK: medium (lab D4): the afternoon as a strip

    private var medium: some View {
        Group {
            if model.state == .placeholder {
                small
            } else if model.event == nil {
                small
            } else {
                strip
            }
        }
    }

    private var strip: some View {
        let start = c.calendar.dateInterval(of: .hour, for: c.now.addingTimeInterval(-3600))?.start ?? c.now
        let span: TimeInterval = 5 * 3600
        func frac(_ d: Date) -> CGFloat { CGFloat(min(1, max(0, d.timeIntervalSince(start) / span))) }
        let items = [model.event, model.after].compactMap { $0 }
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Afternoon").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                Spacer()
                Text(time(c.now)).font(c.fonts.t12()).foregroundStyle(c.palette.a3).monospacedDigit()
            }
            Spacer(minLength: 0)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Color.clear
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, e in
                        let x0 = frac(e.start) * geo.size.width
                        let w = max(52, (frac(e.end) - frac(e.start)) * geo.size.width)
                        Text(e.title).font(c.fonts.t12(.semibold)).foregroundStyle(c.palette.ink).lineLimit(1).titleSensitive(c.showTitles)
                            .padding(.horizontal, 10)
                            .frame(width: min(w, geo.size.width - x0), alignment: .leading)
                            .frame(maxHeight: .infinity)
                            .inkCard(radius: 10)
                            .overlay(alignment: .topLeading) { if i == 0 { InkMark().offset(x: -6, y: -6) } }
                            .padding(.vertical, 10)
                            .offset(x: x0)
                    }
                    Capsule().fill(c.palette.accent).frame(width: 2).padding(.vertical, 4)
                        .offset(x: frac(c.now) * geo.size.width)
                        .widgetAccentable()
                }
            }
            .frame(height: 72)
            .inkWell()
            HStack {
                ForEach([0, 2, 4, 5], id: \.self) { h in
                    Text(time(start.addingTimeInterval(Double(h) * 3600)))
                    if h != 5 { Spacer() }
                }
            }
            .font(c.fonts.t12()).foregroundStyle(c.palette.a3).monospacedDigit().padding(.top, 6)
            Footer(status: model.status, failed: false)
        }
        .widgetURL(NeedtLink.calendar)
    }

    // MARK: Lock Screen

    private var circular: some View {
        ZStack {
            if let e = model.event, e.start > c.now, !c.isSnapshot {
                ProgressView(timerInterval: c.now...e.start, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.circular)
                Text(timerInterval: c.now...e.start, countsDown: true, showsHours: false)
                    .font(.system(size: 12, weight: .bold)).monospacedDigit().minimumScaleFactor(0.6)
            } else {
                InkRing(progress: model.state == .inProgress ? model.progress : 0.6, diameter: 60, lineWidth: 4)
                Text(model.minutesUntil(now: c.now).map(String.init) ?? "·").font(.system(size: 17, weight: .bold)).monospacedDigit()
            }
        }
        .widgetURL(NeedtLink.calendar)
    }

    @ViewBuilder
    private var rectangular: some View {
        if model.state == .signedOut {
            Text("Sign in to see your day").font(.system(size: 13, weight: .semibold))
        } else if let e = model.event {
            VStack(alignment: .leading, spacing: 1) {
                if locked {
                    Text("Event").font(.system(size: 14, weight: .semibold))
                } else {
                    Text(e.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                }
                Text("\(time(e.start))\(!locked ? (e.location.map { " · \($0)" } ?? "") : "")")
                    .font(.system(size: 13)).foregroundStyle(c.palette.a2).monospacedDigit().lineLimit(1)
                if e.start > c.now { UntilText(date: e.start).font(.system(size: 13)).foregroundStyle(c.palette.a3) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.calendar)
        } else {
            Text("No more events").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var inline: some View {
        if let e = model.event {
            if locked {
                if e.start > c.now { HStack(spacing: 3) { Text("Event"); UntilText(date: e.start) } } else { Text("Event now") }
            } else {
                Text("\(e.title) \(time(e.start))")
            }
        } else {
            Text("No more events")
        }
    }
}
