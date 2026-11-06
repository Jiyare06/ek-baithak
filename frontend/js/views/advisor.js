import { S, t, save, esc, D, render, reset, toast } from "../app.js";
import { BUSINESS_TYPES, EMP, SITES, NETS, NEEDS, recommend, price, fmt, parseFreeText } from "../engine.js";
import { gstinChecksumOk, maskId } from "../kyc.js";
import { llmExplain } from "./home.js";

const L = (o) => (S.lang === "hi" ? o.hi : o.en);
const STEPS = ["type", "employees", "sites", "city", "net", "needs", "gst"];
const Q = { type: "q_type", employees: "q_emp", sites: "q_sites", city: "q_city", net: "q_net", needs: "q_needs", gst: "q_gst" };

function prof() { return (S.profile ||= { lang: S.lang }); }
function nextStep() { const p = prof(); return STEPS.find((s) => p[s] === undefined) || null; }

function labelOf(step, val) {
  if (step === "type") return L(BUSINESS_TYPES.find((b) => b.id === val));
  if (step === "employees") return (EMP.find((e) => e.v === val) || { l: val }).l + (S.lang === "hi" ? " लोग" : " people");
  if (step === "sites") return (SITES.find((e) => e.v === val) || { l: val }).l + (S.lang === "hi" ? " जगह" : val === 1 ? " site" : " sites");
  if (step === "net") return L(NETS.find((n) => n.id === val));
  if (step === "needs") return val.length ? val.map((n) => L(NEEDS.find((x) => x.id === n))).join(", ") : t("skip");
  return String(val);
}

function answer(step, val, echo = true) {
  const p = prof();
  p[step] = val;
  if (step === "type") p.seg = BUSINESS_TYPES.find((b) => b.id === val).seg;
  if (step === "city") p.tier = (D.cities[val] || [1])[0];
  if (step === "sites" && val >= 2 && p.seg !== "mfg") p.seg = "multi";
  if (echo) S.chat.push({ who: "me", text: labelOf(step, val) });
  advance();
}

function advance() {
  const p = prof();
  const n = nextStep();
  if (n) { S.chat.push({ who: "bot", k: Q[n] }); save(); return render(); }
  p.lang = S.lang;
  S.items = recommend(p, D.catalogue);
  S.chat.push({ who: "bot", k: "reco_intro" }, { who: "reco" });
  save(); render();
}

function freeText(txt) {
  if (!txt.trim()) return;
  const step = nextStep();
  S.chat.push({ who: "me", text: txt });
  if (step === "gst") return gstAnswer(txt.trim().toUpperCase(), false);
  if (step === "city") {
    const c = Object.keys(D.cities).find((x) => x.toLowerCase() === txt.trim().toLowerCase());
    if (c) return answer("city", c, false);
  }
  const f = parseFreeText(txt, D.cities), p = prof(), got = [];
  if (f.type && p.type === undefined) { p.type = f.type; p.seg = BUSINESS_TYPES.find((b) => b.id === f.type).seg; got.push(labelOf("type", f.type)); }
  if (f.employees && p.employees === undefined) { p.employees = f.employees; got.push(f.employees + (S.lang === "hi" ? " लोग" : " people")); }
  if (f.sites && p.sites === undefined) { p.sites = f.sites; if (f.sites >= 2 && p.seg !== "mfg") p.seg = "multi"; got.push(f.sites + (S.lang === "hi" ? " जगह" : " sites")); }
  if (f.city && p.city === undefined) { p.city = f.city; p.tier = D.cities[f.city][0]; got.push(f.city); }
  if (got.length) S.chat.push({ who: "bot", text: t("understood", { txt: got.join(", ") }) });
  else S.chat.push({ who: "bot", text: S.lang === "hi" ? "माफ़ कीजिए, समझ नहीं पाया। नीचे से चुनें।" : "Sorry, I didn't catch that. Please pick an option below." });
  advance();
}

function gstAnswer(g, echo = true) {
  const p = prof();
  if (echo) S.chat.push({ who: "me", text: g ? maskId(g) : t("no_gst") });
  if (!g) { p.gst = "none"; p.gstin = null; p.gstStatus = null; return advance(); }
  if (!gstinChecksumOk(g)) { S.chat.push({ who: "bot", text: t("gst_fmt") }); save(); return render(); }
  const rec = D.gstin[g];
  if (!rec) { S.chat.push({ who: "bot", text: t("gst_nf") }); save(); return render(); }
  p.gst = g; p.gstin = g; p.gstStatus = rec[6]; p.gstName = rec[1];
  S.kyc.gstin = g;
  S.chat.push({ who: "bot", text: rec[6] === "Active" ? t("gst_ok", { name: rec[1], status: rec[6] }) : t("gst_bad", { status: rec[6] }) });
  advance();
}

