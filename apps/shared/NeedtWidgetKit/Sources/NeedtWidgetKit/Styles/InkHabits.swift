import NeedtKit
import SwiftUI
import WidgetKit

/// D · Ink, Habits: small list, medium cards (Free 3, Pro 4+) or four weeks of
/// check-ins, accessories. Free shows at most 3 habits (owner decision
/// 2026-10-10); the model already cuts the list.
struct InkHabits: View {
    @Environment(\.needt) private var c
    @Environment(\.redactionReasons) private var redaction
    var model: HabitsModel
    var medium: HabitsMediumLayout = .today

    var body: some View {
        switch c.family {
        case .medium: mediumView
        case .circular: circular
        case .rectangular: rectangular
        default: small
        }
    }

    private var locked: Bool { redaction.contains(.privacy) && !c.showTitles }

    // MARK: states

    @ViewBuilder
    private func state<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        switch model.state {
        case .placeholder:
            VStack(alignment: .leading, spacing: 12) {
                PlaceholderBar(width: 56, height: 12)
                ForEach([90, 70, 100], id: \.self) { w in
                    HStack(spacing: 8) { PlaceholderBar(width: 16, height: 16); PlaceholderBar(width: CGFloat(w)) }
                }
                Spacer(minLength: 0)
            }
        case .signedOut:
            StateCenter(symbol: "person.crop.circle", title: "Sign in to see your habits", detail: nil).widgetURL(NeedtLink.signIn)
        case .noHabits:
            StateCenter(symbol: "plus", title: "Add your first habit", detail: "Tap to create").widgetURL(NeedtLink.habits)
        case .allDone:
            StateCenter(symbol: "checkmark", title: "All \(model.total) habits done",
                        detail: model.bestStreakTitle.map { "\($0) \(model.bestStreak) days" }).widgetURL(NeedtLink.habits)
        case .noneLogged, .partial, .atRisk:
            content()
        }
    }

    private var meta: some View {
        Group {
            if model.state == .atRisk, let h = model.riskHabit {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill").font(.system(size: 11))
                    Text("\(h.streak) d")
                }
            } else {
                Text("\(model.done) / \(model.total)")
            }
        }
        .font(c.fonts.t12()).foregroundStyle(c.palette.a3).monospacedDigit().lineLimit(1)
    }

    private func rowTitle(_ h: WidgetHabit) -> String {
        model.state == .atRisk && h.id == model.riskHabit?.id ? "\(h.title) · log by 23:59" : h.title
    }

    // MARK: small

    private var small: some View {
        state {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Habits").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                    Spacer(minLength: 4)
                    meta
                }
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(model.habits.prefix(3)) { h in
                        CheckRow(title: rowTitle(h), done: h.doneToday, habitIntent: ToggleHabitIntent(habitId: h.id),
                                 trailing: model.state == .atRisk ? nil : (h.streak > 0 ? "\(h.streak)" : nil))
                    }
                }
                Footer(status: model.status, failed: false).padding(.top, 4)
            }
            .widgetURL(NeedtLink.habits)
        }
    }

    // MARK: medium

    @ViewBuilder
    private var mediumView: some View {
        if medium == .history { history } else { cards }
    }

    private var cards: some View {
        state {
            let n = model.habits.count
            let pro = model.plan == .pro && n > 3
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Habits").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                    Spacer(minLength: 4)
                    Text(model.plan == .free ? "Free · 3" : "\(model.habits.count) today")
                        .font(c.fonts.t12()).foregroundStyle(c.palette.a3)
                }
                Spacer(minLength: 0)
                HStack(spacing: pro ? 8 : 10) {
                    ForEach(model.habits.prefix(5)) { h in
                        VStack(alignment: .leading, spacing: 8) {
                            CheckRow(title: "", done: h.doneToday, habitIntent: ToggleHabitIntent(habitId: h.id)).frame(height: 16)
                            Text(h.title).font(pro ? c.fonts.t12(.semibold) : c.fonts.t13(.semibold))
                                .foregroundStyle(c.palette.ink).lineLimit(2).titleSensitive(c.showTitles)
                            Spacer(minLength: 0)
                        }
                        .padding(pro ? 8 : 10)
                        .frame(maxWidth: .infinity, minHeight: 74, maxHeight: 74, alignment: .topLeading)
                        .inkCard(radius: 14)
                    }
                }
                Footer(status: model.status, failed: false).padding(.top, 4)
            }
            .widgetURL(NeedtLink.habits)
        }
    }

    /// Lab D8: four weeks, one row per habit, today ringed in the accent.
    private var history: some View {
        state {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Last 4 weeks").font(c.fonts.t13(.semibold)).foregroundStyle(c.palette.ink)
                    Spacer(minLength: 4)
                    Text(model.plan == .free ? "Free shows 3 habits" : "\(model.habits.count) habits")
                        .font(c.fonts.t12()).foregroundStyle(c.palette.a3)
                }
                Spacer(minLength: 0)
                VStack(spacing: 6) {
                    ForEach(model.habits.prefix(4)) { h in
                        HStack(spacing: 8) {
                            Text(h.title).font(c.fonts.t12()).foregroundStyle(c.palette.ink).lineLimit(1)
                                .frame(width: 86, alignment: .leading).titleSensitive(c.showTitles)
                            HStack(spacing: 2) {
                                ForEach(Array(paddedHistory(h).enumerated()), id: \.offset) { i, on in
                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .fill(on ? c.palette.ink.opacity(0.55) : c.palette.well)
                                        .frame(height: 12)
                                        .overlay {
                                            if i == 27 {
                                                RoundedRectangle(cornerRadius: 2, style: .continuous)
                                                    .strokeBorder(c.palette.accent, lineWidth: 1.5).widgetAccentable()
                                            }
                                        }
                                }
                            }
                        }
                    }
                }
                Footer(status: model.status, failed: false).padding(.top, 4)
            }
            .widgetURL(NeedtLink.habits)
        }
    }

    private func paddedHistory(_ h: WidgetHabit) -> [Bool] {
        let pad = max(0, 28 - h.history.count)
        return Array(repeating: false, count: pad) + h.history.suffix(28)
    }

    // MARK: Lock Screen

    private var circular: some View {
        ZStack {
            InkRing(progress: model.total == 0 ? 0 : Double(model.done) / Double(model.total), diameter: 60, lineWidth: 4)
            VStack(spacing: 0) {
                Text("\(model.done)/\(model.total)").font(.system(size: 14, weight: .bold)).monospacedDigit()
                Text("habits").font(.system(size: 9, weight: .semibold)).foregroundStyle(c.palette.a2)
            }
        }
        .widgetURL(NeedtLink.habits)
    }

    @ViewBuilder
    private var rectangular: some View {
        if model.state == .signedOut {
            Text("Sign in to see your habits").font(.system(size: 13, weight: .semibold))
        } else {
            VStack(alignment: .leading, spacing: 3) {
                Text("Habits \(model.done)/\(model.total)").font(.system(size: 14, weight: .semibold))
                HStack(spacing: 6) {
                    ForEach(model.habits.prefix(5)) { h in
                        Circle().strokeBorder(c.palette.ink, lineWidth: 1.5)
                            .background(Circle().fill(h.doneToday ? c.palette.ink : Color.clear))
                            .frame(width: 12, height: 12)
                    }
                }
                if let h = model.riskHabit, !locked {
                    Text("\(h.title) · streak \(h.streak)").font(.system(size: 13)).foregroundStyle(c.palette.a2).lineLimit(1)
                } else if model.bestStreak > 0 {
                    Text("Best streak \(model.bestStreak) days").font(.system(size: 13)).foregroundStyle(c.palette.a2).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(NeedtLink.habits)
        }
    }
}
