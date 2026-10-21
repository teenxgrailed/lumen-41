import NeedtKit
import SwiftUI

struct PixelStyle: WidgetStyle {
    var id: StyleID { .pixel }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(), display: FontSpec(design: .monospaced), mono: FontSpec(design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
