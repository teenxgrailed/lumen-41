import NeedtKit
import SwiftUI

struct MistStyle: WidgetStyle {
    var id: StyleID { .mist }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(name: "Fraunces", design: .serif, italic: true), display: FontSpec(name: "Unbounded", design: .rounded), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
