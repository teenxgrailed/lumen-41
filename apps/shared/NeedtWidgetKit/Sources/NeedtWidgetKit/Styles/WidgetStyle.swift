import NeedtKit
import SwiftUI
import WidgetKit

public enum NeedtWidgetKind: String, CaseIterable, Sendable {
    case today, next, focus, habits, quickAdd
}

/// One of the eight looks. A style draws the layouts the lab has for it
/// (small and medium of each widget); returning nil means "use the D · Ink
/// layout with this style's fonts", which is also what every style does in
/// tinted, clear and Lock Screen modes. Photos, skies and gradients only ever
/// appear in `.fullColor`, and only inside `background` and the styled views.
public protocol WidgetStyle: Sendable {
    var id: StyleID { get }
    var fonts: StyleFonts { get }

    /// The one removable container background (never a drawn panel).
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView

    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView?
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView?
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView?
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView?
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView?
}

public extension WidgetStyle {
    func today(_ model: TodayModel, ctx: RenderContext) -> AnyView? { nil }
    func next(_ model: NextModel, ctx: RenderContext) -> AnyView? { nil }
    func focus(_ model: FocusModel, ctx: RenderContext) -> AnyView? { nil }
    func habits(_ model: HabitsModel, ctx: RenderContext) -> AnyView? { nil }
    func quickAdd(_ model: QuickAddModel, ctx: RenderContext) -> AnyView? { nil }
}

/// What a widget draws: the content, its background, and the context the
/// content must be given through the environment.
public struct Rendered {
    public var content: AnyView
    public var background: AnyView
    public var context: RenderContext
}

public enum StyleRegistry {
    public static func style(_ id: StyleID) -> any WidgetStyle {
        switch id {
        case .ink: return InkStyle()
        case .sky: return SkyStyle()
        case .pixel: return PixelStyle()
        case .bento: return BentoStyle()
        case .cat: return CatStyle()
        case .noir: return NoirStyle()
        case .mist: return MistStyle()
        case .rim: return RimStyle()
        }
    }

    /// True when `ctx` allows a style's own look: full colour, and a size the
    /// lab designed (small or medium).
    static func allowsStyled(_ ctx: RenderContext) -> Bool {
        ctx.isFullColor && (ctx.family == .small || ctx.family == .medium)
    }

    static func inkBackground(_ ctx: RenderContext) -> AnyView {
        AnyView(ctx.palette.bg)
    }

    // MARK: routing

    private static func ctx(_ base: RenderContext, _ style: any WidgetStyle) -> RenderContext {
        var c = base
        c.fonts = style.fonts
        return c
    }

    public static func today(_ model: TodayModel, choices: WidgetChoices, context: RenderContext) -> Rendered {
        let style = style(choices.style)
        let c = ctx(context, style)
        if choices.style != .ink, allowsStyled(c), model.state == .normal, let v = style.today(model, ctx: c) {
            return Rendered(content: v, background: style.background(.today, ctx: c), context: c)
        }
        return Rendered(content: AnyView(InkToday(model: model, medium: choices.todayMedium)), background: inkBackground(c), context: c)
    }

    public static func next(_ model: NextModel, choices: WidgetChoices, context: RenderContext) -> Rendered {
        let style = style(choices.style)
        let c = ctx(context, style)
        let data = [.upcoming, .soon, .inProgress].contains(model.state)
        if choices.style != .ink, allowsStyled(c), data, let v = style.next(model, ctx: c) {
            return Rendered(content: v, background: style.background(.next, ctx: c), context: c)
        }
        return Rendered(content: AnyView(InkNext(model: model)), background: inkBackground(c), context: c)
    }

    public static func focus(_ model: FocusModel, choices: WidgetChoices, context: RenderContext) -> Rendered {
        let style = style(choices.style)
        let c = ctx(context, style)
        let data = [.running, .paused].contains(model.state)
        if choices.style != .ink, allowsStyled(c), data, let v = style.focus(model, ctx: c) {
            return Rendered(content: v, background: style.background(.focus, ctx: c), context: c)
        }
        return Rendered(content: AnyView(InkFocus(model: model)), background: inkBackground(c), context: c)
    }

    public static func habits(_ model: HabitsModel, choices: WidgetChoices, context: RenderContext) -> Rendered {
        let style = style(choices.style)
        let c = ctx(context, style)
        let data = [.noneLogged, .partial, .atRisk, .allDone].contains(model.state)
        if choices.style != .ink, allowsStyled(c), data, choices.habitsMedium == .today, let v = style.habits(model, ctx: c) {
            return Rendered(content: v, background: style.background(.habits, ctx: c), context: c)
        }
        return Rendered(content: AnyView(InkHabits(model: model, medium: choices.habitsMedium)), background: inkBackground(c), context: c)
    }

    public static func quickAdd(_ model: QuickAddModel, choices: WidgetChoices, context: RenderContext) -> Rendered {
        let style = style(choices.style)
        let c = ctx(context, style)
        if choices.style != .ink, allowsStyled(c), model.state == .ready, choices.quickAdd == .open, let v = style.quickAdd(model, ctx: c) {
            return Rendered(content: v, background: style.background(.quickAdd, ctx: c), context: c)
        }
        return Rendered(content: AnyView(InkQuickAdd(model: model, layout: choices.quickAdd)), background: inkBackground(c), context: c)
    }
}

/// D · Ink: the default, and the layout every other style falls back to.
struct InkStyle: WidgetStyle {
    var id: StyleID { .ink }
    var fonts: StyleFonts { .ink }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
