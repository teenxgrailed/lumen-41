/* Needt icon registry — react-icons, the library the product already depends on.
 *
 * This file is HOST code, not system code: it satisfies the contract that
 * components/core/Icon.jsx declares. Load it as a module in any static page
 * that renders Needt components:
 *
 *   <script type="module" src="assets/icons/needt-icons.js"></script>
 *
 * In the application, do not load this file — import the icons from
 * `react-icons` directly and either register them the same way at boot or pass
 * them to <Icon glyph={...} />.
 *
 * Collection: react-icons/lu. Swapping to another react-icons collection is a
 * one-line change to the import below plus the name prefixes; every name used
 * across this design system is resolved here, with fallbacks, so a renamed
 * upstream glyph degrades to an empty box instead of a crash.
 */
/* Resolved at runtime, not statically imported: this file is host code for
   static pages, and must stay invisible to any bundler that scans the design
   system's sources. In the application, import from "react-icons/lu" normally. */
const REACT_ICONS = "react-icons@5.5.0";
const COLLECTION = "lu";

/* Wrapped in an async IIFE rather than using top-level await: this file gets
   scanned alongside the system's sources, and a top-level await is a syntax
   error outside a module context. */
/* Fast path: vendor/lucide-local.js (a classic script loaded before this
   module) carries a local snapshot of every glyph picked below. When it is
   present, everything installs synchronously at module evaluation — before
   Babel's async transform renders anything — with no network. The esm.sh
   path stays as a fallback. */
