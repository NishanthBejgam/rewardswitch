"""Harvest Amazon Pay reward-ad ids from where people post them.

Most rewards worth having never appear on a Rewards page: gift-card and brand
cashbacks (Apple, Tanishq, the Rs200-on-Rs10k Pay eGift card...) are targeted,
and the deal groups find them and repost the URL. So the watcher reads
DesiDime (the new-deals feed and the Amazon store feed) and the public Telegram
previews (t.me/s/<channel>), and pulls out every  amzn1.rewards.rewardAd.<ID>.

The id is almost never in the page itself: DesiDime wraps every outbound link
in visit.desidime.com/visit/... and truncates the anchor text, Telegram posts
use shorteners. So each link is walked hop by hop reading only the Location
headers - the reward id shows up (url-encoded) in the first or second hop,
long before Amazon, which drops scripted clients, would be asked anything.

New ids go into seed/catalog.json under section X with the time and the post
they came from; the build then reads the page itself and files the reward by
what it says.

    python tools/harvest.py          one pass, print, update the seed

State (DesiDime deals already read, Telegram cursors, every id ever seen)
lives in seed/harvest.json. coupon-watch (AmazonGold's jewellery signal)
reads this repo's seed instead of harvesting on its own - one harvester.
"""

import io
import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "seed", "catalog.json")
STATE = os.path.join(ROOT, "seed", "harvest.json")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
RE_REWARD = re.compile(r"amzn1\.rewards\.rewardAd\.([A-Z0-9]{13}|[a-zA-Z]{3,24})")
RE_TAG = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.S)
# a post worth opening: Amazon Pay money-back of any kind
TOPIC = re.compile(r"amazon|apay|a-pay|cashback|reward|collect|gift ?card|\bgv\b|voucher|\bback\b|"
                   r"apple|tanishq|jewel|gold|coin", re.I)
SLUG_TOPIC = re.compile(r"amazon|apay|cashback|reward|collect|gift|gv|voucher|back|apple|tanishq|jewel|gold|coin")
# t.me/s/ previews that answered on 2026-09-25 (bigtricks, dealsnloot,
# IndianDealsTrick and Amazonlootdeals7 no longer publish a preview)
DEFAULT_CHANNELS = ["desidime", "dealsmagnet", "TrickXpert", "dealbee"]
DESIDIME_FEEDS = [("https://www.desidime.com/new", True),                  # everything - topic-filtered
                  ("https://www.desidime.com/stores/amazon-india", False)]  # Amazon only - read all
SKIP_LINK = re.compile(r"t\.me/|telegram\.(org|me)|hcti\.io|cdn\d?\.|whatsapp\.com|facebook\.com|"
                       r"twitter\.com|x\.com/|instagram\.com|youtube\.com|play\.google|apps\.apple|"
                       r"\.(png|jpe?g|gif|webp)(\?|$)")
KEEP_DEALS = 4000


def _curl(url, follow=True, timeout=20):
    """(status, location, body) - curl, because amazon-adjacent hosts and
    some Telegram edges reset Python's TLS handshake."""
    args = ["curl", "-sS", "--compressed", "--max-time", str(timeout), "-A", UA,
            "-H", "Accept: text/html,*/*;q=0.8", "-H", "Accept-Language: en-IN,en;q=0.9",
            "-D", "-", url]
    if follow:
        args.insert(1, "-L")
    try:
        p = subprocess.run(args, capture_output=True, timeout=timeout + 5)
    except (OSError, subprocess.TimeoutExpired) as e:
        return _urllib(url, follow, timeout, e)
    if p.returncode != 0:
        raise IOError("curl exit %d: %s" % (p.returncode, p.stderr.decode("utf-8", "replace")[:120]))
    raw = p.stdout.decode("utf-8", "replace")
    # with -L every hop's headers are printed; the body follows the last block
    status, loc, body = 0, "", raw
    while body.startswith("HTTP/"):
        head, _, body = body.partition("\r\n\r\n")
        m = re.match(r"HTTP/[\d.]+ (\d+)", head)
        status = int(m.group(1)) if m else 0
        lm = re.search(r"^location:\s*(\S+)", head, re.I | re.M)
        loc = lm.group(1) if lm else loc
    return status, loc, body


def _urllib(url, follow, timeout, why):
    if not follow:
        raise IOError("no curl: %s" % why)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")


def _get(url, timeout=20):
    status, _, body = _curl(url, timeout=timeout)
    if status >= 400:
        raise IOError("HTTP %d" % status)
    return body


def _text(h):
    return re.sub(r"\s+", " ", RE_TAG.sub(" ", h)).strip()


def _ids_in(s):
    """Reward ids in a string, however many times it was url-encoded."""
    out = set()
    for _ in range(3):
        out.update(RE_REWARD.findall(s))
        u = urllib.parse.unquote(s)
        if u == s:
            break
        s = u
    return out


