import NeedtKit
import SwiftUI

struct NoirStyle: WidgetStyle {
    var id: StyleID { .noir }
    var fonts: StyleFonts { StyleFonts(body: FontSpec(name: "Bricolage Grotesque"), display: FontSpec(name: "Doto", design: .monospaced), mono: FontSpec(name: "Sometype Mono", design: .monospaced)) }
    func background(_ kind: NeedtWidgetKind, ctx: RenderContext) -> AnyView { AnyView(ctx.palette.bg) }
}
