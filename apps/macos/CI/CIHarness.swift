#if NEEDT_CI
import AppKit
import WebKit

/// CI only: drives the real app (a real WKWebView) on a GitHub macOS runner so
/// WebKit-in-AppKit bugs can be photographed. See
/// `.github/workflows/macos-webview.yml` and `.github/macos-webview/`.
///
/// This file is compiled only into the direct `Needt` target and only when
/// xcodebuild is given `NEEDT_CI_CONDITION=NEEDT_CI`. The release workflows
/// never pass it, so a shipped app has none of this; macos.yml checks the
/// release binary for these flag strings.
///
/// Launch flags:
///   --ci-base-url http://127.0.0.1:3000
///       The web app. Loopback http only, so even this build cannot be aimed
///       at another host.
///   --ci-session-cookie <name=value | @file>
///       A NextAuth session cookie (`next-auth.session-token`) put into
///       `WKWebsiteDataStore.default()` before the main window loads. The real
///       sign-in hands off to the system browser and comes back on a needt://
///       link (AuthFlow.swift), which a runner cannot click through; CI signs
///       in through the web app's credentials endpoint instead and passes the
///       cookie it got.
///   --ci-appearance dark|light
///       NSApp.appearance, for when the runner's system appearance cannot be
///       switched (the page follows it through prefers-color-scheme).
///
/// Commands arrive as distributed notifications named `app.needt.mac.ci`
/// whose object is one string (`needt-ci send <command>`):
///   size:WxH          main window to W x H points, top-left of the screen
///   load:/path        load a page of the web app in the main window
///   navigate:/path    the app's own navigate command (as the menus send it)
///   key:cmd+j         a key event through NSApp (menus, then the page)
///   wheel:N           N wheel events over the page's main scrolling pane
///   probe:/file.json  window facts plus DOM measurements, written as JSON
///   wheelfps:/f.json  animation frames measured while wheeling
///   quit
enum CIHarness {
    static let notificationName = Notification.Name("app.needt.mac.ci")

    private static let arguments = ProcessInfo.processInfo.arguments

    private static func value(after flag: String) -> String? {
        guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else { return nil }
        return arguments[index + 1]
    }

    static let baseURL: URL? = {
        guard let raw = value(after: "--ci-base-url"),
              let url = URL(string: raw),
              url.scheme == "http",
              let host = url.host,
              host == "127.0.0.1" || host == "localhost"
        else { return nil }
        return url
    }()

    static var isActive: Bool { baseURL != nil }

    /// True for the CI web app's own origin.
    static func isBase(host: String?, scheme: String?) -> Bool {
        guard let baseURL, let host, let scheme else { return false }
        return host.lowercased() == baseURL.host?.lowercased() && scheme.lowercased() == baseURL.scheme
    }

    // MARK: launch

