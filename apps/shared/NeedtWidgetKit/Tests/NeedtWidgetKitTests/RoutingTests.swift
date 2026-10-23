import Foundation
import NeedtKit
import SwiftUI
import Testing
import WidgetKit
@testable import NeedtWidgetKit

@Suite struct RoutingTests {
    @Test func eightStylesAndInkIsTheDefault() {
        #expect(StyleID.allCases.count == 8)
        #expect(WidgetChoices().style == .ink)
        #expect(WidgetChoices().showTitlesOnLockScreen == false)
        #expect(StyleChoice.allCases.map(\.id) == StyleID.allCases)
    }

    @Test func aStyleOwnLookIsFullColourSmallOrMediumOnly() {
        #expect(StyleRegistry.allowsStyled(RenderContext(family: .small)))
        #expect(StyleRegistry.allowsStyled(RenderContext(family: .medium)))
        #expect(!StyleRegistry.allowsStyled(RenderContext(family: .large)))
        #expect(!StyleRegistry.allowsStyled(RenderContext(family: .extraLarge)))
        #expect(!StyleRegistry.allowsStyled(RenderContext(family: .rectangular)))
        // Tinted, clear and Lock Screen (vibrant) always fall back to Ink.
        #expect(!StyleRegistry.allowsStyled(RenderContext(mode: .accented, family: .small)))
        #expect(!StyleRegistry.allowsStyled(RenderContext(mode: .vibrant, family: .medium)))
    }

    @Test func everyStyleHasItsOwnFontsAndEveryKindABackground() {
        for id in StyleID.allCases {
            let style = StyleRegistry.style(id)
            #expect(style.id == id)
            for kind in NeedtWidgetKind.allCases {
                _ = style.background(kind, ctx: RenderContext(family: .small))
            }
        }
    }

    @Test func vibrantUsesOpaqueGreysAndAccentedKeepsAlpha() {
        let vibrant = InkPalette.make(scheme: .dark, mode: .vibrant)
        #expect(vibrant.isMonochrome)
        #expect(vibrant.a2 == Color(rgb: 0xC9C9D0))
        #expect(vibrant.a3 == Color(rgb: 0x9C9CA6))
        let accented = InkPalette.make(scheme: .dark, mode: .accented)
        #expect(accented.isMonochrome)
        #expect(accented.ink == .white)
        let light = InkPalette.make(scheme: .light, mode: .fullColor)
        #expect(!light.isMonochrome)
        #expect(light.accent == InkPalette.accentLight)
    }

    @Test func familySizesAreThe393Class() {
        #expect(NeedtFamily.small.size == CGSize(width: 158, height: 158))
        #expect(NeedtFamily.medium.size == CGSize(width: 338, height: 158))
        #expect(NeedtFamily.large.size == CGSize(width: 338, height: 354))
        #expect(NeedtFamily.circular.size == CGSize(width: 72, height: 72))
        #expect(NeedtFamily.rectangular.size == CGSize(width: 160, height: 72))
        #expect(NeedtFamily.inline.size == CGSize(width: 234, height: 26))
    }

    @Test func theCatPawPivotAndPerEntryFrame() {
        #expect(CatPaw.pivot == UnitPoint(x: 0.857, y: 0.609))
        let rest = CatPaw.angle(at: Date(timeIntervalSince1970: 0), running: false)
        #expect(rest == CatPaw.angle(at: Date(timeIntervalSince1970: 3600), running: false))
        let a = CatPaw.angle(at: Date(timeIntervalSince1970: 0), running: true)
        let b = CatPaw.angle(at: Date(timeIntervalSince1970: 60), running: true)
        #expect(a != b)
    }

    @Test func hexColoursParse() {
        #expect(RGB(hex: "#5b4ee6", fallback: 0).r > 0.3)
        #expect(RGB(hex: "nope", fallback: 0xFFFFFF) == RGB(0xFFFFFF))
        #expect(Color(hex: "#zzzzzz") == nil)
    }
}
