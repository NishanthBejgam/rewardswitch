"""Reward Switch - build the public catalogue and the page.

Amazon Pay rewards are "collect" cards at

    https://www.amazon.in/h/rewards/dp/amzn1.rewards.rewardAd.<ID>?rdpf=en

Each page answers LOGGED OUT: its status ('rewardStatus': CAN_BE_COLLECTED /
LOCKED / EXPIRED), the headline ("GET UP TO Rs300 BACK"), the terms line
("3% offer, Min order: Rs100"), validity, the brand logo and the redeem steps
that name the category and window. So the site needs no login and no cookie:
seed/catalog.json lists the ids we know (harvested from a real Rewards page
plus the stable vanity slugs), this script reads every page, and the visitor
gets a catalogue they can filter by what they are buying. "Collect" is a
plain link to Amazon's own page - Amazon decides there whether the visitor's
account is eligible.

    python tools/build_site.py _site            read every reward, write the site
    python tools/build_site.py _site --quick    seed from the published catalog,
                                                re-read only what is stale
    python tools/build_site.py _site --new      read only ids never read yet (the
                                                15-minute watcher's fast publish)

Seeding: a fresh checkout knows nothing, so the build first loads the
catalogue already published (RS_SEED_URL) and the copy committed in
seed/published.json, then re-reads pages oldest-first within a time budget.
Pages that fail keep their last good read and show their real age.

Environment: RS_TAG (Associates tag on the Collect links, default ycj05-21),
RS_PACE (seconds between Amazon hits, default 6), RS_BUDGET (max seconds spent
reading, default 900), RS_SEED_URL, RS_PROXY_URL/RS_PROXY_KEY (reroute Amazon
fetches through a residential proxy if the runner is ever refused).
"""

import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "seed", "catalog.json")
PUBLISHED = os.path.join(ROOT, "seed", "published.json")
STATIC = os.path.join(ROOT, "tools", "static")

TAG = os.environ.get("RS_TAG", "ycj05-21")
PACE = float(os.environ.get("RS_PACE", "6"))
BUDGET = float(os.environ.get("RS_BUDGET", "900"))
SEED_URL = os.environ.get("RS_SEED_URL", "https://rewardswitch.yourcardjourney.store/catalog.json")
PROXY = (os.environ.get("RS_PROXY_URL", ""), os.environ.get("RS_PROXY_KEY", ""))

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
REWARD_URL = "https://www.amazon.in/h/rewards/dp/amzn1.rewards.rewardAd.{id}?rdpf=en"
IST = timezone(timedelta(hours=5, minutes=30))

RE_STATUS = re.compile(r"'rewardStatus':\s*'([A-Z_]+)'")
RE_TAG = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.S)


def log(msg):
    print(msg, flush=True)


def now_iso():
    return datetime.now(IST).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# fetch
# --------------------------------------------------------------------------- #
def curl(url, timeout=40):
    target = url
    if PROXY[0] and PROXY[1]:
        target = PROXY[0].replace("{url}", urllib.parse.quote(url, safe="")).replace("{key}", PROXY[1])
    p = subprocess.run(["curl", "-sS", "-L", "--compressed", "--max-time", str(timeout), "-A", UA,
                        "-H", "Accept-Language: en-IN,en;q=0.9",
                        "-H", "Accept: text/html,application/xhtml+xml,*/*;q=0.8", target],
                       capture_output=True, timeout=timeout + 5)
    if p.returncode != 0:
        raise IOError("curl exit %d: %s" % (p.returncode, p.stderr.decode("utf-8", "replace")[:160]))
    return p.stdout.decode("utf-8", "replace")


def text_of(s):
    return " ".join(html.unescape(RE_TAG.sub(" ", s)).split())


def first_class(page, cls):
    m = re.search(r'class="[^"]*\b' + re.escape(cls) + r'\b[^"]*"[^>]*>([\s\S]*?)</(?:div|span|a)>', page)
    return text_of(m.group(1)) if m else ""


