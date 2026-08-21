#!/usr/bin/env python3
"""
Generate sample images to test every Catalyst Zia service used by NETRA.
Run with the venv that has PIL + qrcode + python-barcode:
    ~/Downloads/.venv/bin/python scripts/gen-zia-samples.py

Output → data/zia-samples/. See the README written alongside for what each
file tests and which ones need a REAL photo instead (face/object/moderation).
"""
import os
from PIL import Image, ImageDraw, ImageFont
import qrcode
from barcode import Code128
from barcode.writer import ImageWriter

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "zia-samples")
os.makedirs(OUT, exist_ok=True)


def font(size):
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def ocr_fir():
    """OCR-testable: a mock FIR document with real, readable text."""
    img = Image.new("RGB", (900, 1200), "white")
    d = ImageDraw.Draw(img)
    lines = [
        ("KARNATAKA STATE POLICE", 40, True),
        ("FIRST INFORMATION REPORT", 26, True),
        ("", 10, False),
        ("FIR No: 0123/2026        Date: 14-07-2026", 24, False),
        ("Police Station: Tumakuru City PS", 24, False),
        ("District: Tumakuru", 24, False),
        ("Section: IPC 379 (Theft)", 24, False),
        ("", 10, False),
        ("Complainant: Ramesh Kumar, age 42", 24, False),
        ("Phone: 9845012345", 24, False),
        ("", 10, False),
        ("Brief Facts:", 24, True),
        ("On 14-07-2026 at about 21:30 hrs near the", 22, False),
        ("Bus Stand, Tumakuru, an unknown accused", 22, False),
        ("stole a black Honda Activa bearing", 22, False),
        ("registration KA-06-HJ-4521. Vehicle value", 22, False),
        ("approx Rs. 85,000. Investigation ongoing.", 22, False),
    ]
    y = 60
    for text, size, bold in lines:
        d.text((60, y), text, fill="black", font=font(size))
        y += size + 16
    p = os.path.join(OUT, "ocr-fir.png")
    img.save(p)
    return p


def barcode_img():
    """Barcode-testable: a real, decodable Code128 barcode."""
    p = os.path.join(OUT, "barcode-evidence")  # writer appends .png
    Code128("EVID-2026-000123", writer=ImageWriter()).save(p)
    return p + ".png"


def qr_img():
    """Barcode-scanner also reads QR: a real, decodable QR code."""
    qr = qrcode.make("NETRA://case/0123-2026?evidence=EVID-000123")
    p = os.path.join(OUT, "qr-case.png")
    qr.save(p)
    return p


def synthetic_face():
    """Plumbing-only: a crude face. Zia may return 'no faces' — that still
    proves the API round-trips. Use a REAL photo for actual detection."""
    img = Image.new("RGB", (600, 600), (230, 230, 235))
    d = ImageDraw.Draw(img)
    d.ellipse((180, 140, 420, 440), fill=(255, 224, 189), outline=(0, 0, 0))  # head
    d.ellipse((235, 250, 275, 290), fill="white", outline="black")           # eyes
    d.ellipse((325, 250, 365, 290), fill="white", outline="black")
    d.ellipse((248, 262, 262, 276), fill="black")
    d.ellipse((338, 262, 352, 276), fill="black")
    d.line((295, 300, 295, 350), fill="black", width=3)                       # nose
    d.arc((255, 330, 345, 400), start=20, end=160, fill="black", width=4)     # mouth
    p = os.path.join(OUT, "face-synthetic.png")
    img.save(p)
    return p


def synthetic_objects():
    """Plumbing-only: simple shapes for object detection round-trip."""
    img = Image.new("RGB", (700, 500), (245, 245, 245))
    d = ImageDraw.Draw(img)
    d.rectangle((60, 300, 240, 440), fill=(60, 90, 200))     # "box"
    d.ellipse((320, 320, 440, 440), fill=(200, 60, 60))      # "ball"
    d.polygon([(520, 440), (600, 300), (680, 440)], fill=(60, 160, 90))  # "cone"
    d.text((60, 40), "object-detection round-trip sample", fill="black", font=font(22))
    p = os.path.join(OUT, "objects-synthetic.png")
    img.save(p)
    return p


if __name__ == "__main__":
    made = [
        ("OCR",                 ocr_fir()),
        ("Barcode (Code128)",   barcode_img()),
        ("Barcode (QR)",        qr_img()),
        ("Face Analytics",      synthetic_face()),
        ("Object Recognition",  synthetic_objects()),
    ]
    print("Generated Zia sample images:")
    for label, path in made:
        print(f"  {label:22s} {os.path.relpath(path)}")
