"""Which sources are compiled into NeedtAppStore, and which of their lines.

Shared by check-appstore-privacy.py. The compiled set is what project.yml says:
Needt/Sources, Island/AppStore, Island/Sources minus the NeedtAppStore
excludes (the extensions and the shared packages are listed separately).
`active_lines` also drops what `#if` leaves out of a Release build with
APPSTORE set (`#if !APPSTORE`, `#if DEBUG`, `#if NEEDT_CI`).

NeedtAppStoreLite (the variant without the island) compiles Needt/Sources only,
with the flags APPSTORE and NO_ISLAND: `lite_sources()` and `set_no_island(True)`.

Run from apps/macos.
"""
import ast
import fnmatch
import os
import re

SOURCE_SUFFIXES = (".swift", ".mm", ".m", ".h", ".cpp", ".hpp")

# True while reading the sources of NeedtAppStoreLite (flag NO_ISLAND is set).
NO_ISLAND = False


def set_no_island(value):
    global NO_ISLAND
    NO_ISLAND = value


def store_excludes():
    """The `excludes:` of the Island/Sources entry under the NeedtAppStore target."""
    text = open("project.yml").read()
    # The target, not the scheme of the same name (both are "  NeedtAppStore:").
    start = text.index("\n  NeedtAppStore:\n    type: application")
    end = text.index('\n  # "Add to Needt"', start)
    block = text[start:end]
    tail = block[block.index("- path: Island/Sources"):]
    out, in_ex = [], False
    for line in tail.splitlines()[1:]:
        stripped = line.strip()
        if stripped.startswith("excludes:"):
            in_ex = True
            continue
        if in_ex:
            if stripped.startswith("- path:"):
                break
            if stripped.startswith("- "):
                out.append(stripped[2:].strip().strip('"'))
    return out


def excluded(rel, patterns):
    for pat in patterns:
        if pat.endswith("/**"):
            if rel.startswith(pat[:-2]):
                return True
        elif fnmatch.fnmatch(rel, pat):
            return True
    return False


def walk(base, patterns=()):
    for dirpath, _, files in os.walk(base):
        for name in sorted(files):
            if not name.endswith(SOURCE_SUFFIXES):
                continue
            full = os.path.join(dirpath, name)
            if not excluded(os.path.relpath(full, base), patterns):
                yield full


def app_sources():
    """Files compiled into the NeedtAppStore app target."""
    patterns = store_excludes()
    files = []
    for base in ("Needt/Sources", "Island/AppStore"):
        files += sorted(walk(base))
    files += sorted(walk("Island/Sources", patterns))
    return files


def lite_sources():
    """Files compiled into the NeedtAppStoreLite app target: Needt/Sources, nothing from Island/."""
    return sorted(walk("Needt/Sources"))


def lite_target_paths():
    """The `path:` entries of the NeedtAppStoreLite target's `sources:` in project.yml."""
    text = open("project.yml").read()
    start = text.index("\n  NeedtAppStoreLite:\n    type: application")
    end = text.index("\n    dependencies:", start)
    return [line.split("path:", 1)[1].strip() for line in text[start:end].splitlines() if "- path:" in line]


def island_sources():
    return [f for f in app_sources() if f.startswith("Island/Sources/")]


def extension_sources(name):
    """Sources of an extension plus the shared packages it links."""
    return sorted(walk(name)) + sorted(walk("../shared/NeedtKit/Sources")) + (
        sorted(walk("../shared/NeedtWidgetKit/Sources")) if name == "Widgets/Sources" else []
    )


def _condition(expr):
    c = expr.strip()
    c = re.sub(r"canImport\([^)]*\)|os\([^)]*\)|arch\([^)]*\)", "True", c)
    for name, value in (("APPSTORE", "True"), ("DEBUG", "False"), ("NEEDT_CI", "False"),
                        ("NO_ISLAND", "True" if NO_ISLAND else "False")):
        c = re.sub(r"\b" + name + r"\b", value, c)
    c = c.replace("&&", " and ").replace("||", " or ")
    c = re.sub(r"!(?!=)", " not ", c)
    try:
        return _truth(ast.parse(c.strip(), mode="eval").body)
    except (SyntaxError, ValueError):
        return True  # a condition this does not understand counts as compiled


def _truth(node):
    """Evaluate only `True`, `False`, `not`, `and`, `or` and parentheses."""
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
        return not _truth(node.operand)
    if isinstance(node, ast.BoolOp):
        values = [_truth(v) for v in node.values]
        return all(values) if isinstance(node.op, ast.And) else any(values)
    raise ValueError("unsupported condition")


def active_lines(path):
    """(line number, text) of the lines a Release build with APPSTORE compiles."""
    stack = []  # (taken_by_an_earlier_branch, this_branch_is_active)
    out = []
    for number, line in enumerate(open(path, errors="ignore"), 1):
        s = line.strip()
        if s.startswith("#if "):
            value = _condition(s[4:])
            stack.append((value, value))
            continue
        if s.startswith("#elseif "):
            taken, _ = stack.pop()
            value = (not taken) and _condition(s[8:])
            stack.append((taken or value, value))
            continue
        if s == "#else":
            taken, _ = stack.pop()
            stack.append((True, not taken))
            continue
        if s == "#endif":
            stack.pop()
            continue
        if all(active for _, active in stack):
            out.append((number, line.rstrip("\n")))
    return out
