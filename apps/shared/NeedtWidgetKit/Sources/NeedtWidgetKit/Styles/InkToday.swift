import NeedtKit
import SwiftUI
import WidgetKit

/// D · Ink, Today: small, medium (standard and tray), large agenda, Mac XL,
/// and the Lock Screen accessories. Every state of pack.html -> States.
struct InkToday: View {
    @Environment(\.needt) private var c
    @Environment(\.dynamicTypeSize) private var type
    @Environment(\.redactionReasons) private var redaction
    var model: TodayModel
    var medium: TodayMediumLayout = .standard

    var body: some View {
        switch c.family {
        case .small: small
        case .medium: mediumView
        case .large: large
        case .extraLarge: extraLarge
        case .circular: circular
        case .rectangular: rectangular
        case .inline: inline
        case .control: EmptyView()
        }
    }

    private var bigType: Bool { type >= .accessibility1 }

    // MARK: states shared by every size

    @ViewBuilder
    private func state<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        switch model.state {
        case .placeholder:
            VStack(alignment: .leading, spacing: 0) {
                PlaceholderBar(width: 56, height: 12)
                VStack(alignment: .leading, spacing: 12) {
                    ForEach([90, 70, 100, 60], id: \.self) { w in
                        HStack(spacing: 8) { PlaceholderBar(width: 16, height: 16); PlaceholderBar(width: CGFloat(w)) }
                    }
                }.padding(.top, 16)
                Spacer(minLength: 0)
            }
        case .signedOut:
            StateCenter(symbol: "person.crop.circle", title: "Sign in to see your day", detail: nil).widgetURL(NeedtLink.signIn)
        case .allDone:
            StateCenter(symbol: "checkmark", title: "All done", detail: "Nothing left for today").widgetURL(NeedtLink.today)
        case .nothingPlanned:
            StateCenter(symbol: "plus", title: "Nothing planned", detail: "Tap to add a task").widgetURL(NeedtLink.quickAdd)
        case .normal:
            content()
        }
    }

    private var metaText: some View {
        Group {
            if model.overdue > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle").font(.system(size: 11, weight: .semibold))
                    Text("\(model.overdue) overdue")
                }
            } else {
                Text("\(model.left) left")
            }
        }
        .font(c.fonts.t12())
        .foregroundStyle(c.palette.a3)
        .monospacedDigit()
        .lineLimit(1)
    }

    private func taskRow(_ r: TodayRow, interactive: Bool) -> some View {
        CheckRow(title: r.title, done: r.done,
                 toggleIntent: interactive ? ToggleTaskIntent(taskId: r.id) : nil)
    }

    private func list(_ rows: [TodayRow], spacing: CGFloat, interactive: Bool) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(rows) { r in
                taskRow(r, interactive: interactive)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .opacity))
            }
        }
        .motion(.easeOut(duration: 0.45), value: rows.map(\.id))
    }

    // MARK: small

    private var small: some View {
        state {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Today").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                    Spacer(minLength: 4)
                    if !bigType { metaText }
                }
                list(model.visibleRows(bigType ? 2 : 4), spacing: 8, interactive: false).padding(.top, 10)
                Spacer(minLength: 0)
                Footer(status: model.status, failed: model.toggleFailed).padding(.top, 4)
            }
            .widgetURL(NeedtLink.today)
        }
    }

    // MARK: medium

    @ViewBuilder
    private var mediumView: some View {
        if medium == .tray && model.state == .normal { tray } else { mediumStandard }
    }

    private var mediumStandard: some View {
        state {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("Today").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                        Spacer(minLength: 4)
                        metaText
                    }
                    list(model.visibleRows(3), spacing: 8, interactive: true).padding(.top, 10)
                    Spacer(minLength: 0)
                    Footer(status: model.status, failed: model.toggleFailed).padding(.top, 4)
                }
                nextCard.frame(width: 118)
            }
        }
    }

    private var nextCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Next event").font(c.fonts.t12()).foregroundStyle(c.palette.a3)
            if let e = model.nextEvent {
                Text(e.title).font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).lineLimit(2).titleSensitive(c.showTitles)
                HStack(spacing: 3) {
                    Text(WidgetClock.hhmm(e.start, calendar: c.calendar))
                    Text("·")
                    UntilText(date: e.start)
                }
                .font(c.fonts.t12()).foregroundStyle(c.palette.a2).monospacedDigit().lineLimit(1)
            } else {
                Text("No more events").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .inkCard()
        .widgetURL(NeedtLink.calendar)
    }

    /// Lab D2: the open tasks as stacked cards beside a count.
    private var tray: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .topLeading) {
                ForEach(Array(model.rows.filter { !$0.done }.prefix(4).enumerated().reversed()), id: \.element.id) { i, r in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(r.time ?? "").font(c.fonts.t12()).foregroundStyle(c.palette.a3).monospacedDigit()
                        Text(r.title).font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).lineLimit(2).titleSensitive(c.showTitles)
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .frame(width: 140, height: 114 - CGFloat(i) * 8, alignment: .topLeading)
                    .inkCard()
                    .rotationEffect(.degrees(Double(i) * 1.2), anchor: .topLeading)
                    .offset(x: CGFloat(i) * 28, y: CGFloat(i) * 4)
                    .zIndex(Double(10 - i))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            VStack(spacing: 4) {
                Text("\(model.left)").font(c.fonts.num(30)).foregroundStyle(c.palette.ink).monospacedDigit()
                Text("left").font(c.fonts.t12()).foregroundStyle(c.palette.a2)
            }
            .frame(width: 76).frame(maxHeight: .infinity)
            .inkCard()
        }
        .widgetURL(NeedtLink.today)
    }

    // MARK: large and Mac XL

    private var agendaHeader: some View {
        HStack {
            Text("\(model.weekday) \(model.dateLabel)").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
            Spacer(minLength: 4)
            Text(headerMeta).font(c.fonts.t12()).foregroundStyle(c.palette.a3).monospacedDigit().lineLimit(1)
        }
    }

    private var headerMeta: String {
        var parts = ["\(model.left) left"]
        if let h = model.freeHours { parts.append("\(h) h free") }
        return parts.joined(separator: " · ")
    }

    private func agendaWindow(_ cap: Int) -> [AgendaLine] {
        let lines = model.agenda
        guard lines.count > cap else { return lines }
        let nowIndex = lines.firstIndex { $0.kind == .now } ?? 0
        let start = min(max(0, nowIndex - 2), lines.count - cap)
        return Array(lines[start..<(start + cap)])
    }

    private func agendaLine(_ l: AgendaLine) -> some View {
        HStack(spacing: 8) {
            Text(l.time).font(c.fonts.t12()).monospacedDigit()
                .foregroundStyle(l.kind == .now ? c.palette.accent : c.palette.a3)
                .frame(width: 38, alignment: .leading)
                .widgetAccentable(l.kind == .now)
            switch l.kind {
            case .now:
                InkMark()
                Rectangle().fill(c.palette.accent.opacity(0.6)).frame(height: 1.5).widgetAccentable()
            case .event:
                Text(l.title).font(c.fonts.t13()).foregroundStyle(c.palette.ink).lineLimit(1).titleSensitive(c.showTitles)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .inkWell(radius: 8)
            case .task:
                InkCheckBox(on: l.done)
                Text(l.title).font(c.fonts.t13()).foregroundStyle(l.done ? c.palette.a3 : c.palette.ink).lineLimit(1).titleSensitive(c.showTitles)
                Spacer(minLength: 0)
            }
        }
        .frame(minHeight: 24)
    }

    private var large: some View {
        state {
            VStack(alignment: .leading, spacing: 0) {
                agendaHeader
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(agendaWindow(bigType ? 5 : 9)) { l in agendaLine(l) }
                }.padding(.top, 12)
                Spacer(minLength: 0)
                Footer(status: model.status, failed: model.toggleFailed).padding(.top, 4)
            }
            .widgetURL(NeedtLink.today)
        }
    }

    private var extraLarge: some View {
        state {
            HStack(alignment: .top, spacing: 18) {
                VStack(alignment: .leading, spacing: 0) {
                    agendaHeader
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(agendaWindow(9)) { l in agendaLine(l) }
                    }.padding(.top, 12)
                    Spacer(minLength: 0)
                    Footer(status: model.status, failed: model.toggleFailed).padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Focus next").font(c.fonts.t12()).foregroundStyle(c.palette.a2)
                    Text(model.focusNext.first?.title ?? "Nothing queued")
                        .font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink).lineLimit(2)
                        .padding(.top, 4).padding(.bottom, 10).titleSensitive(c.showTitles)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(model.focusNext) { r in
                            CheckRow(title: r.minutes.map { "\(r.title) · \(Self.duration($0))" } ?? r.title, done: false,
                                     toggleIntent: ToggleTaskIntent(taskId: r.id))
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .inkCard()
            }
            .widgetURL(NeedtLink.today)
        }
    }

    static func duration(_ minutes: Int) -> String {
        minutes % 60 == 0 && minutes >= 60 ? "\(minutes / 60) h" : minutes > 60 ? "\(minutes / 60) h \(minutes % 60) min" : "\(minutes) min"
    }

    // MARK: Lock Screen accessories

    private var locked: Bool { redaction.contains(.privacy) && !c.showTitles }

    private var nextOpen: TodayRow? { model.rows.first { !$0.done } }
    private var thenOpen: TodayRow? { model.rows.filter { !$0.done }.dropFirst().first }

    private var circular: some View {
        let total = max(1, model.left + model.done)
        return ZStack {
            InkRing(progress: Double(model.done) / Double(total), diameter: 60, lineWidth: 4)
            VStack(spacing: 0) {
                Text("\(model.left)").font(.system(size: 17, weight: .bold)).monospacedDigit()
                Text("left").font(.system(size: 10, weight: .semibold)).foregroundStyle(c.palette.a2)
            }
        }
        .foregroundStyle(c.palette.ink)
        .widgetURL(NeedtLink.today)
    }

    @ViewBuilder
    private var rectangular: some View {
        if model.state == .signedOut {
            Text("Sign in to see your day").font(.system(size: 13, weight: .semibold)).widgetURL(NeedtLink.signIn)
        } else if locked || nextOpen == nil {
            VStack(alignment: .leading, spacing: 1) {
                Text(model.left == 0 ? "All done" : "\(model.left) tasks left").font(.system(size: 14, weight: .semibold))
                if let n = nextOpen { Text(n.time.map { "next at \($0)" } ?? "").font(.system(size: 13)).foregroundStyle(c.palette.a2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.today)
        } else if let n = nextOpen {
            VStack(alignment: .leading, spacing: 1) {
                Text(n.title).font(.system(size: 14, weight: .semibold)).lineLimit(1).titleSensitive(c.showTitles)
                Text([n.time, n.minutes.map(Self.duration)].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13)).foregroundStyle(c.palette.a2).lineLimit(1)
                if let t = thenOpen {
                    Text("then \(t.title) \(t.time ?? "")").font(.system(size: 13)).foregroundStyle(c.palette.a3).lineLimit(1).titleSensitive(c.showTitles)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.task(n.id))
        }
    }

    @ViewBuilder
    private var inline: some View {
        if model.state == .signedOut {
            Text("Sign in to Needt")
        } else if let n = nextOpen {
            Text(locked ? "\(model.left) tasks left" : "Next: \(n.title) \(n.time ?? "")").titleSensitive(c.showTitles)
        } else {
            Text("Nothing left today")
        }
    }
}