    /// Runs before `AppController.start()`: the cookie must be in the store
    /// before the main window's first request.
    @MainActor
    static func prepare(then start: @escaping @MainActor () -> Void) {
        guard let baseURL else {
            start()
            return
        }
        log("base \(baseURL.absoluteString)")
        // The app's appearance when the runner's system one cannot be switched.
        switch value(after: "--ci-appearance") {
        case "dark": NSApp.appearance = NSAppearance(named: .darkAqua)
        case "light": NSApp.appearance = NSAppearance(named: .aqua)
        default: break
        }
        listen()
        markSignedIn()
        guard let cookie = sessionCookie(host: baseURL.host ?? "") else {
            log("no session cookie; the app will show its start window")
            start()
            return
        }
        Task { @MainActor in
            await WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie)
            log("session cookie set (\(cookie.name), \(cookie.value.count) chars)")
            start()
        }
    }

    private static func sessionCookie(host: String) -> HTTPCookie? {
        guard var raw = value(after: "--ci-session-cookie") else { return nil }
        if raw.hasPrefix("@") {
            guard let text = try? String(contentsOfFile: String(raw.dropFirst()), encoding: .utf8) else { return nil }
            raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let equals = raw.firstIndex(of: "=") else { return nil }
        let name = String(raw[..<equals])
        let value = String(raw[raw.index(after: equals)...])
        guard name.hasPrefix("next-auth.session-token"), !value.isEmpty else { return nil }
        return HTTPCookie(properties: [
            .name: name,
            .value: value,
            .domain: host,
            .path: "/",
            .expires: Date().addingTimeInterval(24 * 60 * 60),
        ])
    }

    /// The marker AuthFlow writes after a sign-in, so `start()` opens the main
    /// window instead of the start window.
    private static func markSignedIn() {
        guard let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return }
        let folder = dir.appendingPathComponent("app.needt.mac", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? Data("1".utf8).write(to: folder.appendingPathComponent("signed-in"))
    }

    // MARK: commands

    @MainActor private static var observer: NSObjectProtocol?

    @MainActor
    private static func listen() {
        observer = DistributedNotificationCenter.default().addObserver(
            forName: notificationName, object: nil, queue: .main
        ) { note in
            guard let command = note.object as? String else { return }
            Task { @MainActor in await run(command) }
        }
    }

    @MainActor
    private static func run(_ command: String) async {
        let parts = command.split(separator: ":", maxSplits: 1).map(String.init)
        guard let verb = parts.first else { return }
        let argument = parts.count > 1 ? parts[1] : ""
        log("run \(command)")
        switch verb {
        case "size": resize(argument)
        case "load": load(argument)
        case "navigate": AppController.shared.navigate(argument)
        case "key": key(argument)
        case "wheel": await wheel(count: Int(argument) ?? 12)
        case "probe": await probe(to: argument)
        case "wheelfps": await wheelFPS(to: argument)
        case "quit": NSApp.terminate(nil)
        default: log("unknown command \(command)")
        }
        log("done \(verb)")
    }

    @MainActor
    private static var main: MainWindowController? {
        NSApp.windows.lazy.compactMap { $0.windowController as? MainWindowController }.first
    }

    @MainActor
    private static func focus() {
        guard let main, let window = main.window else { return }
        main.show()
        window.makeFirstResponder(main.web.webView)
    }

    @MainActor
    private static func resize(_ spec: String) {
        let size = spec.lowercased().split(separator: "x").compactMap { Double($0) }
        guard size.count == 2, let main, let window = main.window else {
            log("size: no main window")
            return
        }
        let screen = window.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: size[0], height: size[1])
        let frame = NSRect(x: visible.minX, y: visible.maxY - size[1], width: size[0], height: size[1])
        window.setFrame(frame, display: true, animate: false)
        main.show()
        log("size frame=\(NSStringFromRect(window.frame)) screen=\(NSStringFromRect(screen?.frame ?? .zero)) scale=\(window.backingScaleFactor)")
    }

    @MainActor
    private static func load(_ path: String) {
        guard let main, let baseURL, let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { return }
        main.web.load(url)
        main.show()
    }

    @MainActor
    private static func key(_ spec: String) {
        guard let window = main?.window else { return }
        focus()
        let tokens = spec.lowercased().split(separator: "+", omittingEmptySubsequences: false).map(String.init)
        var flags: NSEvent.ModifierFlags = []
        for token in tokens.dropLast() {
            switch token {
            case "cmd": flags.insert(.command)
            case "shift": flags.insert(.shift)
            case "alt", "opt": flags.insert(.option)
            case "ctrl": flags.insert(.control)
            default: break
            }
        }
        let keys: [String: (code: UInt16, characters: String)] = [
            "j": (38, "j"), "k": (40, "k"), ",": (43, ","), "/": (44, "/"), "escape": (53, "\u{1b}"),
        ]
        guard let name = tokens.last, let entry = keys[name] else {
            log("key: unknown \(spec)")
            return
        }
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            guard let event = NSEvent.keyEvent(
                with: type, location: .zero, modifierFlags: flags,
                timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                context: nil, characters: entry.characters, charactersIgnoringModifiers: entry.characters,
                isARepeat: false, keyCode: entry.code
            ) else { continue }
            NSApp.sendEvent(event)
        }
    }

    /// Wheel events at the middle of the page's tallest scrolling pane, sent
    /// through the window the way AppKit delivers a mouse wheel.
    @MainActor
    private static func wheel(count: Int) async {
        guard let main, let window = main.window else { return }
        focus()
        let webView = main.web.webView
        guard let json = await js(Probe.scrollTarget),
              let target = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any],
              let x = (target["x"] as? NSNumber)?.doubleValue,
              let y = (target["y"] as? NSNumber)?.doubleValue
        else {
            log("wheel: no target")
            return
        }
        let inView = NSPoint(x: x, y: webView.isFlipped ? y : webView.bounds.height - y)
        let inWindow = webView.convert(inView, to: nil)
        let onScreen = window.convertPoint(toScreen: inWindow)
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        let global = CGPoint(x: onScreen.x, y: primaryHeight - onScreen.y)
        for index in 0..<count {
            guard let cg = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -120, wheel2: 0, wheel3: 0) else { break }
            cg.location = global
            cg.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(window.windowNumber))
            cg.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(window.windowNumber))
            guard let event = NSEvent(cgEvent: cg) else { break }
            if index == 0 {
                log("wheel target=\(json) inWindow=\(NSStringFromPoint(inWindow)) event.window=\(event.window?.windowNumber ?? -1) event.locationInWindow=\(NSStringFromPoint(event.locationInWindow))")
            }
            if event.window === window {
                window.sendEvent(event)
            } else if let fallback = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: -120, wheel2: 0, wheel3: 0) {
                // No window on the event: its location is read as window
                // coordinates, so place it there and hand it to the web view.
                fallback.location = CGPoint(x: inWindow.x, y: primaryHeight - inWindow.y)
                if let direct = NSEvent(cgEvent: fallback) {
                    if index == 0 { log("wheel fallback locationInWindow=\(NSStringFromPoint(direct.locationInWindow))") }
                    webView.scrollWheel(with: direct)
                }
            }
            try? await Task.sleep(nanoseconds: 40_000_000)
        }
    }

    // MARK: probes

    @MainActor
    private static func js(_ body: String) async -> String? {
        guard let webView = main?.web.webView else { return nil }
        do {
            return try await webView.callAsyncJavaScript(body, arguments: [:], in: nil, contentWorld: .page) as? String
        } catch {
            log("js error \(error)")
            return nil
        }
    }

    @MainActor
    private static func windowFacts() -> [String: Any] {
        guard let main, let window = main.window else { return ["exists": false] }
        let f = window.frame
        let s = window.screen?.frame ?? .zero
        let w = main.web.webView.frame
        return [
            "exists": true,
            "number": window.windowNumber,
            "frame": [f.minX, f.minY, f.width, f.height],
            "screen": [s.minX, s.minY, s.width, s.height],
            "scale": window.backingScaleFactor,
            "webView": [w.minX, w.minY, w.width, w.height],
            "appearance": window.effectiveAppearance.name.rawValue,
            "isKey": window.isKeyWindow,
            "url": main.web.webView.url?.absoluteString ?? "",
            "occlusionVisible": window.occlusionState.contains(.visible),
        ]
    }

    @MainActor
    private static func write(_ page: String, to path: String) {
        let facts = (try? JSONSerialization.data(withJSONObject: windowFacts())).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        let text = "{\"window\":\(facts),\"page\":\(page)}"
        do {
            try Data(text.utf8).write(to: URL(fileURLWithPath: path), options: .atomic)
        } catch {
            log("write \(path) failed: \(error)")
        }
    }

    @MainActor
    private static func probe(to path: String) async {
        let page = await js(Probe.script) ?? "null"
        write(page, to: path)
    }

    @MainActor
    private static func wheelFPS(to path: String) async {
        async let frames = js(Probe.frames)
        try? await Task.sleep(nanoseconds: 100_000_000)
        await wheel(count: 20)
        let page = await frames ?? "null"
        write(page, to: path)
    }

    static func log(_ message: String) {
        FileHandle.standardError.write(Data("[needt-ci] \(message)\n".utf8))
    }
}

