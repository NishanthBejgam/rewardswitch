# Reward Switch

**https://rewardswitch.yourcardjourney.store** — every Amazon Pay cashback reward we
know of, named by the category it actually applies to.

Amazon shows each reward as "GET UP TO ₹300 BACK" and a logo; the category, window
and per-user limit are only on the reward's own page. This site reads those pages
(logged out — they answer with `rewardStatus`, headline, terms and redeem steps),
and lays them out so a visitor can:

1. enter an amount and pick what they are buying,
2. see only the rewards that apply, ranked by what they would actually get back,
3. **Collect on Amazon** — a link to Amazon's own reward page, where Amazon decides
   eligibility on the visitor's own account (no login here, no cookies, nothing stored).

## How it is built

```
GitHub Actions, every 2 h (13 and 43 past, alternating)
  └─ python tools/build_site.py _site   reads each id in seed/catalog.json
                                          └─ _site/catalog.json + the page → Pages
```

- `tools/harvest.py` — runs first in every build: scrapes DesiDime's new-deals feed and public Telegram
  channel previews for `rewardAd.<ID>` links (following shortened URLs) and appends new ids to the seed.
  Gift-card / brand rewards are targeted and never show on a Rewards page, so this is how they arrive.
- `seed/catalog.json` — the ids we know: harvested from a real Rewards page (section
  + list-only badge per id), the stable vanity slugs (`sendMoney`, `jewellery`, …) and
  ids shared by deal groups. Add new ids here; everything else is read from Amazon.
- `seed/published.json` — last good read per id, so a fresh runner never publishes
  an empty board and a page that fails keeps its last values with its real age.
- `tools/static/` — the page. `tools/build_site.py` copies it next to `catalog.json`.
- `Publish Catalog.cmd` — sweep from this PC and push the seed (use after adding ids).

`RS_TAG` (default `ycj05-21`) is the Associates tag on the Collect links.

Local preview: `python tools/build_site.py _site` then serve `_site/` (launch.json
has `rewardswitch-site` on 4325).