# --------------------------------------------------------------------------- #
# parse one reward page
# --------------------------------------------------------------------------- #
def parse_page(page):
    if "api-services-support@amazon.com" in page or "Enter the characters" in page:
        raise IOError("captcha")
    m = RE_STATUS.search(page)
    if not m:
        raise IOError("no rewardStatus (stub page)")
    main = first_class(page, "coupon-description-main")
    sub = first_class(page, "coupon-description-sub")
    valid = first_class(page, "coupon-date").replace("Valid till", "").strip()
    logo = re.search(r'coupon-brand-image">\s*<img[^>]*src="([^"]+)"', page)
    txt = text_of(page)
    i = txt.find("Steps to redeem")
    steps = txt[i:i + 1600] if i >= 0 else ""
    j = txt.find("Terms and Conditions 1.")
    terms = txt[j:j + 5000] if j >= 0 else ""
    cat = re.search(r"place a successful (.*?) (?:order|transaction|payment)s?\b.*?between (.*?) of minimum "
                    r"(?:order |transaction )?value (?:of )?₹?\s?([\d,]+)", steps, re.I)
    window = cat.group(2) if cat else ""
    if not window:
        w = re.search(r"between (\d{2}-[A-Za-z]{3}-\d{4}(?: \d{2}:\d{2}:\d{2} [AP]M)? to "
                      r"\d{2}-[A-Za-z]{3}-\d{4}(?: \d{2}:\d{2}:\d{2} [AP]M)?)", steps)
        window = w.group(1) if w else ""
    window = re.sub(r" 12:00:00 AM| 11:59:59 PM", "", window).strip()
    times = re.search(r"availed (\d+) time", steps, re.I)
    minv = re.search(r"minimum (?:order |transaction )?value (?:of )?₹?\s?([\d,]+)", steps, re.I)
    unlock = re.search(r"To unlock (.*?)(?:, follow| on )", steps, re.I)
    up = main.upper()
    cap = re.search(r"₹\s?([\d,]+)", main)
    pct = re.search(r"([\d.]+)\s*%", sub)
    mino = re.search(r"Min[^₹\d]*₹?\s?([\d,]+)", sub, re.I)
    worth = re.search(r"(\d+)\s+offers?\s+worth\s+₹\s?([\d,]+)", (main + " " + sub), re.I)
    return {
        "status": m.group(1),
        "headline": main, "sub": sub, "validTill": valid,
        "logo": logo.group(1) if logo else "",
        "category": cat.group(1).strip() if cat else "",
        "window": window,
        "timesPerUser": int(times.group(1)) if times else None,
        "minOrder": _num(mino) if mino else (_num(minv) if minv else None),
        "cap": _num(cap), "pct": _num(pct),
        "flat": "FLAT" in up, "lucky": "WIN" in up,
        "unlock": unlock.group(1).strip() if unlock else "",
        "worthCount": int(worth.group(1)) if worth else None,
        "worth": _num(worth, 2) if worth else None,
        "noClub": bool(re.search(r"can.?t be clubbed", steps, re.I)),
        "steps": steps, "terms": terms[:3000],
        "readAt": now_iso(),
    }


def _num(m, g=1):
    if not m:
        return None
    try:
        return float(m.group(g).replace(",", ""))
    except (ValueError, IndexError):
        return None


# --------------------------------------------------------------------------- #
# catalogue
# --------------------------------------------------------------------------- #
def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except Exception as e:  # noqa: BLE001
        log("  seed url: %s" % e)
        return None


