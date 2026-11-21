"""Record the Londonfax demo: the TV screen plus two phones side by side, narrated.

Needs: server.py running on http://localhost:8765, `pip install playwright imageio-ffmpeg`,
Google Chrome (plays TfL's H.264 camera clips) and macOS `say`. Writes demo/londonfax-demo.mp4.
Set SKIP_CONTROL=1 to leave out the Control Room beat.
"""
import os
import subprocess
import sys
import tempfile
import time

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

BASE = os.environ.get("LONDONFAX_URL", "http://localhost:8765")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "londonfax-demo.mp4")
VOICE = os.environ.get("LONDONFAX_VOICE", "Daniel")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WATERLOO = {"latitude": 51.5033, "longitude": -0.1145}
TV = (1280, 720)
PHONE = (390, 844)
CAPTION_JS = """t => { let c = document.getElementById('caption');
  if (!c) { c = document.createElement('div'); c.id = 'caption';
    c.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#000;color:#fff;font:700 22px Helvetica,Arial;padding:6px 16px;z-index:99;max-width:90vw;text-align:center';
    document.body.appendChild(c); }
  c.textContent = t || ''; c.hidden = !t; }"""


def beats(control):
    b = [
        ("LONDONFAX: teletext, rebuilt for 2026", "This is Londonfax. Teletext, the nineteen eighties TV text service, rebuilt for twenty twenty six, with live London transport and two flagship modes.", [
            (1.5, "p1_create", "Ana")]),
        ("GAME MODE: a 1v1 London knowledge game, played on your phones", "First, Game Mode. A one versus one London knowledge game, played in the phone browser. One player creates a game, and a friend joins with the code on the TV.", [
            (0.3, "tv_page", 600), (2.5, "p2_join", "Ben")]),
        ("Both players get the same real journey from TfL: deliberately not the fastest", "Both players get the same real journey, planned by T F L's own journey planner, and deliberately not the fastest route.", [
            (0.3, "p1_start", None)], "ready"),
        ("Two secret edits each. Times stay hidden, so you need to know London", "Each player secretly makes two changes: take a bus instead, or change trains somewhere else. The times stay hidden, so you need to know London.", [
            (0.8, "edit_leg", "p1"), (3.0, "edit_change", "p2"), (5.5, "edit_change", "p1")]),
        ("Slower = points. Faster by accident = minus points. Scores saved in Snowflake", "Every minute slower is a point. Make it faster by accident and you lose points. Every time comes from T F L, and the scores are saved in Snowflake.", [
            (0.3, "submit", "p1"), (0.8, "submit", "p2")]),
    ]
    if control:
        b.append(("CONTROL ROOM: close a road, see the simulated knock-on effect", "Second, the Control Room. Close a road, and see the simulated knock-on effect on London's traffic, with every figure labelled as an estimate, and costs as ranges.", [
            (0.3, "control_close", "Strand")]))
        b.append(("Page 800: the Control Room on the teletext screen", "The same scenario appears on teletext page eight hundred, and page eight oh three explains exactly how it works.", [
            (0.3, "tv_page", 800)]))
    b += [
        ("P199 DATA CHECK: every feed's freshness, plus today's disruptions from Snowflake", "Page one nine nine checks every live feed, and shows today's disruptions, queried from Snowflake, where we archive every T F L status report as an audit trail.", [
            (0.3, "tv_page", 199), (6.5, "tv_key", "ArrowRight")]),
        ("And every page is live: Near Me, buses, stations, cycles and camera video", "And every page is live. Near Me finds your stations, buses and cycle docks, and five oh one plays live video from T F L's traffic cameras.", [
            (0.3, "tv_click", "#nearme"), (5.0, "tv_page", 501)]),
        ("LONDONFAX: retro on the outside, genuinely useful inside. Retro Remix", "Londonfax. Retro on the outside, genuinely useful on the inside.", [
            (0.4, "tv_page", 100)]),
    ]
    return b


def narrate(bs, tmp):
    clips = []
    for i, beat in enumerate(bs):
        text = beat[1]
        path = os.path.join(tmp, f"beat{i}.aiff")
        subprocess.run(["say", "-v", VOICE, "-r", "182", "-o", path, text], check=True)
        out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
        dur = next(float(l.split(":")[1].split()[0]) for l in out.splitlines() if "estimated duration" in l)
        clips.append((path, dur))
    return clips


