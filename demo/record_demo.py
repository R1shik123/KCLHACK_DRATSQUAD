"""Record the Londonfax demo video.

Needs: the site served at http://localhost:8765 (python3 -m http.server 8765),
`pip install playwright imageio-ffmpeg`, Google Chrome (plays TfL's H.264 camera
clips), and macOS `say` for the narration. Writes demo/londonfax-demo.mp4.
"""
import os
import subprocess
import sys
import tempfile
import time

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

URL = os.environ.get("LONDONFAX_URL", "http://localhost:8765/?demo")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "londonfax-demo.mp4")
VOICE = os.environ.get("LONDONFAX_VOICE", "Daniel")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WATERLOO = {"latitude": 51.5033, "longitude": -0.1145}  # pretend the presenter is at KCL Waterloo

# Actions: ("key", k) presses a key; ("click", "#sel") clicks; ("row", r) clicks a teletext row;
# ("type", text) types into the search box; ("enter",) submits the search.
BEATS = [
    ("LONDONFAX: Teletext, rebuilt as a live London travel tool",
     "This is Londonfax. Teletext, the nineteen eighties TV text service, rebuilt as a live London travel tool for twenty twenty six.",
     []),
    ("NEAR ME: stations, bus stops, bikes and cameras around you, with walking times",
     "Press Near Me, and it finds every station, bus stop, cycle dock and traffic camera around you, with walking times. Every line on the screen is clickable.",
     [(1.0, ("click", "#nearme"))]),
    ("Click a bus stop for live arrivals",
     "Tap a bus stop, and you get its live arrivals, counting down to the minute.",
     [(0.8, ("row", 11))]),
    ("Search any station, road or 5-digit bus stop code",
     "Or search. Any Tube, Elizabeth line, Overground or D L R station gives live departures from every platform. The five digit code on any bus stop sign works too.",
     [(0.6, ("type", "paddington")), (2.4, ("enter",))]),
    ("Type a page number: the header rolls through pages, just like 1985",
     "Type any page number, and the header rolls through the pages just like the original. Page three hundred is live status for every Tube line.",
     [(0.6, ("key", "3")), (0.9, ("key", "0")), (1.2, ("key", "0"))]),
    ("P500: London's live traffic cameras, nearest first",
     "Page five hundred lists London's live traffic cameras, nearest first.",
     [(0.4, ("key", "5")), (0.7, ("key", "0")), (1.0, ("key", "0"))]),
    ("Every camera page plays TfL's latest live video clip",
     "Every camera page plays the latest live video from T F L, so you can see the traffic before you leave.",
     [(0.6, ("key", "r"))]),
    ("REVEAL redraws the view as 1980s teletext block graphics",
     "Press Reveal, and the same view is redrawn as nineteen eighties teletext block graphics. Press it again for the real picture.",
     [(0.6, ("key", "v")), (5.2, ("key", "v"))]),
    ("P450: Santander Cycles docks near you: bikes, e-bikes and free spaces",
     "Page four fifty shows the cycle hire docks near you, with live bikes, e-bikes and free spaces.",
     [(0.4, ("key", "4")), (0.7, ("key", "5")), (1.0, ("key", "0"))]),
    ("LONDONFAX: retro on the outside, genuinely useful inside. Retro Remix, First Year Hack",
     "Londonfax. Retro on the outside, genuinely useful on the inside. Built for the Retro Remix track at First Year Hack.",
     [(0.6, ("key", "i"))]),
]
GAP = 0.7      # silence between beats
INTRO = 2.6    # let the set power on before the first line


def narrate(tmp):
    clips = []
    for i, (_, text, _) in enumerate(BEATS):
        path = os.path.join(tmp, f"beat{i}.aiff")
        subprocess.run(["say", "-v", VOICE, "-r", "182", "-o", path, text], check=True)
        out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
        dur = next(float(l.split(":")[1].split()[0]) for l in out.splitlines() if "estimated duration" in l)
        clips.append((path, dur))
    return clips


def do(page, act):
    kind = act[0]
    if kind == "key":
        page.keyboard.press(act[1])
    elif kind == "click":
        page.click(act[1])
    elif kind == "row":
        box = page.eval_on_selector("#tt", "e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
        x = box[0] + box[2] * (12.5 / 40)
        y = box[1] + box[3] * ((act[1] + 0.5) / 25)
        page.mouse.move(x - 60, y - 40)
        page.mouse.move(x, y, steps=12)
        page.mouse.click(x, y)
    elif kind == "type":
        page.click("#q")
        page.keyboard.type(act[1], delay=90)
    elif kind == "enter":
        page.keyboard.press("Enter")


def record(clips, tmp):
    starts = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        ctx = browser.new_context(viewport={"width": 1280, "height": 760}, device_scale_factor=1,
                                  geolocation=WATERLOO, permissions=["geolocation"],
                                  record_video_dir=tmp, record_video_size={"width": 1280, "height": 760})
        page = ctx.new_page()
        t0 = time.monotonic()
        page.goto(URL)
        page.wait_for_function("window.Londonfax && !window.Londonfax.state().rolling", timeout=20000)
        page.evaluate("window.LFData.allCams()")
        time.sleep(max(0, INTRO - (time.monotonic() - t0)))
        for (caption, _, actions), (_, dur) in zip(BEATS, clips):
            start = time.monotonic()
            starts.append(start - t0)
            page.evaluate("t => window.Londonfax.caption(t)", caption)
            for at, act in actions:
                wait = at - (time.monotonic() - start)
                if wait > 0:
                    time.sleep(wait)
                do(page, act)
            remaining = dur + GAP - (time.monotonic() - start)
            if remaining > 0:
                time.sleep(remaining)
        time.sleep(1.5)
        video = page.video.path()
        ctx.close()
        browser.close()
    return video, starts


def mux(video, clips, starts):
    args = [FFMPEG, "-y", "-i", video]
    for path, _ in clips:
        args += ["-i", path]
    chains = [f"[{i + 1}:a]adelay={int(s * 1000)}|{int(s * 1000)}[a{i}]" for i, s in enumerate(starts)]
    mix = "".join(f"[a{i}]" for i in range(len(clips)))
    filt = ";".join(chains) + f";{mix}amix=inputs={len(clips)}:normalize=0,apad[aout]"
    args += ["-filter_complex", filt, "-map", "0:v", "-map", "[aout]", "-shortest",
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT]
    subprocess.run(args, check=True, capture_output=True)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        clips = narrate(tmp)
        print("narration:", round(sum(d for _, d in clips), 1), "s")
        video, starts = record(clips, tmp)
        mux(video, clips, starts)
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