def resolve(url, hops=6):
    """Walk a (short / tracking) link one hop at a time and return the reward
    ids found in any hop. Stops on arriving at amazon.in - by then the id is
    either in the URL or not there at all."""
    found = set()
    for _ in range(hops):
        found |= _ids_in(url)
        host = urllib.parse.urlparse(url).netloc.lower()
        if found or host.endswith("amazon.in") or host.endswith("amazon.com"):
            break
        try:
            status, loc, body = _curl(url, follow=False, timeout=12)
        except Exception:  # noqa: BLE001
            break
        if 300 <= status < 400 and loc:
            url = urllib.parse.urljoin(url, loc)
            continue
        found |= _ids_in(body[:300000])
        m = re.search(r'http-equiv=["\']?refresh["\']?[^>]*url=([^"\'>]+)|location(?:\.href)?\s*=\s*["\']([^"\']+)',
                      body[:300000], re.I)
        if m:
            url = urllib.parse.urljoin(url, (m.group(1) or m.group(2)).strip())
            continue
        break
    return found


# --------------------------------------------------------------------------- #
# sources
# --------------------------------------------------------------------------- #
def harvest_desidime(done, log):
    """Deals already read are remembered by number (not a high-water mark:
    DesiDime lists deals by posting time, and ids are handed out at draft)."""
    found, listed = [], []
    for feed, filtered in DESIDIME_FEEDS:
        try:
            html = _get(feed)
        except Exception as e:  # noqa: BLE001
            log("  %s: %s" % (feed, e))
            continue
        for slug, num in re.findall(r'href="/deals/([a-z0-9-]+-(\d+))', html):
            if (filtered and not SLUG_TOPIC.search(slug)) or num in done or slug in listed:
                continue
            listed.append(slug)
    for slug in listed:
        num = slug.rsplit("-", 1)[1]
        try:
            page = _get("https://www.desidime.com/deals/" + slug)
        except Exception:  # noqa: BLE001
            continue                                            # retried next tick
        done.add(num)
        ids = _ids_in(page)
        body = page[page.find("More information about the deal"):] if "More information about the deal" in page else page
        links = re.findall(r'href="(https?://visit\.desidime\.com/visit/[^"]+)"', body)
        for link in list(dict.fromkeys(links))[:5]:
            ids |= resolve(link.replace("&amp;", "&"))
        for rid in ids:
            found.append((rid, "desidime:%s" % num, slug))
    return found


def harvest_telegram(channel, cursor, log):
    found, top = [], cursor
    try:
        html = _get("https://t.me/s/%s" % channel)
    except Exception as e:  # noqa: BLE001
        log("  tg/%s: %s" % (channel, e))
        return found, cursor
    for mid, block in re.findall(r'data-post="[^/"]+/(\d+)"(.*?)(?=data-post="|$)', html, re.S):
        n = int(mid)
        top = max(top, n)
        if n <= cursor:
            continue
        body = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', block, re.S)
        text = _text(body.group(1) if body else block)
        ids = _ids_in(block)
        if TOPIC.search(text):
            for url in dict.fromkeys(re.findall(r'href="(https?://[^"]+)"', block)):
                url = url.replace("&amp;", "&")
                if not SKIP_LINK.search(url):
                    ids |= resolve(url)
        for rid in ids:
            found.append((rid, "tg:%s:%s" % (channel, mid), text[:90]))
    return found, top


# --------------------------------------------------------------------------- #
def _load(path, default):
    try:
        with io.open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def _save(path, obj, **kw):
    with io.open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2, **kw)
        fh.write("\n")


def run(log=print):
    """One pass. Returns the list of reward ids added to the seed."""
    seed = _load(SEED, {"sections": {}, "rewards": []})
    state = _load(STATE, {})
    cursors = state.setdefault("cursors", {})
    seen = state.setdefault("seen", {})
    done = set(state.get("deals", []))
    known = {r["ad"] for r in seed["rewards"]}

    got = harvest_desidime(done, log)
    chans = [c.strip() for c in os.environ.get("RS_CHANNELS", ",".join(DEFAULT_CHANNELS)).split(",") if c.strip()]
    for ch in chans:
        g, cursors["tg:" + ch] = harvest_telegram(ch, int(cursors.get("tg:" + ch, 0)), log)
        got += g

    stamp = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    added = []
    for rid, src, note in got:
        seen.setdefault(rid, {"firstSeen": stamp, "source": src, "post": note})
        if rid not in known:
            seed["rewards"].append({"ad": rid, "sec": "X", "badge": "", "source": src, "found": stamp})
            known.add(rid)
            added.append(rid)
            log("  NEW reward id %s  (%s: %s)" % (rid, src, note))

    state["deals"] = sorted(done, key=int)[-KEEP_DEALS:]
    cursors.pop("desidime", None)                    # old high-water mark, replaced by "deals"
    state["checkedAt"] = stamp
    if added:
        _save(SEED, seed)
    _save(STATE, state, sort_keys=True)
    log("harvest: %d ids seen, %d new%s" % (len(got), len(added), (": " + " ".join(added)) if added else ""))
    return added


if __name__ == "__main__":
    run()