class Rig:
    def __init__(self, pw, tmp):
        self.browser = pw.chromium.launch(channel="chrome")
        self.t0 = time.monotonic()
        self.ctx, self.pages, self.starts = {}, {}, {}
        for name, size, extra in (("tv", TV, {"geolocation": WATERLOO, "permissions": ["geolocation"]}),
                                  ("p1", PHONE, {"is_mobile": True, "has_touch": True}),
                                  ("p2", PHONE, {"is_mobile": True, "has_touch": True})):
            d = os.path.join(tmp, name)
            os.makedirs(d, exist_ok=True)
            self.ctx[name] = self.browser.new_context(viewport={"width": size[0], "height": size[1]}, record_video_dir=d,
                                                      record_video_size={"width": size[0], "height": size[1]}, **extra)
            self.pages[name] = self.ctx[name].new_page()
            self.starts[name] = time.monotonic() - self.t0
        self.pages["tv"].goto(BASE + "/?demo#100")
        for p in ("p1", "p2"):
            self.pages[p].goto(BASE + "/play/")
        self.pages["tv"].wait_for_function("window.Londonfax && !window.Londonfax.state().rolling", timeout=20000)

    def caption(self, text):
        tv = self.pages["tv"]
        if "/control" in tv.url:
            tv.evaluate(CAPTION_JS, text)
        else:
            tv.evaluate("t => window.Londonfax && window.Londonfax.caption(t)", text)

    def do(self, kind, arg):
        tv, p1, p2 = self.pages["tv"], self.pages["p1"], self.pages["p2"]
        if kind == "tv_page":
            if "/control" in tv.url:
                tv.goto(BASE + f"/?demo#{arg}")
                tv.wait_for_function("window.Londonfax", timeout=15000)
            else:
                for ch in str(arg):
                    tv.keyboard.press(ch)
                    time.sleep(0.25)
        elif kind == "tv_key":
            tv.keyboard.press(arg)
        elif kind == "tv_click":
            tv.click(arg)
        elif kind == "p1_create":
            p1.fill("#name", arg)
            p1.click("#create")
        elif kind == "p2_join":
            code = p1.evaluate("fetch('/api/game/rooms/latest').then(r => r.json()).then(j => j.code)")
            p2.fill("#name", arg)
            p2.fill("#code", code)
            p2.click("#join")
        elif kind == "p1_start":
            p1.wait_for_selector("#start:not([disabled])", timeout=60000)
            p1.click("#start")
        elif kind in ("edit_leg", "edit_change"):
            page = self.pages[arg]
            sel = "[data-leg]:not([aria-disabled])" if kind == "edit_leg" else "[data-change]:not([aria-disabled])"
            page.wait_for_selector(sel, timeout=20000)
            page.click(sel)
            page.wait_for_timeout(700)
            if page.locator("#sheet-list .opt").count():
                page.click("#sheet-list .opt")
            else:
                page.click("#sheet-cancel")
        elif kind == "submit":
            page = self.pages[arg]
            page.wait_for_selector("#submit", timeout=10000)
            page.click("#submit")
            page.wait_for_timeout(300)
            if page.locator("#submit").count():
                page.click("#submit")  # "no edits: tap again" confirmation
        elif kind == "control_close":
            tv.goto(BASE + "/control/")
            tv.evaluate(CAPTION_JS, "CONTROL ROOM: close a road, see the simulated knock-on effect")
            tv.fill("#q", arg)
            tv.press("#q", "Enter")
            tv.wait_for_selector("#results button", timeout=10000)
            tv.locator("#results button").first.click()  # the Close button on the first match
            tv.wait_for_timeout(1500)
            tv.locator("#impact").scroll_into_view_if_needed()
            tv.wait_for_timeout(2500)
            if tv.locator("#brief").count():
                tv.click("#brief")
                tv.wait_for_timeout(1200)
                tv.locator("#brief-text").scroll_into_view_if_needed()

    def finish(self):
        paths = {}
        for name in ("tv", "p1", "p2"):
            paths[name] = self.pages[name].video.path()
            self.ctx[name].close()
        self.browser.close()
        return paths


def record(bs, clips, tmp):
    starts = []
    with sync_playwright() as pw:
        rig = Rig(pw, tmp)
        time.sleep(2.0)
        for beat, (_, dur) in zip(bs, clips):
            caption, _, actions = beat[:3]
            if len(beat) > 3 and beat[3] == "ready":  # hold the narration until TfL journeys are prepared
                try:
                    rig.pages["p1"].wait_for_selector("#start:not([disabled])", timeout=90000)
                except Exception as e:
                    print("game not ready:", str(e)[:80])
            start = time.monotonic()
            starts.append(start - rig.t0)
            rig.caption(caption)
            for at, kind, arg in actions:
                wait = at - (time.monotonic() - start)
                if wait > 0:
                    time.sleep(wait)
                try:
                    rig.do(kind, arg)
                except Exception as e:  # keep recording; a missed tap is better than no video
                    print("action failed:", kind, arg, str(e)[:120])
            remaining = dur + 0.7 - (time.monotonic() - start)
            if remaining > 0:
                time.sleep(remaining)
        time.sleep(1.5)
        videos = rig.finish()
        return videos, rig.starts, starts


def mux(videos, vstarts, clips, starts):
    ph = 720
    pw_ = int(round(PHONE[0] * ph / PHONE[1] / 2)) * 2
    args = [FFMPEG, "-y", "-i", videos["tv"], "-i", videos["p1"], "-i", videos["p2"]]
    for path, _ in clips:
        args += ["-i", path]
    base = vstarts["tv"]
    v = (f"[0:v]scale={TV[0]}:{TV[1]},setsar=1[tv];"
         f"[1:v]scale={pw_}:{ph},setsar=1,tpad=start_duration={max(0, vstarts['p1'] - base):.2f}:color=black[a];"
         f"[2:v]scale={pw_}:{ph},setsar=1,tpad=start_duration={max(0, vstarts['p2'] - base):.2f}:color=black[b];"
         f"[tv][a][b]hstack=inputs=3[v]")
    aud = ";".join(f"[{i + 3}:a]adelay={int((s - base) * 1000)}|{int((s - base) * 1000)}[x{i}]" for i, s in enumerate(starts))
    mix = "".join(f"[x{i}]" for i in range(len(clips)))
    args += ["-filter_complex", v + ";" + aud + f";{mix}amix=inputs={len(clips)}:normalize=0,apad[aout]",
             "-map", "[v]", "-map", "[aout]", "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", OUT]
    subprocess.run(args, check=True, capture_output=True)


def main():
    control = os.environ.get("SKIP_CONTROL") != "1"
    bs = beats(control)
    with tempfile.TemporaryDirectory() as tmp:
        clips = narrate(bs, tmp)
        print("narration:", round(sum(d for _, d in clips), 1), "s")
        videos, vstarts, starts = record(bs, clips, tmp)
        mux(videos, vstarts, clips, starts)
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
