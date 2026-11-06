import { S, t, save, esc, D, render, go } from "../app.js";
import { price, fmt, addonOptions, enforce } from "../engine.js";

export function renderQuote(v) {
  if (!S.items.length || !S.profile) {
    v.innerHTML = `<div class="eyebrow">${t("nav_quote")}</div><h1>${t("quote_title")}</h1><div class="card"><p>${t("no_items")}</p><a class="btn" href="#/advisor">${t("start")} →</a></div>`;
    return;
  }
  const p = S.profile;
  p.lang = S.lang;
  const before = S.items.length;
  S.items = enforce(p, D.catalogue, S.items);
  const removed = before - S.items.length;
  const q = price(S.items, D.catalogue, S.spread);
  const opts = addonOptions(p, D.catalogue, S.items, S.lang);
  const H = S.lang === "hi";
  v.innerHTML = `
  <div class="eyebrow">${t("nav_quote")} · ${esc(p.city || "")}</div>
  <h1>${t("quote_title")}</h1>
  <p class="lead">${t("quote_lead")}</p>
  ${removed ? `<div class="check warn" style="margin-bottom:14px"><span class="ic">!</span><span>${H ? `${removed} प्रोडक्ट हटाए गए क्योंकि अब वे आपके लिए योग्य नहीं हैं।` : `${removed} item(s) removed because they are no longer eligible (e.g. GSTIN status changed).`}</span></div>` : ""}
  <div class="split">
    <div class="grid">
      <div class="card">
        <h2>${t("in_bundle")}</h2>
        ${S.items.map((it, idx) => {
          const pr = D.C[it.id];
          return `<div class="line">
            <div><div class="cat-tag">${esc(pr.category)}</div><b>${esc(pr.name)}</b> <span class="tiny muted">${fmt(pr.priceMin)} ${esc(pr.unit)}</span><div class="why">${esc(it.why || pr.desc)}</div></div>
            <div class="qty"><button data-q="${idx}" data-d="-1" aria-label="less">−</button><span>${it.qty}</span><button data-q="${idx}" data-d="1" aria-label="more">+</button></div>
            <div class="amt">${fmt(pr.priceMin * it.qty)}</div>
          </div>`;
        }).join("")}
      </div>
      <div class="card">
        <h2>${t("addons")}</h2>
        ${opts.filter((o) => !o.reason).map((o) => addonRow(o, false)).join("") || `<div class="muted small">—</div>`}
        ${opts.some((o) => o.reason) ? `<hr class="soft"><div class="small muted" style="margin-bottom:4px">${t("not_eligible")}</div>${opts.filter((o) => o.reason).map((o) => addonRow(o, true)).join("")}` : ""}
      </div>
    </div>
    <div class="card summary">
      <div class="muted small">${t("monthly")}</div>
      <div class="total">${fmt(q.monthly)}<span class="muted" style="font-size:16px;font-weight:500">${t("per_month")}</span></div>
      <div class="tiny muted">${H ? "GST अलग · एक बिल · एक सपोर्ट नंबर" : "+ GST · one bill · one support number"}</div>
      <hr class="soft">
      <div class="kv"><span>${H ? "प्रोडक्ट्स" : "Products"}</span><b>${fmt(q.base)}</b></div>
      ${q.spreadAdd ? `<div class="kv"><span>${H ? "सेटअप (बिलों में)" : "Setup, spread"}</span><b>${fmt(q.spreadAdd)}</b></div>` : ""}
      <div class="kv"><span>${t("onetime")}</span><b>${fmt(q.setup)}</b></div>
      <div class="kv"><span>${t("term")}</span><b>${q.term} ${H ? "महीने" : "months"}</b></div>
      <div class="kv"><span>${t("install_eta")}</span><b>${q.install} ${t("days")}</b></div>
      ${q.setupTotal ? `<div class="row" style="margin:10px 0"><label class="toggle"><input type="checkbox" id="spread" ${S.spread ? "checked" : ""}><span></span></label><span class="small">${t("spread")} (${fmt(q.setupTotal)})</span></div>` : ""}
      <button class="btn block" id="checkout" style="margin-top:8px">${t("checkout")} →</button>
      <p class="tiny muted" style="margin-bottom:0">${H ? "दाम कैटलॉग की लॉन्च कीमत पर। हर प्रोडक्ट शहर, आकार, GST और निर्भरता नियमों से जाँचा गया।" : "Launch prices from the Accel Business catalogue. Every line is checked against city-tier, size, GST and dependency rules."}</p>
    </div>
  </div>`;

  function addonRow(o, disabled) {
    return `<div class="addon ${disabled ? "off" : ""}">
      <label class="toggle"><input type="checkbox" data-add="${o.p.id}" ${disabled ? "disabled" : ""}><span></span></label>
      <div style="flex:1"><b>${esc(o.p.name)}</b> <span class="tiny muted">${fmt(o.p.priceMin)} ${esc(o.p.unit)}${o.p.setup ? ` · ${fmt(o.p.setup)} setup` : ""}</span>
      <div class="small muted">${esc(disabled ? "✕ " + o.reason : o.p.desc)}</div></div>
    </div>`;
  }
  v.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => {
    const it = S.items[+b.dataset.q];
    it.qty += +b.dataset.d;
    if (it.qty <= 0) S.items.splice(+b.dataset.q, 1);
    save(); render();
  }));
  v.querySelectorAll("[data-add]").forEach((c) => (c.onchange = () => {
    const pr = D.C[c.dataset.add];
    const qty = /per (site|camera)/.test(pr.unit) ? (pr.unit === "per camera" ? 2 : 1) * (p.sites || 1) : /per (user|device)/.test(pr.unit) ? Math.min(p.employees || 1, 50) : 1;
    S.items.push({ id: pr.id, qty, why: S.lang === "hi" ? "आपने जोड़ा" : "Added by you" });
    save(); render();
  }));
  const sp = v.querySelector("#spread");
  if (sp) sp.onchange = () => { S.spread = sp.checked; save(); render(); };
  v.querySelector("#checkout").onclick = () => go("kyc");
}
