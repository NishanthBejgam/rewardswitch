/* Reward Switch — public site. Reads catalog.json (built every two hours) and never
   touches the visitor's Amazon account: "Collect" is a link to Amazon's own page. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  // Buyer-facing groups. Amazon's own reward pages name a narrow category per reward
  // ("Kitchen and dining", "Prescription and OTC medicines"); those roll up into the
  // few things a shopper actually thinks in. Unknown categories fall into "other".
  const SHOP_GROUPS = [
    ["electronics", "Electronics", /electronic|mobile|laptop|computer|\btv\b|television|headphone|camera|smart ?watch|tablet/i],
    ["fashion", "Fashion", /fashion|beauty|cloth|apparel|shoe|footwear|jewel|watch|bag|bazaar/i],
    ["home", "Home", /home|kitchen|dining|vacuum|furniture|appliance|decor|mattress/i],
    ["daily", "Groceries", /essential|grocer|fresh|pantry|household|baby|pet/i],
    ["health", "Medicines", /medicine|pharma|otc|health|wellness/i],
    ["gift", "Gift cards", /gift ?card|e-?gift|voucher|app store code/i],
  ];
  const KINDS = [
    ["shop", "Shopping", "Cashback on an Amazon order — some on any order, some on one category only"],
    ["gift", "Gift cards", "Amazon Pay, app-store and brand gift cards bought on Amazon"],
    ["bills", "Bills", "Mobile, DTH, electricity, credit-card bills and Add Money"],
    ["food", "Food apps", "Swiggy, Zomato and other apps paid with Amazon Pay"],
    ["travel", "Travel", "Flights, buses, trains and hotels"],
    ["store", "Shops", "Scan-and-pay with Amazon Pay UPI at stores near you"],
    ["money", "Send money", "UPI transfers to friends and family"],
    ["mission", "Missions", "Do a task first (e.g. a first UPI payment) to unlock a reward"],
  ];
  const KIND_NAME = Object.fromEntries(KINDS.map(([k, n]) => [k, n]));
  const ICON = {
    S: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
    G: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13"/><path d="M12 8c-2-3-6-3-6 0s4 2 6 0c2-3 6-3 6 0s-4 2-6 0"/></svg>',
    C: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>',
    F: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16a8 8 0 0 0-16 0z"/><path d="M3 15h18"/><path d="M5 19h14"/></svg>',
    T: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16l20-8-6 12-3-6z"/></svg>',
    B: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
    O: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M10 20v-6h4v6"/></svg>',
    M: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="m14 6 6 6-6 6"/></svg>',
    W: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>',
    U: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>',
    X: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v13"/><path d="m8 7 4-4 4 4"/></svg>',
    electronics: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    fashion: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/></svg>',
    home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
    daily: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    health: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/></svg>',
    other: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
    All: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  };

  const S = { rewards: [], amount: 0, cat: "", kind: "All", state: "live", q: "" };
  const KIND_ICON = { shop: "S", gift: "G", bills: "B", food: "F", travel: "T", store: "O", money: "M", mission: "W" };
  const kindIcon = (k) => ICON[KIND_ICON[k] || k] || ICON.All;

  // ---- theme
  const theme = localStorage.getItem("rs-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  $("#themeBtn").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; localStorage.setItem("rs-theme", t); };

  // ---- helpers
  function snack(msg) { const el = $("#snack"); el.textContent = msg; el.className = "snack show"; clearTimeout(el._t); el._t = setTimeout(() => (el.className = "snack"), 3200); }
  function titleCase(s) { return s.replace(/\band\b/g, "&").replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bOtc\b/, "OTC").replace(/\bUpi\b/, "UPI"); }
  function categoryOf(r) { return r.category ? titleCase(r.category.trim().replace(/\s+shopping$/i, "")) : ""; }
  function isMission(r) { return r.sec === "W" || r.sec === "U" || (!!r.unlock && !r.category); }
  function isSitewide(r) { return /^(all )?amazon(\.in)?( shopping)?$/i.test(categoryOf(r)); }
  function isLive(r) { return r.status === "CAN_BE_COLLECTED"; }
  function shopGroup(r) { const c = categoryOf(r); if (!c || isSitewide(r)) return ""; const g = SHOP_GROUPS.find(([, , re]) => re.test(c)); return g ? g[0] : "other"; }
  function kindOf(r) {
    if (isMission(r)) return "mission";
    if (r.sec === "G" || shopGroup(r) === "gift") return "gift";
    return { B: "bills", F: "food", T: "travel", O: "store", M: "money" }[r.sec] || "shop";
  }
  function logoName(r) { const n = (r.logo || "").split("/").pop().split(".")[0].replace(/_CB\d+/g, "").replace(/logo|text|temp|merch|final|new|\d+|D\d+_IN_[A-Z]+/gi, " ").replace(/[-_]+/g, " ").trim(); return n.split(" ").filter(Boolean).map((w) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(" "); }
  function displayName(r) { if (isMission(r)) return r.headline && !/offers worth|surprise/i.test(r.headline) ? r.headline : (r.unlock || logoName(r) || "Mission"); return categoryOf(r) || logoName(r) || r.headline || r.ad; }
  function methodOf(r) { const b = (r.badge || "").trim(); if (!b || /just for prime|top brand/i.test(b)) return ""; return titleCase(b.replace(/^using\s*/i, "").toLowerCase()).replace(/\bSbi\b/, "SBI").replace(/\bHdfc\b/, "HDFC").replace(/\bScb\b/, "SCB"); }
  function effective(r, amt) {
    if (!amt) return null; const min = r.minOrder || 0; if (amt < min) return { short: min - amt, value: 0 };
    let v = 0; if (r.pct && r.cap) v = Math.min((r.pct / 100) * amt, r.cap); else if (r.pct) v = (r.pct / 100) * amt; else v = r.cap || 0;
    return { value: v, lucky: r.lucky, capped: r.pct && r.cap && (r.pct / 100) * amt > r.cap };
  }
  function maxValue(r) { return r.worth || r.cap || 0; }
  function offerLine(r) { if (r.worth) return `${r.worthCount ? r.worthCount + " offers worth " : ""}${inr(r.worth)}`; if (r.pct && r.cap) return `${r.pct}% back, up to ${inr(r.cap)}`; if (r.pct) return `${r.pct}% back`; if (r.lucky) return `win up to ${inr(r.cap)}`; if (r.cap) return `flat ${inr(r.cap)} back`; return r.headline || ""; }
  function windowText(r) { return r.window ? r.window.replace(/-20\d\d/g, "").replace(" to ", " → ") : (r.validTill ? "till " + r.validTill : ""); }
  function statusTag(r) { return isLive(r) ? '<span class="tag live">Live</span>' : r.status === "LOCKED" ? '<span class="tag locked">Locked</span>' : '<span class="tag off">Not live</span>'; }
  function newTag(r) { const t = r.found ? Date.parse(r.found.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN; return t && Date.now() - t < 72 * 3600e3 ? '<span class="tag new">New</span>' : ""; }
  function primeTag(r) { return /prime/i.test(r.badge) ? '<span class="tag prime">Prime</span>' : ""; }
  function collectBtn(r, grad) {
    if (isMission(r) || !isLive(r)) return `<a class="btn btn-tonal btn-sm link-btn" href="${esc(r.collectUrl)}" target="_blank" rel="noopener sponsored">${isMission(r) ? "See on Amazon" : "View on Amazon"} ↗</a>`;
    return `<a class="btn ${grad ? "btn-grad" : "btn-filled"} btn-sm link-btn" href="${esc(r.collectUrl)}" target="_blank" rel="noopener sponsored">Collect on Amazon ↗</a>`;
  }

  // ---- planner
  // Step 2 choices: the shopping groups first, then the kinds paid outside an Amazon order.
  function choices() {
    const live = (f) => S.rewards.filter((r) => !isMission(r) && isLive(r) && f(r)).length;
    const shop = SHOP_GROUPS.map(([g, n]) => ({ id: g, name: n, live: live((r) => g === "gift" ? kindOf(r) === "gift" : kindOf(r) === "shop" && shopGroup(r) === g), any: S.rewards.some((r) => !isMission(r) && (g === "gift" ? kindOf(r) === "gift" : shopGroup(r) === g)) }))
      .filter((c) => c.any);
    shop.push({ id: "other", name: "Anything else", live: live((r) => kindOf(r) === "shop" && (isSitewide(r) || shopGroup(r) === "other")) });
    const pay = KINDS.filter(([k]) => !["shop", "gift", "mission"].includes(k)).map(([k, n]) => ({ id: "k:" + k, name: n, live: live((r) => kindOf(r) === k) })).filter((c) => c.live);
    return { shop, pay };
  }
  function choiceName(id) { const all = choices(); return ([...all.shop, ...all.pay].find((c) => c.id === id) || {}).name || id; }
  function rows() {
    if (!S.cat) return [];
    const amt = S.amount;
    const match = S.cat.startsWith("k:") ? (r) => kindOf(r) === S.cat.slice(2)
      : S.cat === "gift" ? (r) => kindOf(r) === "gift"
      : (r) => kindOf(r) === "shop" && (isSitewide(r) || shopGroup(r) === S.cat);
    return S.rewards.filter((r) => !isMission(r) && match(r))
      .map((r) => ({ r, e: amt ? effective(r, amt) : null }))
      .sort((a, b) => (isLive(b.r) - isLive(a.r)) || (amt ? (b.e.value - a.e.value) || (a.e.short || 0) - (b.e.short || 0) : maxValue(b.r) - maxValue(a.r)));
  }
  function renderPlanner() {
    $("#quick").innerHTML = [500, 1000, 2500, 5000, 15000].map((v) => `<button data-v="${v}"${S.amount === v ? ' class="is-active"' : ""}>${inr(v)}</button>`).join("");
    $$("#quick button").forEach((b) => (b.onclick = () => { $("#amount").value = b.dataset.v; S.amount = +b.dataset.v; renderPlanner(); }));
    const { shop, pay } = choices();
    const chip = (c) => `<button class="chip${S.cat === c.id ? " is-active" : ""}" data-cat="${esc(c.id)}"><span class="glyph">${kindIcon(c.id.replace(/^k:/, ""))}</span>${esc(c.name)}${c.live ? `<span class="count">${c.live}</span>` : ""}</button>`;
    $("#catRow").innerHTML = `<div class="cat-label">On Amazon</div><div class="cat-row">${shop.map(chip).join("")}</div>` +
      (pay.length ? `<div class="cat-label">Elsewhere with Amazon Pay</div><div class="cat-row">${pay.map(chip).join("")}</div>` : "");
    $$("#catRow button").forEach((b) => (b.onclick = () => { S.cat = S.cat === b.dataset.cat ? "" : b.dataset.cat; renderPlanner(); }));
    const list = $("#planList"), note = $("#planNote"), title = $("#planTitle");
    if (!S.cat) { title.textContent = "Applicable rewards"; list.innerHTML = `<div class="plan-empty">Pick a category above — only the rewards that apply to it will show here, best first.</div>`; note.textContent = ""; renderVerdict([], null); return; }
    const rs = rows(); const amt = S.amount;
    const best = amt ? rs.find((x) => isLive(x.r) && x.e && x.e.value > 0) : null; const bestId = best ? best.r.ad : null;
    title.textContent = `Applicable rewards for ${choiceName(S.cat)}` + (amt ? ` at ${inr(amt)}` : "");
    if (!rs.length) { list.innerHTML = `<div class="plan-empty">No known reward covers this right now.</div>`; note.textContent = ""; renderVerdict([], null); return; }
    list.innerHTML = rs.map(({ r, e }, i) => {
      const name = displayName(r); const short = amt && e && e.short; const off = !isLive(r);
      const val = !amt ? `<b>${r.lucky ? "≤" : ""}${inr(maxValue(r))}</b><small>max</small>` : short ? `<b class="dim">${inr(r.minOrder)}</b><small>min order</small>` : `<b>${inr(e.value)}</b><small>you get</small>`;
      const bits = [offerLine(r)]; if (r.minOrder) bits.push("min " + inr(r.minOrder)); const m = methodOf(r); if (m) bits.push("pay with " + m); const w = windowText(r); if (w) bits.push(w);
      return `<div class="prow${r.ad === bestId ? " is-best" : ""}${short ? " is-short" : ""}${off ? " is-off" : ""}">
        <span class="rank">${i + 1}</span>
        <div class="p-main">
          <div class="p-name">${esc(name)}${isSitewide(r) ? ' <span class="tag">any order</span>' : shopGroup(r) && S.cat !== "gift" ? ' <span class="tag">this category only</span>' : ""}${newTag(r)}${primeTag(r)}${off ? statusTag(r) : ""}${r.ad === bestId ? ' <span class="tag best">pick this</span>' : ""}</div>
          <div class="p-sub">${esc(bits.join(" · "))}${short ? ` · <span class="warn">needs ${inr(e.short)} more</span>` : ""}</div>
        </div>
        <div class="p-val">${val}</div>
        <div class="p-act">${collectBtn(r, r.ad === bestId)}<button class="icon-btn sm" title="Details" data-details="${esc(r.ad)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button></div>
      </div>`;
    }).join("");
    note.textContent = amt ? (rs.length > 1 ? "One reward applies per order — they can't be clubbed. Collect the top one, then shop." : "") : "Enter the amount to see the exact ₹ you'd get back.";
    $$("button[data-details]", list).forEach((b) => (b.onclick = () => openSheet(b.dataset.details)));
    renderVerdict(rs, bestId);
  }
  function renderVerdict(rs, bestId) {
    const v = $("#verdict"), runners = $("#runners");
    const liveCount = S.rewards.filter(isLive).length;
    if (!S.cat) {
      v.className = "verdict empty";
      v.innerHTML = `<div class="v-eyebrow">Your pick will appear here</div><div class="v-title">${liveCount} rewards are live right now</div><div class="v-sub">Enter what you're spending and pick a category on the left — the reward that pays the most shows up here with a Collect button.</div>`;
      runners.innerHTML = ""; return;
    }
    const amt = S.amount;
    const top = amt ? rs.find((x) => x.r.ad === bestId) : rs.find((x) => isLive(x.r));
    if (!top) {
      const nearest = amt ? rs.filter((x) => x.e && x.e.short).sort((a, b) => a.e.short - b.e.short)[0] : null;
      v.className = "verdict empty";
      v.innerHTML = `<div class="v-eyebrow">Nothing pays out yet</div><div class="v-title">${nearest ? `${esc(displayName(nearest.r))} needs ${inr(nearest.e.short)} more` : "No live reward covers this"}</div><div class="v-sub">${nearest ? `Min order is ${inr(nearest.r.minOrder)}.` : "Check back after the next refresh, or browse everything below."}</div>`;
      runners.innerHTML = ""; return;
    }
    const r = top.r, e = top.e;
    v.className = "verdict";
    v.innerHTML = `<div class="v-eyebrow">Switch on this one</div>
      <div class="v-amount">${e ? (e.lucky ? "up to " : "") + inr(e.value) : (r.lucky ? "≤" : "") + inr(maxValue(r))}<small>${e ? "back on " + inr(amt) : "max back"}</small></div>
      <div class="v-title">${esc(displayName(r))} · ${esc(offerLine(r))}</div>
      <div class="v-sub">${esc([r.minOrder ? "min order " + inr(r.minOrder) : "", windowText(r), r.timesPerUser === 1 ? "once per user" : r.timesPerUser ? r.timesPerUser + "× per user" : "", methodOf(r) ? "pay with " + methodOf(r) : ""].filter(Boolean).join(" · "))}${e && e.capped ? " · capped at " + inr(r.cap) : ""}</div>
      <div class="v-actions"><a class="btn btn-white btn-sm link-btn" href="${esc(r.collectUrl)}" target="_blank" rel="noopener sponsored">Collect on Amazon ↗</a><button class="btn btn-ghost btn-sm" data-details="${esc(r.ad)}">Details</button></div>`;
    $$("button[data-details]", v).forEach((b) => (b.onclick = () => openSheet(b.dataset.details)));
    const rest = rs.filter((x) => x.r !== r && isLive(x.r) && (!amt || (x.e && x.e.value > 0))).slice(0, 3);
    runners.innerHTML = rest.map((x) => `<div class="runner"><span class="r-name">${esc(displayName(x.r))}</span><span class="r-why">${esc(offerLine(x.r))}</span><span class="r-amt">${amt ? (x.e.lucky ? "≤" : "") + inr(x.e.value) : "≤" + inr(maxValue(x.r))}</span></div>`).join("") + (rest.length ? `<div class="small muted" style="padding:2px 6px">Rewards can't be clubbed — one applies per order.</div>` : "");
  }

  // ---- browse
  function renderFilters() {
    const counts = {}; for (const r of S.rewards) { const k = kindOf(r); counts[k] = (counts[k] || 0) + 1; }
    const keys = ["All", ...KINDS.map(([k]) => k).filter((k) => counts[k])];
    $("#sectionRow").innerHTML = keys.map((k) => `<button class="chip${S.kind === k ? " is-active" : ""}" data-kind="${k}"><span class="glyph">${kindIcon(k)}</span>${k === "All" ? "All" : esc(KIND_NAME[k])}<span class="count">${k === "All" ? S.rewards.length : counts[k]}</span></button>`).join("");
    $$("#sectionRow button").forEach((b) => (b.onclick = () => { S.kind = b.dataset.kind; renderFilters(); renderBoard(); }));
    $$("#stateSeg button").forEach((b) => { b.classList.toggle("is-active", b.dataset.v === S.state); b.onclick = () => { S.state = b.dataset.v; renderFilters(); renderBoard(); }; });
  }
  function filtered() {
    const q = S.q.trim().toLowerCase();
    return S.rewards.filter((r) => {
      if (S.kind !== "All" && kindOf(r) !== S.kind) return false;
      if (S.state === "live" && !isLive(r) && r.status !== "LOCKED") return false;
      if (q) { const hay = [displayName(r), r.headline, r.sub, r.badge, r.category, r.unlock, logoName(r)].join(" ").toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }
  function renderBoard() {
    const board = $("#board"); const list = filtered();
    if (!list.length) { board.innerHTML = `<div class="empty">Nothing matches.</div>`; return; }
    const groups = new Map(); for (const r of list) { const k = kindOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    board.innerHTML = KINDS.filter(([k]) => groups.has(k)).map(([k, name, blurb]) => {
      const g = groups.get(k).sort((a, b) => (isLive(b) - isLive(a)) || maxValue(b) - maxValue(a));
      return `<section><div class="section-head"><span class="glyph">${kindIcon(k)}</span><span class="title">${esc(name)}</span><span class="count">${g.length}</span><span class="blurb">${esc(blurb)}</span></div><div class="grid">${g.map(card).join("")}</div></section>`;
    }).join("");
    $$("button[data-details]", board).forEach((b) => (b.onclick = () => openSheet(b.dataset.details)));
  }
  function card(r) {
    const name = displayName(r); const mission = isMission(r);
    const tags = [newTag(r), statusTag(r), primeTag(r)]; const m = methodOf(r); if (m) tags.push(`<span class="tag method">${esc(m)}</span>`); if (r.lucky) tags.push('<span class="tag lucky">Scratch</span>'); if (r.timesPerUser > 1) tags.push(`<span class="tag">${r.timesPerUser}× uses</span>`);
    const big = mission ? (r.worth ? `${inr(r.worth)}<small>${r.worthCount ? r.worthCount + " offers" : "to unlock"}</small>` : esc(r.headline || "Surprise")) : r.pct ? `${r.pct}%<small>back</small>` : r.cap ? `${r.lucky ? "≤" : ""}${inr(r.cap)}<small>${r.flat ? "flat" : "back"}</small>` : esc(r.headline);
    const capTxt = !mission && r.pct && r.cap ? `up to ${inr(r.cap)}` : "";
    const meta = []; if (r.minOrder) meta.push(`min <b>${inr(r.minOrder)}</b>`); const w = windowText(r); if (w) meta.push(esc(w));
    const logo = r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy" data-fallback="${esc(name.slice(0, 3).toUpperCase())}">` : `<span class="fallback">${esc(name.slice(0, 3).toUpperCase())}</span>`;
    const body = mission
      ? `<div class="mission-step"><span class="n">Do</span><span class="card-title">${esc(r.unlock || name)}</span></div><div class="mission-step"><span class="n">Get</span><span class="card-offer"><span class="big">${big}</span></span></div>`
      : `<div class="card-title">${esc(name)}</div><div class="card-offer"><span class="big">${big}</span>${capTxt ? `<span class="cap">${capTxt}</span>` : ""}</div>`;
    return `<article class="card${mission ? " is-mission" : ""}${!isLive(r) ? " is-expired" : ""}">
      <div class="card-top"><span class="logo">${logo}</span><div class="tags">${tags.join("")}</div></div>
      ${body}
      <div class="meta">${meta.map((x) => `<span class="k">${x}</span>`).join("")}</div>
      <div class="card-actions"><span class="grow">${collectBtn(r, false)}</span><button class="icon-btn" style="width:34px;height:34px" title="Details" data-details="${esc(r.ad)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg></button></div>
    </article>`;
  }

  // ---- details sheet
  function openSheet(ad) {
    const r = S.rewards.find((x) => x.ad === ad); if (!r) return;
    const kv = [[isMission(r) ? "Mission" : "Category", isMission(r) ? (r.unlock || displayName(r)) : (categoryOf(r) || "—")], ["Offer", offerLine(r)], ["Min order", r.minOrder ? inr(r.minOrder) : "—"], ["Window", r.window || ("till " + (r.validTill || "—"))], ["Uses per user", r.timesPerUser || "—"], ["Pay with", methodOf(r) || "any"], ["Status on Amazon", r.status || "—"], ["Last checked", r.readAt ? new Date(r.readAt).toLocaleString("en-IN") : "—"]];
    const host = $("#sheetHost");
    host.innerHTML = `<div class="sheet-scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head"><h3>${esc(displayName(r))}</h3><button class="icon-btn" id="closeSheet" title="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="kv">${kv.map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("")}</div>
      ${r.steps ? `<h4>How to redeem</h4><div class="prose">${esc(r.steps.replace(/ (\d)\. /g, "\n$1. ").replace(/Steps to redeem Follow the steps below to redeem the reward: ?/, ""))}</div>` : ""}
      ${r.terms ? `<h4>Terms &amp; conditions</h4><div class="prose terms">${esc(r.terms.replace(/ (\d{1,2})\. /g, "\n$1. "))}</div>` : ""}
      <p style="margin-top:14px">${collectBtn(r, isLive(r) && !isMission(r))}</p>
    </div></div>`;
    const close = () => (host.innerHTML = "");
    $("#closeSheet").onclick = close; $("#scrim").onclick = (e) => { if (e.target.id === "scrim") close(); };
    document.addEventListener("keydown", function esc_(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc_); } });
  }

  // ---- wiring
  document.addEventListener("error", (e) => { const img = e.target; if (img && img.tagName === "IMG" && img.dataset.fallback !== undefined) img.parentNode.innerHTML = `<span class="fallback">${esc(img.dataset.fallback)}</span>`; }, true);
  $("#amount").addEventListener("input", (e) => { S.amount = +e.target.value || 0; renderPlanner(); });
  $("#q").addEventListener("input", (e) => { S.q = e.target.value; renderBoard(); });

  fetch("catalog.json", { cache: "no-store" }).then((r) => r.json()).then((c) => {
    S.rewards = (c.rewards || []).filter((r) => r.readAt);
    const live = S.rewards.filter(isLive).length;
    $("#stamp").innerHTML = `<b>${live}</b> live of ${S.rewards.length}<br>checked ${new Date(c.builtAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    $("#browseCount").textContent = S.rewards.length;
    renderPlanner(); renderFilters(); renderBoard();
  }).catch((e) => { $("#planList").innerHTML = `<div class="plan-empty">Could not load the catalogue: ${esc(e.message)}</div>`; });
})();
