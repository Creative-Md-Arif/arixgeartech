#!/bin/bash
# FORGED — retry missing assets, low concurrency to avoid 429
OUT="/home/z/my-project/download/forged-store/assets"
LOG="/home/z/my-project/scripts/gen_images_retry.log"
mkdir -p "$OUT"
: > "$LOG"

gen() {
  local name="$1"; local size="$2"; local prompt="$3"
  local target="$OUT/$name"
  if [ -s "$target" ]; then echo "SKIP $name" >> "$LOG"; return 0; fi
  for attempt in 1 2 3; do
    echo "GEN $name (attempt $attempt)" >> "$LOG"
    z-ai image -p "$prompt" -o "$target" -s "$size" >> "$LOG" 2>&1 && [ -s "$target" ] && { echo "OK  $name" >> "$LOG"; return 0; }
    sleep $((attempt * 6))
  done
  echo "FAIL $name" >> "$LOG"
  return 1
}

# wave 1
gen "cat-apparel.png" "1024x1024" "athletic male torso wearing matte black compression t-shirt, studio shot on pure black background, dramatic silver rim lighting, sweat sheen on skin, premium fitness apparel advertisement, high contrast, high quality, detailed" &
gen "cat-accessories.png" "1024x1024" "flat lay of black leather lifting gloves, weightlifting belt and wrist wraps on dark brushed metal surface, dramatic moody lighting, premium fitness gear photography, high contrast, high quality, detailed" &
wait; sleep 4

# wave 2
gen "prod-belt-b.png" "1024x1024" "macro close-up of weightlifting belt steel double prong buckle and black leather grain texture, pure black background, dramatic lighting, premium product photography, high quality, detailed" &
gen "prod-shaker.png" "1024x1024" "matte black protein shaker bottle with metallic silver ring lid, pure black background, dramatic rim lighting, premium product photography, high quality, detailed" &
wait; sleep 4

# wave 3
gen "prod-whey-b.png" "1024x1024" "open matte black protein tub with metal scoop and chocolate powder, pure black background, macro texture, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "athlete-1.png" "768x1344" "portrait of muscular male powerlifter with chalk on hands, arms crossed, intense stare, high contrast black and white photography, dark background, dramatic rim lighting, film grain, cinematic, high quality, detailed" &
wait; sleep 4

# wave 4
gen "athlete-2.png" "768x1344" "portrait of strong female CrossFit athlete holding battle rope over shoulder, sweat on skin, intense expression, high contrast black and white photography, dark background, dramatic rim lighting, cinematic, high quality, detailed" &
gen "athlete-3.png" "768x1344" "portrait of male boxer with white hand wraps, dramatic side lighting, high contrast black and white photography, dark smoky background, film grain, cinematic, high quality, detailed" &
wait; sleep 4

# wave 5
gen "story-1.png" "1024x1024" "fit man in his thirties mid kettlebell swing workout, sweat dripping, determined expression, dark gym, high contrast black and white photography, dramatic lighting, cinematic, high quality, detailed" &
gen "story-2.png" "1024x1024" "athletic woman doing strict pull-up on bar, back muscle definition, dark gym, high contrast black and white photography, dramatic rim lighting, cinematic, high quality, detailed" &
wait; sleep 4

# wave 6
gen "story-3.png" "1024x1024" "mature man in his late forties running with focused expression in dark gym, motion blur background, sweat, high contrast black and white photography, dramatic lighting, cinematic, high quality, detailed" &
wait

echo "=== SUMMARY ===" >> "$LOG"
cd "$OUT" || exit 1
ls -1 *.png | wc -l >> "$LOG"
echo "done" >> "$LOG"
cat "$LOG"
