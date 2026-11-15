#!/usr/bin/env python3
"""Reverse the base64 embedding: replace data URIs back with assets/*.png paths.
Then print structural analysis of the de-embedded HTML for the multi-page split."""
import base64, re, os

SRC = "/home/z/my-project/download/forged-store/index.html"
ASSETS = "/home/z/my-project/download/forged-store/assets"
OUT = "/home/z/my-project/scripts/deembedded.html"

with open(SRC, "r", encoding="utf-8") as f:
    html = f.read()

print(f"source size: {len(html)//1024} KB")

# rebuild data URI for each asset and replace with its relative path
names = sorted(n for n in os.listdir(ASSETS) if n.endswith(".png"))
total_replaced = 0
for name in names:
    path = os.path.join(ASSETS, name)
    with open(path, "rb") as f:
        data = f.read()
    if data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    else:
        mime = "image/jpeg"
    uri = f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
    cnt = html.count(uri)
    if cnt:
        html = html.replace(uri, f"assets/{name}")
        total_replaced += cnt
        print(f"  restored {name}  x{cnt}")
    else:
        print(f"  !! NO MATCH for {name}")

print(f"total restored refs: {total_replaced}")

# any data:image left? (should be zero or only intentional)
left = re.findall(r"data:image/[a-z+]+;base64,[A-Za-z0-9+/=]{40,}", html)
print(f"leftover data URIs: {len(left)}")
for l in left[:5]:
    print("   leftover:", l[:80])

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"de-embedded written: {OUT} ({len(html)//1024} KB)")

# ---------- structural analysis ----------
print("\n===== STYLE/SCRIPT BLOCKS =====")
for m in re.finditer(r"<(style|script)([^>]*)>", html):
    tag = m.group(1)
    attrs = m.group(2)
    ln = html[: m.start()].count("\n") + 1
    print(f"  line {ln}: <{tag}{attrs}>")

print("\n===== SECTION / PAGE MARKERS =====")
for m in re.finditer(r'<(section|main|div)[^>]*(data-route|class="page|id="page)[^>]*>', html):
    ln = html[: m.start()].count("\n") + 1
    print(f"  line {ln}: {m.group(0)[:110]}")

print("\n===== NAVIGATE / HASH USAGE IN JS =====")
for pat in [r"function navigate\(", r"function routeName\(", r"function applyRoute\(",
            r"hashchange", r"location\.hash", r"navigate\('#/[^']*'\)"]:
    hits = re.findall(pat, html)
    print(f"  {pat!r}: {len(hits)}")

print("\n===== NAVIGATE CALL SITES (unique) =====")
sites = sorted(set(re.findall(r"navigate\((['\"`])#/?([^'\"`]*)\1\)", html)))
for q, r in sites:
    print(f"  navigate('#/{r}')")

print("\n===== HREF HASH LINKS (unique) =====")
hrefs = sorted(set(re.findall(r'href="#/([^"]*)"', html)))
for h in hrefs:
    print(f"  href=\"#/{h}\"")

print("\n===== TOP-LEVEL FUNCTION DEFS =====")
funcs = re.findall(r"^(?:function\s+([A-Za-z0-9_$]+)|const\s+([A-Za-z0-9_$]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>)\s*{", html, re.M)
names = [a or b for a, b in funcs]
print(f"  {len(names)} defs")
print("  " + ", ".join(names))
