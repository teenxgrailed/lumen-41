// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)
// Copied omelette starter. Re-running copy_starter_component with this kind overwrites this file with the latest version (page content is unaffected).

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({ dark = false, time = '9:41' }) {
  const c = dark ? window.cssVar('--color-white') : window.cssVar('--color-black');
  return (
    <div className="iosf-status-bar-1">
      <div className="iosf-status-bar-2">
        <span className="iosf-status-bar-3" style={{ color: c }}>{time}</span>
      </div>
      <div className="iosf-status-bar-4">
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c}/>
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c}/>
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c}/>
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c}/>
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill={c}/>
          <path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill={c}/>
          <circle cx="8.5" cy="10.5" r="1.5" fill={c}/>
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none"/>
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c}/>
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4"/>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({ children, dark = false, style = {} }) {
  return (
    <div className="iosf-glass-pill-1" style={{ boxShadow: dark
        ? '0 2px 6px var(--black-a35), 0 6px 16px var(--black-a20)'
        : '0 1px 3px var(--black-a7), 0 3px 10px var(--black-a6)', ...style }}>
      {/* blur + tint */}
      <div className="iosf-glass-pill-2" style={{ background: dark ? 'var(--ios-fill-dark)' : 'var(--white-a50)' }} />
      {/* shine */}
      <div className="iosf-glass-pill-3" style={{ boxShadow: dark
          ? 'inset 1.5px 1.5px 1px var(--white-a15), inset -1px -1px 1px var(--white-a8)'
          : 'inset 1.5px 1.5px 1px var(--white-a70), inset -1px -1px 1px var(--white-a40)', border: dark ? '0.5px solid var(--white-a15)' : '0.5px solid var(--black-a6)' }} />
      <div className="iosf-glass-pill-4">
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({ title = 'Title', dark = false, trailingIcon = true }) {
  const muted = dark ? window.cssVar('--white-a60') : window.cssVar('--ios-muted');
  const text = dark ? 'var(--color-white)' : 'var(--color-black)';
  const pillIcon = (content) => (
    <IOSGlassPill dark={dark}>
      <div className="iosf-pill-icon-1">
        {content}
      </div>
    </IOSGlassPill>
  );
  return (
    <div className="iosf-nav-bar-1">
      <div className="iosf-nav-bar-2">
        {/* back chevron */}
        {pillIcon(
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" className="iosf-nav-bar-3">
            <path d="M10 2L2 10l8 8" stroke={muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {/* trailing ellipsis */}
        {trailingIcon && pillIcon(
          <svg width="22" height="6" viewBox="0 0 22 6">
            <circle cx="3" cy="3" r="2.5" fill={muted}/>
            <circle cx="11" cy="3" r="2.5" fill={muted}/>
            <circle cx="19" cy="3" r="2.5" fill={muted}/>
          </svg>
        )}
      </div>
      {/* large title */}
      <div className="iosf-nav-bar-4" style={{ color: text }}>{title}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children, width = 402, height = 874, dark = false,
  title, keyboard = false,
}) {
  return (
    // data-om-starter: inert presence marker — Claude Design's starter-usage
    // probe reads it; it renders nothing. Keep it on this root element.
    <div data-om-starter="ios-frame" className="iosf-device-1" style={{ width, height, background: dark ? 'var(--color-black)' : 'var(--ios-grouped-bg)' }}>
      {/* dynamic island */}
      <div className="iosf-device-2" />
      {/* status bar (absolute) */}
      <div className="iosf-device-3">
        <IOSStatusBar dark={dark} />
      </div>
      {/* nav + content */}
      <div className="iosf-device-4">
        {title !== undefined && <IOSNavBar title={title} dark={dark} />}
        <div className="iosf-device-5">{children}</div>
        {keyboard && <IOSKeyboard dark={dark} />}
      </div>
      {/* home indicator — always on top */}
      <div className="iosf-device-6">
        <div className="iosf-device-7" style={{ background: dark ? 'var(--white-a70)' : 'var(--black-a25)' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({ dark = false }) {
  const glyph = dark ? window.cssVar('--white-a70') : window.cssVar('--ios-key-glyph');
  const sugg = dark ? 'var(--white-a60)' : 'var(--ios-key-suggestion)';
  const keyBg = dark ? 'var(--white-a22)' : 'var(--white-a85)';

  // special-key icons
  const icons = {
    shift: <svg width="19" height="17" viewBox="0 0 19 17"><path d="M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z" fill={glyph}/></svg>,
    del: <svg width="23" height="17" viewBox="0 0 23 17"><path d="M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z" fill="none" stroke={glyph} strokeWidth="1.6" strokeLinejoin="round"/><path d="M10 5l7 7M17 5l-7 7" stroke={glyph} strokeWidth="1.6" strokeLinecap="round"/></svg>,
    ret: <svg width="20" height="14" viewBox="0 0 20 14"><path d="M18 1v6H4m0 0l4-4M4 7l4 4" fill="none" stroke={window.cssVar('--color-white')} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  };

  const key = (content, { w, flex, ret, fs = 25, k } = {}) => (
    <div key={k} className="iosf-key-1" style={{ flex: flex ? 1 : undefined, width: w, background: ret ? 'var(--ios-blue)' : keyBg, fontFamily: '-apple-system, "SF Compact", system-ui', fontSize: fs, fontWeight: 458, color: ret ? 'var(--color-white)' : glyph }}>{content}</div>
  );

  const row = (keys, pad = 0) => (
    <div className="iosf-row-1" style={{ padding: `0 ${pad}px` }}>
      {keys.map(l => key(l, { flex: true, k: l }))}
    </div>
  );

  return (
    <div className="iosf-keyboard-1" style={{ boxShadow: dark
        ? '0 -2px 20px var(--black-a9)'
        : '0 -1px 6px var(--black-a1_8), 0 -3px 20px var(--black-a1_2)' }}>
      {/* liquid glass bg — same recipe as nav pills */}
      <div className="iosf-keyboard-2" style={{ background: dark ? 'var(--ios-fill-dark-2)' : 'var(--white-a25)' }} />
      <div className="iosf-keyboard-3" style={{ boxShadow: dark
          ? 'inset 1.5px 1.5px 1px var(--white-a15)'
          : 'inset 1.5px 1.5px 1px var(--white-a70), inset -1px -1px 1px var(--white-a40)', border: dark ? '0.5px solid var(--white-a15)' : '0.5px solid var(--black-a6)' }} />

      {/* autocorrect bar */}
      <div className="iosf-keyboard-4">
        {['"The"', 'the', 'to'].map((w, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="iosf-keyboard-5" />}
            <div className="iosf-keyboard-6" style={{ color: sugg }}>{w}</div>
          </React.Fragment>
        ))}
      </div>

      {/* key layout */}
      <div className="iosf-keyboard-7">
        {row(['q','w','e','r','t','y','u','i','o','p'])}
        {row(['a','s','d','f','g','h','j','k','l'], 20)}
        <div className="iosf-keyboard-8">
          {key(icons.shift, { w: 45, k: 'shift' })}
          <div className="iosf-keyboard-9">
            {['z','x','c','v','b','n','m'].map(l => key(l, { flex: true, k: l }))}
          </div>
          {key(icons.del, { w: 45, k: 'del' })}
        </div>
        <div className="iosf-keyboard-10">
          {key('ABC', { w: 92.25, fs: 18, k: 'abc' })}
          {key('', { flex: true, k: 'space' })}
          {key(icons.ret, { w: 92.25, ret: true, k: 'ret' })}
        </div>
      </div>

      {/* bottom spacer (emoji+mic area, icons omitted) */}
      <div className="iosf-keyboard-11" />
    </div>
  );
}

Object.assign(window, {
  IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSKeyboard,
});