def build(out_dir, quick=False, harvest=True, new_only=False):
    if harvest:
        try:
            import harvest as hv
            hv.run(log)
        except Exception as e:  # noqa: BLE001 - a dead feed must not stop the build
            log("harvest skipped: %s" % e)
    seed = load_json(SEED, {"sections": {}, "rewards": []})
    known = {}
    for src in (load_json(PUBLISHED, None), fetch_json(SEED_URL)):
        if src and isinstance(src.get("rewards"), list):
            for r in src["rewards"]:
                prev = known.get(r["ad"])
                if not prev or (r.get("readAt") or "") > (prev.get("readAt") or ""):
                    known[r["ad"]] = r
    log("known from published: %d" % len(known))

    rewards = []
    for s in seed["rewards"]:
        r = dict(known.get(s["ad"], {}))
        r.update({"ad": s["ad"], "sec": s["sec"], "badge": s.get("badge", "")})
        if s.get("found"):
            r["found"] = s["found"]
        rewards.append(r)

    # oldest read first; unread first of all
    order = sorted(rewards, key=lambda r: r.get("readAt") or "")
    started = time.time()
    read = failed = 0
    for r in order:
        if time.time() - started > BUDGET:
            log("budget spent; %d left for next run" % (len(order) - read - failed))
            break
        if new_only and r.get("readAt"):
            continue
        if quick and r.get("readAt") and (datetime.now(IST) - datetime.fromisoformat(r["readAt"])) < timedelta(hours=1):
            continue
        try:
            try:
                page = curl(REWARD_URL.format(id=r["ad"]))
            except IOError:
                # Amazon resets the odd connection when hit steadily; one retry after a breather.
                time.sleep(PACE * 3)
                page = curl(REWARD_URL.format(id=r["ad"]))
            r.update(parse_page(page))
            r.pop("error", None)
            read += 1
            log("  %-20s %-17s %s" % (r["ad"], r["status"], (r.get("category") or r.get("unlock") or r["headline"])[:48]))
        except Exception as e:  # noqa: BLE001
            failed += 1
            r["error"] = str(e)[:120]
            log("  %-20s FAILED %s" % (r["ad"], r["error"]))
        time.sleep(PACE)

    fresh = [r for r in rewards if r.get("readAt")]
    if not fresh:
        log("nothing readable - not publishing an empty catalogue")
        sys.exit(1)

    for r in rewards:
        cat = (r.get("category") or "")
        if re.search(r"gift ?card|voucher|app store code|e-?gift", cat, re.I):
            r["sec"] = "G"
        elif r["sec"] == "X" and cat and not r.get("unlock"):
            r["sec"] = "S"
        r["url"] = REWARD_URL.format(id=r["ad"])
        r["collectUrl"] = r["url"] + "&tag=" + TAG
    catalog = {
        "builtAt": now_iso(), "tag": TAG, "read": read, "failed": failed,
        "sections": seed["sections"], "rewards": rewards,
    }
    os.makedirs(out_dir, exist_ok=True)
    for name in os.listdir(STATIC):
        shutil.copy(os.path.join(STATIC, name), os.path.join(out_dir, name))
    # cache-bust: browsers keep app.js/style.css ~10 min on Pages, so stamp every build
    idx = os.path.join(out_dir, "index.html")
    stamp = str(int(time.time()))
    with open(idx, encoding="utf-8") as f:
        page = f.read()
    page = page.replace('href="style.css"', 'href="style.css?v=%s"' % stamp).replace('src="app.js"', 'src="app.js?v=%s"' % stamp)
    with open(idx, "w", encoding="utf-8") as f:
        f.write(page)
    with open(os.path.join(out_dir, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    with open(PUBLISHED, "w", encoding="utf-8") as f:
        json.dump({"rewards": [{k: v for k, v in r.items() if k not in ("steps", "terms")} for r in rewards]},
                  f, ensure_ascii=False, indent=1)
    live = sum(1 for r in rewards if r.get("status") == "CAN_BE_COLLECTED")
    log("built %s: %d rewards, %d collectable, %d read now, %d failed" % (out_dir, len(rewards), live, read, failed))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    build(args[0] if args else os.path.join(ROOT, "_site"), quick="--quick" in sys.argv,
          harvest="--no-harvest" not in sys.argv, new_only="--new" in sys.argv)
