import NeedtKit
import SwiftUI

struct RimStyle: WidgetStyle {
    var id: StyleID { .rim }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(name: "Urbanist"), display: FontSpec(name: "Urbanist", design: .rounded), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
