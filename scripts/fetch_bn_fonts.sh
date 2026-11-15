#!/usr/bin/env bash
# Task 48 — self-host Noto Sans Bengali (400/600/700) for BN/EN language toggle
set -e
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS=$(curl -sf -A "$UA" "https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap")
echo "$CSS" > /tmp/bn_fonts.css
# extract bengali-subset woff2 URLs per weight (take LAST url per block set = bengali usually first; grab all, dedupe not needed)
mkdir -p /home/z/my-project/frontend/public/fonts /home/z/my-project/admin/public/fonts
i=0
for W in 400 600 700; do
  URL=$(awk "/font-weight: $W/,/unicode-range/" /tmp/bn_fonts.css | grep -o 'https://fonts.gstatic.com[^)]*\.woff2' | head -1)
  if [ -z "$URL" ]; then echo "MISS weight $W"; exit 2; fi
  i=$((i+1))
  F="NotoSansBengali-$W.woff2"
  curl -sf -o "/home/z/my-project/frontend/public/fonts/$F" "$URL"
  cp "/home/z/my-project/frontend/public/fonts/$F" "/home/z/my-project/admin/public/fonts/$F"
  echo "OK $F <- $URL ($(stat -c%s /home/z/my-project/frontend/public/fonts/$F) bytes)"
done
echo "ALL_FONTS_OK"
