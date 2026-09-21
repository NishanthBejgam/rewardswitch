"""Harvest Amazon Pay reward-ad ids from where people post them.

Most rewards worth having never appear on a Rewards page: gift-card and brand
cashbacks (Apple, Tanishq, ...) are targeted, and the deal groups find them
and repost the URL. So the build reads DesiDime's new-deals feed and the
public Telegram previews (t.me/s/<channel>), follows every link (they are
nearly always shortened), and pulls out every  amzn1.rewards.rewardAd.<ID>.
New ids go into seed/catalog.json under section X; the build then reads the
page itself and files the reward by what it says.

    python tools/harvest.py          one pass, print, update the seed

Lifted from coupon-watch's watcher (same feeds, same regexes); state
(cursors per feed) lives in seed/harvest.json.
"""

import io
import json
import os
import re
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "seed", "catalog.json")
STATE = os.path.join(ROOT, "seed", "harvest.json")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
RE_REWARD = re.compile(r"amzn1\.rewards\.rewardAd\.([A-Z0-9]{13}|[a-zA-Z]{3,24})")
RE_TAG = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.S)
TOPIC = re.compile(r"amazon|cashback|reward|collect|gift ?card|voucher|apple|tanishq|jewel|gold|coin", re.I)
DEFAULT_CHANNELS = ["desidime", "dealsmagnet", "Amazonlootdeals7", "bigtricks", "IndianDealsTrick", "dealsnloot"]


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.geturl(), r.read().decode("utf-8", "replace")


def _text(h):
    return re.sub(r"\s+", " ", RE_TAG.sub(" ", h)).strip()


def harvest_desidime(cursor, log):
    found, top = [], cursor
    try:
        _, html = _get("https://www.desidime.com/new")
    except Exception as e:  # noqa: BLE001
        log("  desidime: %s" % e)
        return found, cursor
    seen = set()
    for slug, num in re.findall(r'href="/deals/([a-z0-9-]+-(\d+))', html):
        n = int(num)
        top = max(top, n)
        if n <= cursor or slug in seen or not TOPIC.search(slug):
            continue
        seen.add(slug)
        try:
            _, page = _get("https://www.desidime.com/deals/" + slug)
        except Exception:  # noqa: BLE001
            continue
        for rid in set(RE_REWARD.findall(page)):
            found.append((rid, "desidime:%s" % num))
    return found, top


def harvest_telegram(channel, cursor, log):
    found, top = [], cursor
    try:
        _, html = _get("https://t.me/s/%s" % channel)
    except Exception as e:  # noqa: BLE001
        log("  tg/%s: %s" % (channel, e))
        return found, cursor
    for mid, block in re.findall(r'data-post="[^/"]+/(\d+)"(.*?)(?=data-post="|$)', html, re.S):
        n = int(mid)
        top = max(top, n)
        if n <= cursor or not TOPIC.search(_text(block)):
            continue
        for rid in set(RE_REWARD.findall(block)):
            found.append((rid, "tg:%s:%s" % (channel, mid)))
        for url in set(re.findall(r'href="(https?://[^"]+)"', block)):
            if re.search(r"t\.me/|telegram\.org|hcti\.io|cdn\d?\.", url):
                continue
            try:
                final, page = _get(url, timeout=12)
            except Exception:  # noqa: BLE001
                continue
            for rid in set(RE_REWARD.findall(final) + RE_REWARD.findall(page[:400000])):
                found.append((rid, "tg:%s:%s" % (channel, mid)))
    return found, top


def _load(path, default):
    try:
        with io.open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def run(log=print):
    seed = _load(SEED, {"sections": {}, "rewards": []})
    state = _load(STATE, {"cursors": {}, "seen": {}})
    cursors = state["cursors"]
    known = {r["ad"] for r in seed["rewards"]}
    new = []
    got, cursors["desidime"] = harvest_desidime(int(cursors.get("desidime", 0)), log)
    new += got
    chans = [c for c in os.environ.get("RS_CHANNELS", ",".join(DEFAULT_CHANNELS)).split(",") if c.strip()]
    for ch in chans:
        got, cursors["tg:" + ch] = harvest_telegram(ch.strip(), int(cursors.get("tg:" + ch, 0)), log)
        new += got
    added = 0
    for rid, src in new:
        state["seen"].setdefault(rid, {"firstSeen": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "source": src})
        if rid not in known:
            seed["rewards"].append({"ad": rid, "sec": "X", "badge": "", "source": src})
            known.add(rid)
            added += 1
            log("  new reward id %s (%s)" % (rid, src))
    with io.open(SEED, "w", encoding="utf-8") as fh:
        json.dump(seed, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    with io.open(STATE, "w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")
    log("harvest: %d ids seen, %d new" % (len(new), added))
    return added


if __name__ == "__main__":
    run()
