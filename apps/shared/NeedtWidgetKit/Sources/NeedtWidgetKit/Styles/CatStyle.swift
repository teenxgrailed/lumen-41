import NeedtKit
import SwiftUI

struct CatStyle: WidgetStyle {
    var id: StyleID { .cat }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
