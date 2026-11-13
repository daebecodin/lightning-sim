import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[1])); out = sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 2
w = int(sys.argv[4]) if len(sys.argv) > 4 else 640
ims = [Image.open(f).convert('RGB') for f in files]
h = int(ims[0].height * w / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), (40, 0, 0))
for i, im in enumerate(ims):
    sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
sheet.save(out)
print(out, sheet.size, [f.split('_')[-1] for f in files])