const LOCAL = window.__LU_LOCAL || null;
function run(Lu, Si) {
const pick = (...names) => names.map((n) => Lu[n]).find(Boolean) || null;

/* Brand marks — Google, Apple, GitHub — do not exist as outline glyphs, so the
   sign-in buttons take them from the simple-icons collection. It is the same
   library, a second collection: an account button without its mark is not a
   button anyone trusts. Failure is tolerated: if the collection does not load,
   pickBrand returns null and Icon reserves the box. */
const pickBrand = (...names) => names.map((n) => Si[n]).find(Boolean) || null;

/* Merge, never assign. The design-system bundle carries its own snapshot of
   this registry and assigns window.NeedtIcons outright when its own async
   import resolves; whichever lands last used to win, and the older snapshot
   silently dropped every name added since. Merging — plus a re-install when
   the event fires and our names are gone — makes the race harmless. */
const NAMES = {
  "plus": pick("LuPlus"),
  "minus": pick("LuMinus"),
  "check": pick("LuCheck"),
  "x": pick("LuX"),
  "search": pick("LuSearch"),
  "ellipsis": pick("LuEllipsis", "LuMoreHorizontal"),
  "chevron-down": pick("LuChevronDown"),
  "chevron-left": pick("LuChevronLeft"),
  "chevron-right": pick("LuChevronRight"),
  "arrow-right": pick("LuArrowRight"),
  "arrow-left": pick("LuArrowLeft"),
  "arrow-up-down": pick("LuArrowUpDown", "LuArrowDownUp"),
  "arrow-up-right": pick("LuArrowUpRight"),
  "arrow-down": pick("LuArrowDown"),
  "calendar": pick("LuCalendar"),
  "calendar-days": pick("LuCalendarDays"),
  "calendar-off": pick("LuCalendarOff", "LuCalendarX"),
  "clock": pick("LuClock", "LuClock3"),
  "inbox": pick("LuInbox"),
  "file-text": pick("LuFileText"),
  "folder": pick("LuFolder"),
  "folder-kanban": pick("LuFolderKanban", "LuKanban", "LuFolder"),
  "folder-open": pick("LuFolderOpen", "LuFolder"),
  "layout-template": pick("LuLayoutTemplate", "LuLayoutDashboard"),
  "lock": pick("LuLock"),
  "eye-off": pick("LuEyeOff"),
  "rotate-ccw": pick("LuRotateCcw", "LuRotateCw"),
  "save": pick("LuSave", "LuDownload"),
  "archive": pick("LuArchive"),
  "star": pick("LuStar"),
  "settings": pick("LuSettings"),
  "grip-vertical": pick("LuGripVertical", "LuGrip"),
  "globe": pick("LuGlobe"),
  "type": pick("LuType"),
  "list-checks": pick("LuListChecks", "LuList"),
  "image": pick("LuImage"),
  "pen-line": pick("LuPenLine", "LuPencilLine", "LuPencil"),
  "hash": pick("LuHash"),
  "mail": pick("LuMail"),
  "quote": pick("LuQuote"),
  "user": pick("LuUser"),
  "code": pick("LuCode"),
  "message-circle": pick("LuMessageCircle", "LuMessageSquare"),
  "arrow-up": pick("LuArrowUp"),
  "audio-lines": pick("LuAudioLines", "LuActivity"),
  "circle-check": pick("LuCircleCheck", "LuCheckCircle2"),
  "hourglass": pick("LuHourglass", "LuTimer"),
  "calendar-clock": pick("LuCalendarClock", "LuCalendar"),
  "align-left": pick("LuAlignLeft"),
  "flag": pick("LuFlag"),
  "repeat": pick("LuRepeat", "LuRefreshCw"),
  "users": pick("LuUsers"),
  "sunrise": pick("LuSunrise", "LuSunMedium"),
  "sunset": pick("LuSunset", "LuSunDim"),
  "ban": pick("LuBan", "LuCircleSlash"),
  "keyboard": pick("LuKeyboard"),
  "circle-help": pick("LuCircleHelp", "LuHelpCircle"),
  "log-out": pick("LuLogOut"),
  "circle": pick("LuCircle"),
  "target": pick("LuTarget"),
  "trash-2": pick("LuTrash2", "LuTrash"),
  "copy": pick("LuCopy"),
  "pencil": pick("LuPencil", "LuPen"),
  "external-link": pick("LuExternalLink", "LuSquareArrowOutUpRight"),
  "upload": pick("LuUpload"),
  "eye": pick("LuEye"),
  "unlock": pick("LuLockOpen", "LuUnlock"),
  "sliders-horizontal": pick("LuSlidersHorizontal", "LuSliders"),
  "sparkles": pick("LuSparkles"),
  "palette": pick("LuPalette", "LuSwatchBook"),
  "alert-circle": pick("LuCircleAlert", "LuAlertCircle"),
  "keyboard": pick("LuKeyboard"),
  "bell": pick("LuBell"),
  "command": pick("LuCommand"),
  "database": pick("LuDatabase"),
  "download": pick("LuDownload"),
  "refresh-cw": pick("LuRefreshCw", "LuRotateCw"),
  "unlink": pick("LuUnlink", "LuLink2Off", "LuLinkSlash"),
  "loader": pick("LuLoaderCircle", "LuLoader2", "LuLoader"),
  "list-plus": pick("LuListPlus"),
  "apple": pickBrand("SiApple") || pick("LuApple"),
  "chrome": pickBrand("SiGoogle") || pick("LuChrome"),
  "github": pickBrand("SiGithub") || pick("LuGithub"),
  "wand-sparkles": pick("LuWandSparkles", "LuWand2", "LuWand"),
  "bold": pick("LuBold"),
  "italic": pick("LuItalic"),
  "link": pick("LuLink"),
  "list": pick("LuList"),
  "code": pick("LuCode"),
  "highlighter": pick("LuHighlighter"),
  "strikethrough": pick("LuStrikethrough"),
  "eraser": pick("LuEraser", "LuRemoveFormatting"),
  "message-square": pick("LuMessageSquare", "LuMessageCircle"),
  "layers": pick("LuLayers", "LuLayers2"),
  "corner-down-right": pick("LuCornerDownRight", "LuArrowDownRight"),
  "flame": pick("LuFlame"),
  "home": pick("LuHouse", "LuHome"),
  "calendar-check": pick("LuCalendarCheck", "LuCalendar"),
  "move-right": pick("LuMoveRight", "LuArrowRight"),
  "triangle-alert": pick("LuTriangleAlert", "LuAlertTriangle"),
  "briefcase": pick("LuBriefcase"),
  "component": pick("LuComponent", "LuBox"),
  "graduation-cap": pick("LuGraduationCap", "LuBookOpen"),
  "package": pick("LuPackage", "LuBox"),
  "heart": pick("LuHeart"),
  "map-pin": pick("LuMapPin"),
  "paperclip": pick("LuPaperclip"),
  "tag": pick("LuTag"),
  "bug": pick("LuBug", "LuTriangleAlert"),
  "trending-up": pick("LuTrendingUp", "LuChartLine"),
  "sun": pick("LuSun", "LuSunrise"),
  "house": pick("LuHouse", "LuHome"),
  "heading": pick("LuHeading", "LuHeading1", "LuType"),
  /* ===== Needt pack, 2026-10-06 =============================================
     Names are CONCEPTS, not glyphs: a screen asks for "share", never for
     "arrow-up-right". The concept list was taken from every place Craft puts
     an icon (shell, document panel, inspector, menus, popovers); the drawings
     are Lucide's, at one stroke weight, so the set reads as one hand.
     Alternates after the first name survive Lucide renames. */
  "sidebar-left": pick("LuPanelLeft", "LuSidebar"),
  "sidebar-right": pick("LuPanelRight", "LuSidebarOpen"),
  "share": pick("LuForward", "LuShare2", "LuShare"),
  "bell-dot": pick("LuBellDot", "LuBell"),
  "help": pick("LuCircleHelp", "LuHelpCircle"),
  "new-doc": pick("LuFilePlus2", "LuFilePlus"),
  "docs": pick("LuFiles", "LuCopy"),
  "tasks": pick("LuCircleCheck", "LuCheckCircle"),
  "focus": pick("LuFocus", "LuScanLine", "LuTarget"),
  "connections": pick("LuCloud"),
  "shared": pick("LuUsers"),
  "templates": pick("LuLayoutTemplate", "LuFileStack"),
  "desktop": pick("LuMonitor"),
  "plus-circle": pick("LuCirclePlus", "LuPlusCircle"),
  "plan": pick("LuCrown", "LuGem"),
  "view-grid": pick("LuLayoutGrid", "LuGrid2X2", "LuGrid"),
  "view-cards": pick("LuGalleryVerticalEnd", "LuLayers"),
  "view-list": pick("LuList", "LuAlignJustify"),
  "close-circle": pick("LuCircleX", "LuXCircle"),
  "outline": pick("LuListTree", "LuList"),
  "attachments": pick("LuPaperclip"),
  "react": pick("LuSmilePlus", "LuSmile"),
  "comment": pick("LuMessageSquare"),
  "comment-add": pick("LuMessageSquarePlus", "LuMessageSquare"),
  "assistant": pick("LuSparkles"),
  "expand": pick("LuMaximize2", "LuExpand"),
  "format": pick("LuALargeSmall", "LuType"),
  "style": pick("LuPaintbrush", "LuBrush"),
  "info": pick("LuInfo"),
  "swap": pick("LuArrowLeftRight", "LuRepeat"),
  "cover": pick("LuImage"),
  "scribble": pick("LuSignature", "LuPenLine"),
  "text": pick("LuType"),
  "page": pick("LuFileText"),
  "card": pick("LuPanelTop", "LuSquareStack", "LuLayoutTemplate"),
  "file": pick("LuPaperclip", "LuFile"),
  "image-search": pick("LuImagePlus", "LuImage"),
  "code-block": pick("LuCodeXml", "LuCode2", "LuCode"),
  "formula": pick("LuSigma", "LuRadical"),
  "diagram": pick("LuWorkflow", "LuGitFork"),
  "whiteboard": pick("LuSquarePen", "LuPenSquare", "LuPencil"),
  "table": pick("LuTable2", "LuTable"),
  "gallery": pick("LuLayoutGrid", "LuGrid2X2"),
  "board": pick("LuKanban", "LuColumns3", "LuFolderKanban"),
  "checklist": pick("LuListChecks"),
  "callout": pick("LuMessageSquareQuote", "LuQuote"),
  "toggle": pick("LuListCollapse", "LuChevronRight"),
  "bookmark": pick("LuBookmark"),
  "list-bullets": pick("LuList"),
  "list-numbers": pick("LuListOrdered"),
  "indent": pick("LuIndentIncrease", "LuIndent"),
  "outdent": pick("LuIndentDecrease", "LuOutdent"),
  "align-center": pick("LuAlignCenter", "LuTextAlignCenter"),
  "align-right": pick("LuAlignRight", "LuTextAlignEnd"),
  "align-justify": pick("LuAlignJustify", "LuTextAlignJustify"),
  "mention": pick("LuAtSign"),
  "present": pick("LuPresentation", "LuMonitorPlay"),
  "move-to": pick("LuFolderInput", "LuFolder"),
  "duplicate": pick("LuCopy"),
  "versions": pick("LuHistory", "LuRotateCcw"),
  "delete": pick("LuTrash2", "LuTrash"),
  "created": pick("LuCalendarPlus", "LuCalendar"),
  "updated": pick("LuCalendarClock", "LuClock"),
  "author": pick("LuCircleUser", "LuUserCircle", "LuUser"),
  "open-anything": pick("LuCommand"),
  "to-top": pick("LuArrowUpToLine", "LuArrowUp"),
  "to-bottom": pick("LuArrowDownToLine", "LuArrowDown"),
  "group": pick("LuGroup", "LuLayers"),
  "ungroup": pick("LuUngroup", "LuLayers"),
  "rename": pick("LuTextCursorInput", "LuPencil"),
  "remind": pick("LuBellPlus", "LuBell"),
  "insert-above": pick("LuBetweenHorizontalStart", "LuArrowUp"),
  "insert-below": pick("LuBetweenHorizontalEnd", "LuArrowDown"),
  "copy-link": pick("LuLink2", "LuLink"),
  "sync": pick("LuRefreshCw"),
  "feedback": pick("LuMessageCircleHeart", "LuMessageCircle"),
  "whats-new": pick("LuGift", "LuSparkle", "LuSparkles"),
  "markdown": pick("LuHash"),
  "task": pick("LuCircleCheck", "LuCheckCircle"),
  "task-done": pick("LuCircleCheckBig", "LuCheckCircle2", "LuCircleCheck"),
  "event": pick("LuCalendarDays"),
  "habit": pick("LuFlame"),
  "place": pick("LuCalendarPlus"),
  "unplaced": pick("LuInbox"),
  "agent": pick("LuBot"),
  "ink": pick("LuPenLine", "LuPen"),
  "plan-day": pick("LuWandSparkles", "LuWand2", "LuWand"),
  "focus-session": pick("LuTimer"),
  "source": pick("LuPlug", "LuPlugZap"),
  "reconnect": pick("LuRefreshCcw", "LuRefreshCw"),
  "mcp": pick("LuCable", "LuPlug"),
  "workspace": pick("LuFolderKanban", "LuKanban"),
  "home": pick("LuHouse", "LuHome"),
  "mail-unread": pick("LuMailWarning", "LuMail"),
  "chevrons-up-down": pick("LuChevronsUpDown", "LuChevronDown"),
  "cable": pick("LuCable", "LuPlug"),
  "credit-card": pick("LuCreditCard", "LuWallet"),
  "camera": pick("LuCamera", "LuImage"),
  "reply": pick("LuReply", "LuCornerUpLeft"),
  "reply-all": pick("LuReplyAll", "LuReply"),
  "forward": pick("LuForward", "LuArrowRight"),
  "bell-off": pick("LuBellOff", "LuBell"),
  "square-check": pick("LuSquareCheck", "LuSquareCheckBig", "LuCheckSquare")
};

function install() {
  window.NeedtIcons = Object.assign({}, window.NeedtIcons, NAMES);
  window.dispatchEvent(new Event("needt-icons"));
}
install();
window.addEventListener("needt-icons", function () {
  var m = window.NeedtIcons || {};
  for (var k in NAMES) { if (NAMES[k] && m[k] !== NAMES[k]) { install(); return; } }
});
}

if (LOCAL) {
  run(LOCAL, LOCAL);
} else {
  (async function () {
    const Lu = await import("https://esm.sh/" + REACT_ICONS + "/" + COLLECTION + "?deps=react@18.3.1");
    let Si = {};
    try { Si = await import("https://esm.sh/" + REACT_ICONS + "/si?deps=react@18.3.1"); } catch (e) { Si = {}; }
    run(Lu, Si);
  })();
}
