import NeedtKit
import SwiftUI

struct BentoStyle: WidgetStyle {
    var id: StyleID { .bento }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .serif), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