/// The main window in a CI build: AppKit may not shrink it to the screen, so a
/// 2000 x 1300 window stays that size on a smaller runner display.
final class CIUnconstrainedWindow: NSWindow {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        frameRect
    }
}

/// Measurements taken inside the real WKWebView (bodies for
/// `callAsyncJavaScript`). They mirror tests/desktop-swift-shell.spec.ts.
private enum Probe {
    static let scrollTarget = #"""
    const stack = document.querySelector('.shell-app-stack') || document.body;
    let best = null;
    for (const el of Array.from(stack.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const room = el.scrollHeight - el.clientHeight;
      if (room > 40 && (!best || room > best.room)) best = { el, room };
    }
    const target = best ? best.el : stack;
    const r = target.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + Math.min(r.height / 2, 300)),
      room: best ? best.room : 0,
      tag: target.tagName.toLowerCase() + '.' + String(target.className).slice(0, 60),
    });
    """#

    static let frames = #"""
    const t = [];
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => { t.push(now); if (now - start < 2000) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const d = [];
    for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]);
    d.sort((a, b) => a - b);
    const pick = (q) => (d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(d.length * q))] * 10) / 10 : null);
    return JSON.stringify({
      frames: t.length,
      ms: t.length > 1 ? Math.round(t[t.length - 1] - t[0]) : 0,
      p50: pick(0.5), p95: pick(0.95), max: pick(1),
      over50ms: d.filter((x) => x > 50).length,
    });
    """#

    static let script = #"""
    const round = (r) => r ? [r.left, r.top, r.width, r.height].map(Math.round) : null;
    const q = (s) => document.querySelector(s);
    const scope = q('.needt-v3');
    const bar = q('.tab-bar');
    const rail = q('.shell-app-row-2');
    const chain = [scope, scope && scope.querySelector('.app'), q('.shell-app-row'), q('.shell-app-stack')];
    const frame = {
      doc: Math.max(document.scrollingElement ? document.scrollingElement.scrollTop : 0, window.scrollY, document.body.scrollTop),
      chainScrollTop: chain.map((el) => (el ? el.scrollTop : null)),
      scope: round(scope && scope.getBoundingClientRect()),
      topBar: round(bar && bar.getBoundingClientRect()),
      rail: round(rail && rail.getBoundingClientRect()),
    };
    const scrollers = [];
    for (const el of Array.from(document.querySelectorAll('.needt-v3 *'))) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const room = el.scrollHeight - el.clientHeight;
      if (room > 40) scrollers.push({ el: el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 50), room, top: Math.round(el.scrollTop) });
    }
    scrollers.sort((a, b) => b.room - a.room);
    const ghosts = [];
    for (const el of Array.from(document.querySelectorAll('.needt-v3 *'))) {
      if (el.closest('.v3c-anchor') || el.closest('[data-v3-portals]')) continue;
      if (el.childElementCount > 0 || (el.textContent || '').trim()) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.width > 240 || r.height < 30 || r.height > 70) continue;
      if (r.bottom <= 0 || r.top >= innerHeight) continue;
      const painted = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.boxShadow !== 'none';
      if (painted && parseFloat(cs.borderTopLeftRadius) > 4) ghosts.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 60) + ' ' + round(r).join(','));
    }
    let pill = null;
    const btn = q('[data-chat-pill]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      const shade = q('.v3c-shade.is-on');
      const layer = btn.closest('.v3c-layer');
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
      pill = {
        rect: round(r),
        shade: round(shade && shade.getBoundingClientRect()),
        layerOpacity: layer ? Number(getComputedStyle(layer).opacity) : -1,
        onTop: !!hit && (btn === hit || btn.contains(hit)),
        text: (btn.textContent || '').trim(),
      };
    }
    let corner = null;
    const shell = q('.v3c-shell');
    const anchor = q('.v3c-anchor');
    if (shell && anchor) {
      const r = shell.getBoundingClientRect();
      const cs = getComputedStyle(shell);
      const m = /inset\(([\d.]+)px [\d.]+px [\d.]+px ([\d.]+)px/.exec(cs.clipPath);
      const top = m ? Number(m[1]) : 0;
      const left = m ? Number(m[2]) : 0;
      const at = document.elementFromPoint(r.left + 6, r.top + 6);
      corner = {
        clipPath: cs.clipPath,
        shell: round(r),
        visible: [r.width - left, r.height - top].map(Math.round),
        topLeftIsShell: !!at && shell.contains(at),
        anchor: round(anchor.getBoundingClientRect()),
      };
    }
    const panel = q('[data-chat-panel]');
    const skies = [];
    for (const root of Array.from(document.querySelectorAll('.px-sky'))) {
      const rr = root.getBoundingClientRect();
      if (rr.width < 40 || rr.height < 40) continue;
      const cv = root.querySelector('.px-canvas');
      const dv = root.querySelector('.px-dotscreen');
      const distinct = [];
      try {
        const cx = cv && cv.getContext('2d');
        if (cx && cv.width > 1) {
          const d = cx.getImageData(0, 0, cv.width, cv.height).data;
          for (let k = 0; k < 10; k++) {
            const x0 = Math.floor((cv.width * k) / 10), x1 = Math.floor((cv.width * (k + 1)) / 10);
            const seen = new Set();
            for (let y = 0; y < cv.height; y += 2) for (let x = x0; x < x1; x += 2) {
              const o = (y * cv.width + x) * 4;
              seen.add((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
            }
            distinct.push(seen.size);
          }
        }
      } catch (e) { distinct.push(String(e)); }
      skies.push({
        where: (root.closest('[data-v3-screen]') || root).getAttribute('data-v3-screen'),
        root: round(rr),
        canvas: round(cv && cv.getBoundingClientRect()),
        dot: round(dv && dv.getBoundingClientRect()),
        backing: cv && dv ? [cv.width, cv.height, dv.width, dv.height] : null,
        distinct,
      });
    }
    let title = null;
    const t = q('.cn-h1');
    const sub = q('.cn-screen-text-5');
    if (t && sub) {
      const range = document.createRange();
      range.selectNodeContents(t);
      title = {
        title: round(t.getBoundingClientRect()),
        glyphs: round(range.getBoundingClientRect()),
        sub: round(sub.getBoundingClientRect()),
        lineHeight: getComputedStyle(t).lineHeight,
        fontFamily: getComputedStyle(t).fontFamily,
      };
    }
    let session = null;
    try {
      const s = await (await fetch('/api/auth/session', { credentials: 'same-origin' })).json();
      session = s && s.user ? s.user.email : null;
    } catch (e) { session = 'error: ' + e; }
    const html = document.documentElement;
    return JSON.stringify({
      path: location.pathname,
      session,
      desktop: html.getAttribute('data-desktop'),
      shell: html.getAttribute('data-desktop-shell'),
      ui: scope ? scope.getAttribute('data-ui') : null,
      theme: scope ? scope.getAttribute('data-theme') : null,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      viewport: [innerWidth, innerHeight, devicePixelRatio],
      ready: !!(bar && btn),
      frame, scrollers: scrollers.slice(0, 4), ghosts, pill, corner,
      chatPanel: panel ? round(panel.getBoundingClientRect()) : null,
      settingsOpen: !!q('[data-settings-sheet], .settings-sheet, [role="dialog"]'),
      skies, title,
    });
    """#
}
#endif
