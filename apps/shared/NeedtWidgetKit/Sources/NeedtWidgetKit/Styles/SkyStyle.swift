import NeedtKit
import SwiftUI

struct SkyStyle: WidgetStyle {
    var id: StyleID { .sky }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .rounded), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
