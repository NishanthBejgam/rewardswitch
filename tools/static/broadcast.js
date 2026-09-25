/* Reward Switch — the broadcast drawer.

   Loaded only in a browser that has visited /#broadcast (app.js keeps the flag).
   Whatever the planner is showing — the amount, the category picked, and the reward
   the right-hand card switched on — becomes two copies: a PNG snapshot of that
   choice and a WhatsApp / X caption with the saving worked out. Nothing posts on
   your behalf. app.js calls RSBroadcast.changed() whenever the pick moves. */
(() => {
  const SITE = "https://rewardswitch.yourcardjourney.store";
  const CREDIT = "@YourCardJourney";
  const $ = (s) => document.querySelector(s);
  const RS = window.RS;
  let chan = "whatsapp";
  let dirty = false; // the user edited the caption; don't overwrite it until the pick changes

  // ---------------------------------------------------------------- drawer
  const host = document.createElement("div");
  host.innerHTML = `<div class="bc-scrim" id="bcScrim" hidden>
    <section class="bc" role="dialog" aria-modal="true" aria-labelledby="bcTitle">
      <header class="bc-head">
        <div><h2 id="bcTitle">Broadcast this pick</h2><p id="bcSub">—</p></div>
        <button class="icon-btn" id="bcClose" type="button" title="Close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="bc-body">
        <div class="bc-pane">
          <div class="bc-snap"><canvas id="bcCanvas" width="1200" height="675" aria-label="Snapshot of the pick"></canvas></div>
          <div class="bc-actions">
            <button type="button" class="btn btn-grad btn-sm" id="bcCopyImg">Copy image</button>
            <button type="button" class="btn btn-tonal btn-sm" id="bcDlImg">Download PNG</button>
          </div>
        </div>
        <div class="bc-pane">
          <div class="seg" id="bcChan"><button data-v="whatsapp" class="is-active">WhatsApp</button><button data-v="x">X</button></div>
          <textarea id="bcOut" class="bc-text" spellcheck="false" aria-label="Caption"></textarea>
          <div class="bc-actions">
            <button type="button" class="btn btn-grad btn-sm" id="bcCopyText">Copy text</button>
            <button type="button" class="btn btn-tonal btn-sm" id="bcOpen">Copy &amp; open WhatsApp</button>
            <span class="bc-count" id="bcCount"></span>
          </div>
        </div>
      </div>
      <footer class="bc-foot"><b>Two pastes.</b> Copy the image and paste it into the chat, then paste the text as its caption. The Collect link carries your affiliate tag.</footer>
    </section>
  </div>`;
  document.body.appendChild(host.firstElementChild);

  const btn = $("#bcBtn"); btn.hidden = false;
  const scrim = $("#bcScrim");
  const open = () => { scrim.hidden = false; dirty = false; draw(); document.body.style.overflow = "hidden"; };
  const close = () => { scrim.hidden = true; document.body.style.overflow = ""; };
  btn.onclick = open;
  $("#bcClose").onclick = close;
  scrim.onclick = (e) => { if (e.target === scrim) close(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !scrim.hidden) close(); });
  document.querySelectorAll("#bcChan button").forEach((b) => (b.onclick = () => {
    chan = b.dataset.v; dirty = false;
    document.querySelectorAll("#bcChan button").forEach((x) => x.classList.toggle("is-active", x === b));
    $("#bcOpen").textContent = chan === "x" ? "Copy & open X" : "Copy & open WhatsApp";
    draw();
  }));
  $("#bcOut").addEventListener("input", () => { dirty = true; count(); });

  // ---------------------------------------------------------------- numbers
  function facts() {
    const p = RS.pick(); if (!p) return null;
    const { r, e, amount } = p;
    const name = RS.displayName(r);
    const subs = p.subs.filter((x) => x.toLowerCase() !== p.cat.toLowerCase());
    const cat = subs.length ? `${p.cat}: ${subs.join(" + ")}` : p.cat;
    const save = e ? e.value : RS.maxValue(r);
    const lucky = e ? e.lucky : r.lucky;
    const bits = [];
    if (r.minOrder) bits.push("min order " + RS.inr(r.minOrder));
    const w = RS.windowText(r); if (w) bits.push(w);
    if (r.timesPerUser === 1) bits.push("once per user");
    const m = RS.methodOf(r); if (m) bits.push("pay with " + m);
    return {
      r, amount, cat, name, lucky, save,
      offer: RS.offerLine(r),
      pct: amount && save ? Math.round((save / amount) * 1000) / 10 : 0,
      pay: amount ? amount - (lucky ? 0 : save) : 0,
      bits, window: w, method: m, link: r.collectUrl,
    };
  }

  // ---------------------------------------------------------------- caption
  function caption(f) {
    const inr = RS.inr, B = (t) => (chan === "whatsapp" ? `*${t}*` : t);
    const saveTxt = (f.lucky ? "up to " : "") + inr(f.save);
    const lines = [
      `🎁 ${B("Amazon Pay reward pick")}`,
      "",
      `🛒 Buying: ${B(f.cat)}`,
      f.amount ? `💵 Spending: ${B(inr(f.amount))}` : null,
      "",
      `✅ Collect this reward: ${B(f.name)} (${f.offer})`,
      f.amount ? `💰 You get ${B(saveTxt + " back")}${f.pct && !f.lucky ? ` (${f.pct}%)` : ""}${f.lucky ? "" : `, so you effectively pay ${B(inr(f.pay))}`}` : `💰 Worth ${B(saveTxt)} back`,
      f.bits.length ? `📌 ${f.bits.join(" · ")}` : null,
      "",
      `👉 Collect it on Amazon first, then shop: ${f.link}`,
      "",
      `📊 Find the best reward for your own cart: ${SITE}`,
      "",
      "⚠️ One reward per order. Amazon decides eligibility on your account.",
      "⚠️ Affiliate: I may earn a commission, at no extra cost to you.",
      "",
      `- Shared by ${CREDIT}`,
    ];
    if (chan === "x") return lines.filter((l) => l !== null && !/^⚠️ One reward|^📌/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n");
    return lines.filter((l) => l !== null).join("\n");
  }
  function count() { const n = $("#bcOut").value.length; $("#bcCount").textContent = chan === "x" ? `${n} chars${n > 280 ? " · long post" : ""}` : `${n} chars`; }

  // ---------------------------------------------------------------- snapshot
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let logo = null;
  (() => { const i = new Image(); i.onload = () => { logo = i; if (!scrim.hidden) draw(); }; i.src = "yourcardjourney.png"; })();

  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function chipW(c, t, font) { c.font = font; return c.measureText(t).width; }
  // Draw pill chips left-to-right, wrapping inside [x, x+maxW]. Returns the y after the last row.
  function chips(c, items, x, y, maxW) {
    let cx = x, cy = y; const h = 46;
    for (const it of items) {
      const font = `${it.bold ? 700 : 600} 21px "Segoe UI", Roboto, system-ui, sans-serif`;
      const w = chipW(c, it.text, font) + (it.tick ? 58 : 38);
      if (cx + w > x + maxW && cx > x) { cx = x; cy += h + 10; }
      rr(c, cx, cy, w, h, 23);
      c.fillStyle = it.on ? "#ffe3d3" : "#f2ece7"; c.fill();
      c.lineWidth = 2; c.strokeStyle = it.on ? "#f0a47e" : "#e6dcd4"; c.stroke();
      c.fillStyle = it.on ? "#8c2d05" : "#24160f"; c.font = font; c.textBaseline = "middle";
      c.fillText((it.tick ? "✓  " : "") + it.text, cx + 19, cy + h / 2 + 1);
      cx += w + 10;
    }
    return cy + h;
  }
  function fit(c, text, font, maxW) { c.font = font; if (c.measureText(text).width <= maxW) return text; let t = text; while (t.length > 4 && c.measureText(t + "…").width > maxW) t = t.slice(0, -1); return t + "…"; }

  function snapshot(f) {
    const cv = $("#bcCanvas"), c = cv.getContext("2d"), W = 1200, H = 675, F = '"Segoe UI", Roboto, system-ui, sans-serif';
    c.clearRect(0, 0, W, H);
    // backdrop — the site's warm surface with its peach glow
    c.fillStyle = "#f7f4f1"; c.fillRect(0, 0, W, H);
    const g0 = c.createRadialGradient(1050, -60, 20, 1050, -60, 700); g0.addColorStop(0, "#ffe2d0"); g0.addColorStop(1, "rgba(247,244,241,0)");
    c.fillStyle = g0; c.fillRect(0, 0, W, H);

    // header
    const hg = c.createLinearGradient(40, 30, 88, 78); hg.addColorStop(0, "#f97316"); hg.addColorStop(1, "#b93d0a");
    rr(c, 40, 30, 48, 48, 14); c.fillStyle = hg; c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 3; rr(c, 50, 46, 28, 16, 8); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(59, 54, 4.5, 0, 7); c.fill();
    c.textBaseline = "alphabetic"; c.fillStyle = "#b93d0a"; c.font = `700 13px ${F}`; c.fillText("YOUR CARD JOURNEY", 102, 48);
    c.fillStyle = "#24160f"; c.font = `800 26px ${F}`; c.fillText("Reward Switch", 102, 76);
    c.textAlign = "right"; c.fillStyle = "#5f4d43"; c.font = `600 17px ${F}`; c.fillText("rewardswitch.yourcardjourney.store", W - 40, 62); c.textAlign = "left";

    // left: the two choices, as they look on the planner
    const L = { x: 40, y: 110, w: 540, h: 470 };
    rr(c, L.x, L.y, L.w, L.h, 26); c.fillStyle = "#fff"; c.fill(); c.strokeStyle = "#e6dcd4"; c.lineWidth = 2; c.stroke();
    const step = (n, title, y) => {
      rr(c, L.x + 28, y, 36, 36, 11); c.fillStyle = "#ffe3d3"; c.fill();
      c.fillStyle = "#8c2d05"; c.font = `800 18px ${F}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(n), L.x + 46, y + 19); c.textAlign = "left";
      c.fillStyle = "#24160f"; c.font = `800 23px ${F}`; c.fillText(title, L.x + 78, y + 19);
    };
    step(1, "How much are you spending?", L.y + 32);
    let y = L.y + 88;
    if (f.amount) {
      c.font = `800 44px ${F}`; const aw = c.measureText(RS.inr(f.amount)).width + 44;
      rr(c, L.x + 78, y, aw, 70, 18); c.fillStyle = "#f2ece7"; c.fill(); c.strokeStyle = "#b93d0a"; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = "#24160f"; c.textBaseline = "middle"; c.fillText(RS.inr(f.amount), L.x + 100, y + 37);
      y += 70;
    } else { c.fillStyle = "#5f4d43"; c.font = `600 21px ${F}`; c.fillText("Any amount", L.x + 78, y + 20); y += 40; }
    y += 34;
    step(2, "What are you paying for?", y);
    y += 56;
    const p = RS.pick();
    const items = [{ text: p.cat, on: true, bold: true }].concat(p.subs.filter((x) => x.toLowerCase() !== p.cat.toLowerCase()).map((s) => ({ text: s, on: true, tick: true })));
    y = chips(c, items, L.x + 78, y, L.w - 106);
    c.fillStyle = "#5f4d43"; c.font = `600 17px ${F}`; c.textBaseline = "alphabetic";
    c.fillText("One reward per order. Collect it before you shop.", L.x + 28, L.y + L.h - 30);

    // arrow between the panels
    c.strokeStyle = "#dc4a0f"; c.lineWidth = 4; c.lineCap = "round"; c.beginPath(); c.moveTo(592, 345); c.lineTo(618, 345); c.moveTo(608, 334); c.lineTo(620, 345); c.lineTo(608, 356); c.stroke();

    // right: the verdict card, the loud one
    const R = { x: 632, y: 110, w: 528, h: 470 };
    const vg = c.createLinearGradient(R.x, R.y, R.x + R.w, R.y + R.h); vg.addColorStop(0, "#f97316"); vg.addColorStop(.55, "#dc4a0f"); vg.addColorStop(1, "#b93d0a");
    c.save(); c.shadowColor = "rgba(220,74,15,.38)"; c.shadowBlur = 40; c.shadowOffsetY = 14;
    rr(c, R.x, R.y, R.w, R.h, 30); c.fillStyle = vg; c.fill(); c.restore();
    c.save(); rr(c, R.x, R.y, R.w, R.h, 30); c.clip();
    const gl = c.createRadialGradient(R.x + R.w - 20, R.y + 20, 10, R.x + R.w - 20, R.y + 20, 240); gl.addColorStop(0, "rgba(255,255,255,.28)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gl; c.fillRect(R.x, R.y, R.w, R.h); c.restore();
    const px = R.x + 36; let py = R.y + 58;
    c.fillStyle = "rgba(255,255,255,.88)"; c.font = `800 16px ${F}`; c.textBaseline = "alphabetic"; c.fillText("SWITCH ON THIS ONE", px, py);
    py += 84;
    const big = (f.lucky ? "up to " : "") + RS.inr(f.save);
    c.fillStyle = "#fff"; c.font = `800 ${f.lucky ? 64 : 80}px ${F}`; c.fillText(big, px, py);
    const bw = c.measureText(big).width;
    c.font = `600 24px ${F}`; c.fillStyle = "rgba(255,255,255,.92)"; c.fillText(f.amount ? "back on " + RS.inr(f.amount) : "max back", px + bw + 14, py);
    py += 56;
    c.fillStyle = "#fff"; c.font = `700 27px ${F}`; c.fillText(fit(c, f.name, `700 27px ${F}`, R.w - 72), px, py);
    py += 36; c.font = `600 21px ${F}`; c.fillStyle = "rgba(255,255,255,.92)"; c.fillText(fit(c, f.offer, `600 21px ${F}`, R.w - 72), px, py);
    if (f.bits.length) { py += 32; c.font = `500 19px ${F}`; c.fillStyle = "rgba(255,255,255,.85)"; c.fillText(fit(c, f.bits.join(" · "), `500 19px ${F}`, R.w - 72), px, py); }
    // effective-price strip
    if (f.amount && !f.lucky && f.save) {
      const sy = R.y + R.h - 150;
      rr(c, px, sy, R.w - 72, 58, 16); c.fillStyle = "rgba(255,255,255,.16)"; c.fill(); c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = "#fff"; c.font = `600 20px ${F}`; c.textBaseline = "middle";
      c.fillText(`You effectively pay ${RS.inr(f.pay)}`, px + 18, sy + 30);
      c.textAlign = "right"; c.font = `800 22px ${F}`; c.fillText(`save ${f.pct}%`, px + R.w - 90, sy + 30); c.textAlign = "left";
    }
    // collect pill
    const by = R.y + R.h - 72; c.font = `800 20px ${F}`; const cw = c.measureText("Collect on Amazon ↗").width + 44;
    rr(c, px, by, cw, 46, 23); c.fillStyle = "#fff"; c.fill();
    c.fillStyle = "#8c2d05"; c.textBaseline = "middle"; c.fillText("Collect on Amazon ↗", px + 22, by + 24);

    // footer credit
    c.textBaseline = "middle";
    if (logo) { c.save(); rr(c, 40, 602, 44, 44, 12); c.clip(); c.drawImage(logo, 40, 602, 44, 44); c.restore(); }
    c.fillStyle = "#5f4d43"; c.font = `600 18px ${F}`; c.fillText("Shared by", logo ? 96 : 40, 625);
    c.fillStyle = "#b93d0a"; c.font = `800 18px ${F}`; c.fillText(CREDIT, (logo ? 96 : 40) + c.measureText("Shared by ").width + 4, 625);
    c.textAlign = "right"; c.fillStyle = "#857065"; c.font = `500 15px ${F}`;
    c.fillText("Rewards are Amazon's. Amazon decides eligibility on your account.", W - 40, 625); c.textAlign = "left";
  }

  // ---------------------------------------------------------------- render
  function draw() {
    if (scrim.hidden) return;
    const f = facts();
    const cv = $("#bcCanvas");
    ["#bcCopyImg", "#bcDlImg", "#bcCopyText", "#bcOpen"].forEach((s) => ($(s).disabled = !f));
    if (!f) {
      $("#bcSub").textContent = "Pick an amount and a category first. The reward on the right is what gets broadcast.";
      const c = cv.getContext("2d"); c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = "#f2ece7"; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = "#5f4d43"; c.font = '600 30px "Segoe UI", system-ui, sans-serif'; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("Choose an amount and a category on the page", 600, 337); c.textAlign = "left";
      if (!dirty) $("#bcOut").value = ""; count(); return;
    }
    $("#bcSub").textContent = `${f.amount ? RS.inr(f.amount) + " · " : ""}${f.cat} · picked: ${f.name}`;
    snapshot(f);
    if (!dirty) $("#bcOut").value = caption(f);
    count();
  }

  // ---------------------------------------------------------------- copies
  const blob = () => new Promise((res) => $("#bcCanvas").toBlob(res, "image/png"));
  $("#bcCopyImg").onclick = async () => {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no clipboard");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
      RS.snack("Image copied. Paste it into the chat.");
    } catch (e) { $("#bcDlImg").click(); RS.snack("This browser can't copy images, so it was downloaded instead."); }
  };
  $("#bcDlImg").onclick = async () => {
    const b = await blob(); const a = document.createElement("a"); const f = facts();
    a.href = URL.createObjectURL(b); a.download = `reward-switch-${(f ? f.cat : "pick").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const copyText = async () => {
    const t = $("#bcOut").value;
    try { await navigator.clipboard.writeText(t); } catch (e) { $("#bcOut").select(); document.execCommand("copy"); }
    return t;
  };
  $("#bcCopyText").onclick = async () => { await copyText(); RS.snack("Caption copied."); };
  $("#bcOpen").onclick = async () => {
    const t = await copyText();
    window.open(chan === "x" ? "https://x.com/intent/post?text=" + encodeURIComponent(t) : "https://web.whatsapp.com/", "_blank", "noopener");
  };

  window.RSBroadcast = { changed: () => { dirty = false; draw(); } };
})();
