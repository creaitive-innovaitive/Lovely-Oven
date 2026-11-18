"""Converts site images to WebP next to the original and prints the saving. Needs cwebp (brew install webp).
Usage: python3 tools/optimise_images.py img/gallery/new-dish.jpg [more files]
Zalo QR codes are saved lossless so they stay scannable; photos are resized to a sensible cap and saved at q78."""
import os, subprocess, sys

CAPS = {"hero": 1280, "home": 1200, "gallery": 900, "menu": 900, "dishes": 900, "promo": 0, "payment": 0}
LOSSLESS = ("zalo-qr",)   # QR codes stay lossless (the bank QR is better left as its original JPG)
LOSSLESS_FILES = ()

def convert(path):
    folder = os.path.basename(os.path.dirname(path))
    stem, _ = os.path.splitext(path)
    out = stem + ".webp"
    cmd = ["cwebp", "-quiet", "-m", "6"]
    if any(k in os.path.basename(path).lower() for k in LOSSLESS) or any(k in path for k in LOSSLESS_FILES):
        cmd += ["-lossless", "-z", "9"]
    else:
        cmd += ["-q", "78"]
    cap = CAPS.get(folder, 1200)
    if cap:
        w = int(subprocess.check_output(["sips", "-g", "pixelWidth", path]).split()[-1])
        if w > cap:
            cmd += ["-resize", str(cap), "0"]
    subprocess.check_call(cmd + [path, "-o", out])
    a, b = os.path.getsize(path), os.path.getsize(out)
    print(f"{path}: {a//1024}KB -> {b//1024}KB")
    return out

if __name__ == "__main__":
    for p in sys.argv[1:]:
        convert(p)
