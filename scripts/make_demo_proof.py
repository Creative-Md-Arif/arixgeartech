"""Generate a small demo payment-proof PNG for seed data."""
from PIL import Image, ImageDraw, ImageFont

W, H = 560, 340
img = Image.new("RGB", (W, H), (228, 19, 110))  # bKash pink
d = ImageDraw.Draw(img)

try:
    fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
    fr = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
except Exception:
    fb = fr = ImageFont.load_default()

d.rectangle((16, 16, W-16, H-16), fill=(250, 245, 250))
d.text((40, 42), "bKash", font=fb, fill=(228, 19, 110))
d.text((40, 84), "Send Money - Successful", font=fr, fill=(60, 60, 60))
d.text((40, 130), "To:  01712-345678 (bKash Personal)", font=fr, fill=(60, 60, 60))
d.text((40, 165), "Amount:  $91.50", font=fb, fill=(20, 20, 20))
d.text((40, 210), "TrxID:  9G3AXKD6GK", font=fb, fill=(20, 20, 20))
d.text((40, 250), "Date:  2026-10-17  02:41 PM", font=fr, fill=(60, 60, 60))
d.text((40, 285), "DEMO SCREENSHOT - FORGED. seed data", font=fr, fill=(150, 150, 150))

img.save("/home/z/my-project/download/forged-full-project/backend/src/seed/demo-proof.png", optimize=True)
print("saved", W, "x", H)
