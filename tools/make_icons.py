"""Draw the app icons.

One shape, rendered at each size an installed app asks for: a television on
the workbook's purple, with the two vote bars on its screen. Drawn large and
downsampled so the edges stay clean at 180 pixels.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"

PURPLE = (112, 48, 160)
PALE = (242, 233, 248)
WHITE = (255, 255, 255)
SCALE = 8  # supersampling factor


def draw(size, maskable):
    """Render one icon. Maskable ones keep clear of the edges, since the
    launcher may crop them to a circle."""
    box = size * SCALE
    image = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)

    # Background: full bleed for maskable, a rounded tile otherwise.
    if maskable:
        pen.rectangle((0, 0, box, box), fill=PURPLE)
    else:
        pen.rounded_rectangle((0, 0, box, box), radius=box * 0.22, fill=PURPLE)

    inset = box * (0.26 if maskable else 0.18)
    width = box - inset * 2
    screen_top = inset + width * 0.22
    screen_height = width * 0.62

    # Antennae, drawn behind the set.
    pen.line((box / 2, screen_top, inset + width * 0.16, inset * 0.55), fill=WHITE, width=int(box * 0.022))
    pen.line((box / 2, screen_top, inset + width * 0.84, inset * 0.55), fill=WHITE, width=int(box * 0.022))

    pen.rounded_rectangle(
        (inset, screen_top, inset + width, screen_top + screen_height),
        radius=width * 0.1,
        fill=WHITE,
    )

    # Two bars on the screen: the ballot, level.
    bar_width = width * 0.16
    gap = width * 0.1
    bottom = screen_top + screen_height - width * 0.13
    left = box / 2 - bar_width - gap / 2
    for x, height in ((left, screen_height * 0.42), (left + bar_width + gap, screen_height * 0.42)):
        pen.rounded_rectangle((x, bottom - height, x + bar_width, bottom), radius=bar_width * 0.3, fill=PURPLE)

    # Feet.
    foot = width * 0.07
    for x in (inset + width * 0.22, inset + width * 0.78 - foot * 2):
        pen.rounded_rectangle(
            (x, screen_top + screen_height, x + foot * 2, screen_top + screen_height + foot),
            radius=foot * 0.4,
            fill=PALE,
        )

    return image.resize((size, size), Image.LANCZOS)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw(size, maskable=False).save(ICONS / f"icon-{size}.png")
        draw(size, maskable=True).save(ICONS / f"icon-{size}-maskable.png")
    # iOS uses its own, and applies its own rounding, so no transparency.
    apple = Image.new("RGB", (180, 180), PURPLE)
    apple.paste(draw(180, maskable=True).convert("RGB"), (0, 0))
    apple.save(ICONS / "apple-touch-icon.png")
    print(f"wrote {len(list(ICONS.glob('*.png')))} icons to {ICONS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
