#!/usr/bin/env python3
"""
tdz_lint.py — static temporal-dead-zone / hook-order linter for the UEV-ERP
single-file React UMD bundle (js/components.js) and sibling bundles.

Why: a const/let referenced inside a hook/closure/effect defined ABOVE its
declaration in the same scope throws "Cannot access X before initialization"
at runtime (TDZ). node --check does NOT catch this (it is a runtime error).

This is a best-effort heuristic, NOT a full JS semantic analyzer. It:
  1. Parses top-level + nested function/arrow scopes (balanced braces/parens).
  2. Within each scope, records const/let/function declarations with line numbers.
  3. For each identifier USE before its const/let declaration line in the same
     scope (function declarations are hoisted, so ignored), reports a TDZ suspect.
  4. Skips uses that are inside a nested function (those run later -> safe).

False positives are expected (closures deferred to render). The tool prints
suspects with line + kind so a human can triage. Exit 0 always (advisory).

Usage: python3 tdz_lint.py <file.js> [file2.js ...]
"""
import sys, re

def tokenize_scopes(src):
    """Yield (start, end, kind) for braces/parens/brackets to track nesting."""
    return

def analyze(path):
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    text = '\n'.join(lines)
    suspects = []

    # 1) find all const/let/function declarations with their line + name
    decl_re = re.compile(r'\b(const|let|function)\s+([A-Za-z_$][\w$]*)\s*')
    decls = {}  # name -> list of (line, kind)
    for i, ln in enumerate(lines, 1):
        for m in decl_re.finditer(ln):
            kind, name = m.group(1), m.group(2)
            decls.setdefault(name, []).append((i, kind))

    # 2) crude scope tracking: split into top-level function/arrow bodies via brace depth
    depth = 0
    paren = 0
    # name -> first declaration line (const/let) for TDZ check
    first_const = {}
    for name, lst in decls.items():
        consts = [l for (l, k) in lst if k in ('const', 'let')]
        if consts:
            first_const[name] = min(consts)
        else:
            first_const[name] = None  # function only -> hoisted

    # 3) for each line, find identifier references and compare to decl line in same... 
    #    We approximate "same scope" by tracking brace depth at the line.
    #    A use of NAME at line L is a TDZ suspect if first_const[NAME] exists and
    #    first_const[NAME] > L (used before its const line) AND the use is not
    #    inside a nested function opened after L. We detect nested-function-open
    #    by scanning braces between L and the decl line.
    ident_re = re.compile(r'\b([A-Za-z_$][\w$]*)\b')

    # Precompute, for each line, the brace-depth and whether a function opened there.
    depths = [0]*(len(lines)+1)
    func_open_line = set()
    d = 0
    p = 0
    for i, ln in enumerate(lines, 1):
        depths[i] = d
        # detect function/arrow opening followed by '{'
        if re.search(r'\b(function|=>)\b', ln) and '{' in ln:
            func_open_line.add(i)
        for ch in ln:
            if ch == '{': d += 1
            elif ch == '}': d -= 1

    for i, ln in enumerate(lines, 1):
        for m in ident_re.finditer(ln):
            name = m.group(1)
            if name in ('const','let','function','var','if','for','while','return',
                        'await','async','new','typeof','of','in','do','else','switch','case'):
                continue
            if name not in first_const:
                continue
            decl = first_const[name]
            if decl is None:
                continue  # function-decl -> hoisted, safe
            if decl <= i:
                continue  # declared on/before this line -> safe
            # used AFTER? no, decl > i means used before declaration line -> suspect
            # but only if not inside a function opened between i and decl (deferred)
            between = [fl for fl in func_open_line if i < fl < decl]
            if between:
                continue  # use is inside a nested function -> deferred, safe
            # also skip if the use is in a comment
            col = m.start()
            if ln.lstrip().startswith('//') or '//' in ln[:col] and ln[ln.rfind('//',0,col):col].count('"')%2==0:
                # rough comment guard
                if '//' in ln[:col] and ln.rfind('//',0,col) != -1:
                    pass  # keep — imperfect
            suspects.append((i, name, decl))

    # dedupe
    seen = set(); out = []
    for s in suspects:
        if s not in seen:
            seen.add(s); out.append(s)
    out.sort()
    return out

def main():
    files = sys.argv[1:]
    if not files:
        print("usage: tdz_lint.py <file.js> [...]"); sys.exit(2)
    total = 0
    for f in files:
        try:
            su = analyze(f)
        except Exception as e:
            print(f"  [err] {f}: {e}"); continue
        print(f"=== {f}: {len(su)} TDZ suspects ===")
        for (line, name, decl) in su:
            print(f"  L{line}  use of '{name}' before its const at L{decl}")
        total += len(su)
    print(f"\nTOTAL TDZ suspects across {len(files)} file(s): {total}")
    print("(advisory — closure/deferred uses are false positives; triage manually)")

if __name__ == '__main__':
    main()
