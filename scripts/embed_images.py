#!/usr/bin/env python3
"""Embed all assets into index.html as base64 data URIs -> fully self-contained file."""
import base64, re, os

SRC = "/home/z/my-project/download/forged-store/index.html"
ASSETS = "/home/z/my-project/download/forged-store/assets"

with open(SRC, "r", encoding="utf-8") as f:
    html = f.read()

# find every assets/xxx.png reference (in src=, url(), JS strings)
refs = sorted(set(re.findall(r"assets/([a-z0-9\-]+\.png)", html)))
print(f"unique refs: {len(refs)}")

missing = []
for name in refs:
    path = os.path.join(ASSETS, name)
    if not os.path.exists(path):
        missing.append(name)
        continue
    with open(path, "rb") as f:
        data = f.read()
    # detect real type (files are JPEG data despite .png name)
    if data[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    else:
        mime = "image/jpeg"
    b64 = base64.b64encode(data).decode("ascii")
    uri = f"data:{mime};base64,{b64}"
    count = html.count(f"assets/{name}")
    html = html.replace(f"assets/{name}", uri)
    print(f"  embedded {name}  x{count}  ({len(data)//1024} KB)")

if missing:
    print("MISSING:", missing)
    raise SystemExit(1)

# sanity: no leftover external asset refs
left = re.findall(r"assets/[a-z0-9\-]+\.png", html)
print(f"leftover refs: {left}")

OUT = SRC  # overwrite in place
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"written {OUT}: {os.path.getsize(OUT)//1024} KB")
