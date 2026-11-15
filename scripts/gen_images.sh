#!/bin/bash
# FORGED — brand asset generation (25 images, batches of 5 parallel)
OUT="/home/z/my-project/download/forged-store/assets"
LOG="/home/z/my-project/scripts/gen_images.log"
mkdir -p "$OUT"
: > "$LOG"

gen() {
  local name="$1"; local size="$2"; local prompt="$3"
  local target="$OUT/$name"
  if [ -s "$target" ]; then echo "SKIP $name" >> "$LOG"; return 0; fi
  for attempt in 1 2; do
    echo "GEN $name (attempt $attempt)" >> "$LOG"
    z-ai image -p "$prompt" -o "$target" -s "$size" >> "$LOG" 2>&1 && [ -s "$target" ] && { echo "OK  $name" >> "$LOG"; return 0; }
    sleep 2
  done
  echo "FAIL $name" >> "$LOG"
  return 1
}

# ---- batch 1: heroes + 2 categories ----
gen "hero-1.png" "1344x768" "muscular male athlete slamming heavy battle ropes in dark industrial gym, waves of heavy rope, sweat droplets flying, chalk dust in air, high contrast black and white photography, dramatic rim lighting, dark moody background, film grain, cinematic sports advertisement, high quality, detailed" &
gen "hero-2.png" "1344x768" "powerful female athlete gripping loaded barbell for deadlift, chalk dust exploding around hands, muscle definition, high contrast black and white photography, dramatic rim lighting, dark gym, cinematic sports advertisement, high quality, detailed" &
gen "hero-3.png" "1344x768" "extreme close-up of chalked hands gripping knurled steel barbell, macro texture detail of metal knurling and white chalk, high contrast black and white photography, dramatic side lighting, dark background, cinematic, high quality, detailed" &
gen "cat-apparel.png" "1024x1024" "athletic male torso wearing matte black compression t-shirt, studio shot on pure black background, dramatic silver rim lighting, sweat sheen on skin, premium fitness apparel advertisement, high contrast, high quality, detailed" &
gen "cat-equipment.png" "1024x1024" "matte black kettlebells and hex dumbbell arranged on dark carbon fiber floor, dark studio, dramatic rim lighting with subtle orange edge glow, premium product photography, high quality, detailed" &
wait

# ---- batch 2: categories + first products ----
gen "cat-accessories.png" "1024x1024" "flat lay of black leather lifting gloves, weightlifting belt and wrist wraps on dark brushed metal surface, dramatic moody lighting, premium fitness gear photography, high contrast, high quality, detailed" &
gen "cat-supplements.png" "1024x1024" "matte black protein powder tub with bold neon orange typography and black shaker bottle on dark reflective surface, dramatic rim lighting, premium supplement product photography, high quality, detailed" &
gen "prod-tee.png" "1024x1024" "black compression t-shirt on invisible ghost mannequin, pure black background, dramatic silver rim lighting, fabric weave texture detail, premium ecommerce product photography, high quality, detailed" &
gen "prod-tee-b.png" "1024x1024" "back view of black compression t-shirt on invisible ghost mannequin showing athletic raglan seams and fabric texture, pure black background, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "prod-shorts.png" "1024x1024" "black training shorts with neon orange drawstring on invisible mannequin, pure black background, dramatic rim lighting, fabric texture, premium product photography, high quality, detailed" &
wait

# ---- batch 3: equipment products ----
gen "prod-belt.png" "1024x1024" "premium black leather weightlifting belt with steel buckle, coiled, pure black background, dramatic rim lighting, macro stitching detail, subtle orange edge glow, premium product photography, high quality, detailed" &
gen "prod-belt-b.png" "1024x1024" "macro close-up of weightlifting belt steel double prong buckle and black leather grain texture, pure black background, dramatic lighting, premium product photography, high quality, detailed" &
gen "prod-knee.png" "1024x1024" "pair of black neoprene knee sleeves standing upright, pure black background, dramatic rim lighting, fabric texture detail, premium product photography, high quality, detailed" &
gen "prod-dumbbell.png" "1024x1024" "matte black hex dumbbell with knurled steel handle, macro texture detail of knurling, pure black background, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "prod-dumbbell-b.png" "1024x1024" "chrome and matte black adjustable dumbbell on black reflective surface, side profile, dramatic rim lighting, pure black background, premium product photography, high quality, detailed" &
wait

# ---- batch 4: accessories + supplements + athlete 1 ----
gen "prod-shaker.png" "1024x1024" "matte black protein shaker bottle with metallic silver ring lid, pure black background, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "prod-gloves.png" "1024x1024" "black leather weightlifting gloves with wrist wraps, pure black background, macro stitching and leather grain detail, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "prod-whey.png" "1024x1024" "matte black whey protein tub with bold neon orange label typography, pure black background, dramatic rim lighting, scoop of chocolate powder beside it, premium product photography, high quality, detailed" &
gen "prod-whey-b.png" "1024x1024" "open matte black protein tub with metal scoop and chocolate powder, pure black background, macro texture, dramatic rim lighting, premium product photography, high quality, detailed" &
gen "athlete-1.png" "768x1344" "portrait of muscular male powerlifter with chalk on hands, arms crossed, intense stare, high contrast black and white photography, dark background, dramatic rim lighting, film grain, cinematic, high quality, detailed" &
wait

# ---- batch 5: athletes + member stories ----
gen "athlete-2.png" "768x1344" "portrait of strong female CrossFit athlete holding battle rope over shoulder, sweat on skin, intense expression, high contrast black and white photography, dark background, dramatic rim lighting, cinematic, high quality, detailed" &
gen "athlete-3.png" "768x1344" "portrait of male boxer with white hand wraps, dramatic side lighting, high contrast black and white photography, dark smoky background, film grain, cinematic, high quality, detailed" &
gen "story-1.png" "1024x1024" "fit man in his thirties mid kettlebell swing workout, sweat dripping, determined expression, dark gym, high contrast black and white photography, dramatic lighting, cinematic, high quality, detailed" &
gen "story-2.png" "1024x1024" "athletic woman doing strict pull-up on bar, back muscle definition, dark gym, high contrast black and white photography, dramatic rim lighting, cinematic, high quality, detailed" &
gen "story-3.png" "1024x1024" "mature man in his late forties running with focused expression in dark gym, motion blur background, sweat, high contrast black and white photography, dramatic lighting, cinematic, high quality, detailed" &
wait

echo "=== SUMMARY ===" >> "$LOG"
ok=0; fail=0
for f in "$OUT"/*.png; do
  if [ -s "$f" ]; then ok=$((ok+1)); else fail=$((fail+1)); fi
done
echo "OK files: $ok / 25, missing: $((25-ok))" >> "$LOG"
tail -30 "$LOG"