function chipsFor(step) {
  const p = prof();
  if (step === "type") return BUSINESS_TYPES.map((b) => ({ l: L(b), f: () => answer("type", b.id) }));
  if (step === "employees") return EMP.map((e) => ({ l: e.l, f: () => answer("employees", e.v) }));
  if (step === "sites") return SITES.map((e) => ({ l: e.l, f: () => answer("sites", e.v) }));
  if (step === "city") {
    const top = ["Mumbai", "Delhi", "Bengaluru", "Pune", "Hyderabad", "Chennai", "Ahmedabad", "Jaipur", "Lucknow", "Indore", "Nagpur", "Kochi"].filter((c) => D.cities[c]);
    return top.map((c) => ({ l: c, f: () => answer("city", c) }));
  }
  if (step === "net") return NETS.map((n) => ({ l: L(n), f: () => answer("net", n.id) }));
  if (step === "needs") {
    p._needs ||= [];
    return NEEDS.filter((n) => !(n.id === "iot" && p.seg !== "mfg") && !(n.id === "fleet" && !["multi", "mfg"].includes(p.seg)))
      .map((n) => ({ l: L(n), on: p._needs.includes(n.id), f: () => { p._needs = p._needs.includes(n.id) ? p._needs.filter((x) => x !== n.id) : [...p._needs, n.id]; save(); render(); } }))
      .concat([{ l: "✓ " + t("done"), primary: true, f: () => { const v = p._needs; delete p._needs; answer("needs", v); } }]);
  }
  if (step === "gst") return [{ l: t("no_gst"), f: () => gstAnswer("") }, { l: "Demo: 27QTBXZ1995X1Z9", f: () => gstAnswer("27QTBXZ1995X1Z9") }];
  return [];
}

function recoCard() {
  const q = price(S.items, D.catalogue, S.spread);
  const lines = S.items.map((i) => ({ name: D.C[i.id].name, qty: i.qty, price: fmt(D.C[i.id].priceMin * i.qty), why: i.why }));
  return `<div class="reco" id="reco">
    <div class="row"><div><span class="price">${fmt(q.monthly)}</span><span class="muted">${t("per_month")}</span></div><span class="spacer"></span><span class="pill red">${q.term} ${S.lang === "hi" ? "महीने का" : "mo"} ${t("contract")}</span></div>
    <div class="tiny muted">${q.spreadAdd ? (S.lang === "hi" ? `सेटअप ${fmt(q.setupTotal)} बिलों में शामिल` : `incl. ${fmt(q.setupTotal)} setup spread over bills`) : t("setup") + ": " + fmt(q.setup)} · ${t("install_eta")}: ${q.install} ${t("days")}</div>
    <ul>${lines.map((l) => `<li><b>${esc(l.name)}${l.qty > 1 ? " × " + l.qty : ""}</b> — ${esc(l.why)}</li>`).join("")}</ul>
    <div id="aiText"></div>
    <div class="row wrap"><a class="btn sm" href="#/quote">${t("see_quote")} →</a><button class="btn sm ghost" id="aiBtn">✦ ${t("explain_ai")}</button></div>
  </div>`;
}

export function renderAdvisor(v) {
  if (!S.chat.length) { S.profile = { lang: S.lang }; S.chat.push({ who: "bot", k: "q_type" }); save(); }
  const step = nextStep();
  const p = prof();
  const msgs = S.chat.map((m) => m.who === "reco" ? recoCard() : `<div class="msg ${m.who === "me" ? "me" : "bot"}">${esc(m.k ? t(m.k) : m.text)}</div>`).join("");
  const chips = step ? chipsFor(step) : [];
  v.innerHTML = `
  <div class="split">
    <div class="card chat">
      <div class="chat-head"><div class="av">A</div><div><b>${t("adv_title")}</b><div class="online">● ${t("adv_online")}</div></div><span class="spacer"></span><button class="btn sm ghost" id="restart">${t("restart")}</button></div>
      <div class="msgs" id="msgs">${msgs}
        ${chips.length ? `<div class="chips">${chips.map((c, i) => `<button class="chip ${c.on ? "on" : ""}" data-i="${i}" ${c.primary ? 'style="background:var(--red);color:#fff;border-color:var(--red)"' : ""}>${esc(c.l)}</button>`).join("")}</div>` : ""}
      </div>
      <form class="composer" id="composer"><input class="input" id="txt" placeholder="${esc(step === "gst" ? "27ABCDE1234F1Z5" : t("adv_type"))}" autocomplete="off" ${step === "city" ? 'list="cityList"' : ""}><button class="btn">${t("send")}</button></form>
      <datalist id="cityList">${Object.keys(D.cities).map((c) => `<option value="${c}">`).join("")}</datalist>
    </div>
    <div class="grid">
      <div class="card">
        <h3>${t("your_profile")}</h3>
        <div class="profile-list">
          ${row(S.lang === "hi" ? "प्रकार" : "Type", p.type !== undefined ? labelOf("type", p.type) : "—")}
          ${row(S.lang === "hi" ? "सेगमेंट" : "Segment", p.seg ? { micro: "Micro retail & services", prof: "Professional office", multi: "Small multi-site", mfg: "Small manufacturer" }[p.seg] : "—")}
          ${row(S.lang === "hi" ? "लोग" : "People", p.employees ?? "—")}
          ${row(S.lang === "hi" ? "जगहें" : "Sites", p.sites ?? "—")}
          ${row(S.lang === "hi" ? "शहर" : "City", p.city ? `${p.city} · tier ${p.tier}` : "—")}
          ${row("GSTIN", p.gstin ? `${maskId(p.gstin)} · ${p.gstStatus}` : p.gst === "none" ? (S.lang === "hi" ? "नहीं" : "None") : "—")}
        </div>
        <div class="progress" style="margin-top:14px"><div style="width:${Math.round((STEPS.filter((s) => p[s] !== undefined).length / STEPS.length) * 100)}%"></div></div>
      </div>
      <div class="card small">
        <b>${S.lang === "hi" ? "हम यह क्यों पूछते हैं" : "Why we ask"}</b>
        <p class="muted" style="margin:6px 0 0">${S.lang === "hi" ? "सिर्फ़ वही जानकारी जो सही बंडल चुनने के लिए ज़रूरी है। कोई फ़ोन नंबर या पहचान दस्तावेज़ यहाँ नहीं माँगा जाता। हर प्रोडक्ट योग्यता नियमों (शहर, आकार, GST) से जाँचा जाता है, इसलिए आपको कुछ ऐसा नहीं बेचा जाएगा जो चल ही न सके।" : "Only what's needed to pick the right bundle. No phone number or ID is asked here. Every product is checked against eligibility rules (city tier, size, GST), so you are never sold something that can't be installed."}</p>
      </div>
    </div>
  </div>`;
  function row(a, b) { return `<div><span>${a}</span><span><b>${esc(b)}</b></span></div>`; }
  v.querySelectorAll(".chip").forEach((b) => (b.onclick = () => chips[+b.dataset.i].f()));
  v.querySelector("#composer").onsubmit = (e) => { e.preventDefault(); freeText(v.querySelector("#txt").value); };
  v.querySelector("#restart").onclick = () => { reset(); render(); };
  const ai = v.querySelector("#aiBtn");
  if (ai) ai.onclick = async () => {
    ai.disabled = true; ai.textContent = "…";
    const lines = S.items.map((i) => ({ name: D.C[i.id].name, qty: i.qty, price: fmt(D.C[i.id].priceMin * i.qty), why: i.why }));
    const txt = await llmExplain({ type: p.type, employees: p.employees, sites: p.sites, city: p.city, internet: p.net, needs: p.needs }, lines, fmt(price(S.items, D.catalogue, S.spread).monthly));
    v.querySelector("#aiText").innerHTML = txt ? `<div class="msg bot" style="max-width:100%;margin:8px 0;background:var(--red-50)">✦ ${esc(txt)}</div>` : "";
    if (!txt && !S.llm.key) toast(S.lang === "hi" ? "⚙ में API key जोड़ें" : "Add an API key under ⚙ to turn on AI explanations");
    ai.disabled = false; ai.textContent = "✦ " + t("explain_ai");
  };
  const box = v.querySelector("#msgs"); box.scrollTop = box.scrollHeight;
  if (!step) { const r = v.querySelector("#reco"); if (r) r.scrollIntoView({ block: "nearest" }); }
  else setTimeout(() => v.querySelector("#txt")?.focus({ preventScroll: true }), 0);
}
