import { S, t, save, esc, D, render, toast } from "../app.js";

const SEGS = ["Professional offices", "Small multi-site businesses", "Small manufacturers", "Micro retail & services"];
const ACTION = {
  "Owner had no time for a visit": "Send WhatsApp advisor link; no visit needed",
  "Visit not scheduled by sales": "Send WhatsApp advisor link; no visit needed",
  "Quote too complex to understand": "Resend as one-price quote with reasons",
  "Quote took too long to arrive": "Resend instant quote today",
  "Price too high": "Offer right-sized bundle or AirFiber entry plan",
  "Competitor offered cheaper plan": "Match on bundle value: failover + one bill",
  "Decided to wait": "Nudge in 2 weeks with tracker demo",
  "Missing GST or Udyam document": "Send GSTIN-prefill KYC link",
  "Found paperwork too long": "Send GSTIN-prefill KYC link",
  "Authorised signatory not available": "Send Aadhaar e-sign link to signatory",
  "Document details did not match": "Partner visit to re-capture documents",
  "Installation delayed beyond 21 days": "Escalate install; offer AirFiber bridge",
  "Site not feasible for fibre": "Offer 5G AirFiber (2-day install)",
  "Customer cancelled before install": "Partner call with fixed install date",
  "First payment failed": "Resend UPI AutoPay link",
  "Unreachable after 3 attempts": "Try WhatsApp instead of calls",
  "Not interested on first call": "Low priority: nurture on WhatsApp",
  "Locked in with current provider": "Note contract end date; call 30 days before",
};

/** Top reasons behind a lead's score, from the logistic-regression weights. */
function why(l) {
  const x = {
    ["segment_" + l.segment]: 1, ["lead_source_" + l.lead_source]: 1, has_gstin: l.has_gstin === "Y" ? 1 : 0,
    tier1: l.city_tier === 1 ? 1 : 0, log_employees: Math.log1p(l.employee_count), log_sites: Math.log1p(l.num_sites),
  };
  return D.model.features
    .filter((f) => f.name in x)
    .map((f) => ({ f, c: (((x[f.name] ?? 0) - f.mean) / f.sd) * f.w }))
    .filter((z) => z.c > 0.05).sort((a, b) => b.c - a.c).slice(0, 3)
    .map((z) => z.f.name.replace("segment_", "").replace("lead_source_", "via ").replace("has_gstin", "Has GSTIN").replace("tier1", "Tier-1 city").replace("log_employees", `${l.employee_count} staff`).replace("log_sites", `${l.num_sites} sites`));
}

export function renderConsole(v) {
  const f = (S.conFilter ||= { seg: "", min: 50, city: "" });
  const rows = D.leads_open.filter((l) => (!f.seg || l.segment === f.seg) && l.score >= f.min && (!f.city || l.city === f.city));
  const cities = [...new Set(D.leads_open.map((l) => l.city))].sort();
  const n = rows.length, hot = rows.filter((l) => l.score >= 70).length;
  v.innerHTML = `
  <div class="eyebrow">${t("nav_console")} · ${S.lang === "hi" ? "स्ट्रेच गोल" : "stretch goal"}</div>
  <h1>${t("con_title")}</h1>
  <p class="lead">${t("con_lead")}</p>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card"><div class="stat">${n}</div><div class="small muted">${S.lang === "hi" ? "फ़िल्टर में लीड" : "leads in view"}</div></div>
    <div class="card"><div class="stat">${hot}</div><div class="small muted">${S.lang === "hi" ? "स्कोर 70+" : "score 70+ (call today)"}</div></div>
    <div class="card"><div class="stat">${Object.keys(S.assigned).length}</div><div class="small muted">${S.lang === "hi" ? "पार्टनर को सौंपे" : "assigned to partners"}</div></div>
    <div class="card"><div class="stat">${D.model.auc}</div><div class="small muted">${S.lang === "hi" ? "मॉडल AUC (होल्ड-आउट)" : "propensity model AUC (hold-out)"}</div></div>
  </div>
  <div class="card">
    <div class="row wrap" style="margin-bottom:12px">
      <select class="input" id="seg" style="width:auto"><option value="">${t("seg")}: ${t("all")}</option>${SEGS.map((s) => `<option ${f.seg === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="input" id="city" style="width:auto"><option value="">City: ${t("all")}</option>${cities.map((c) => `<option ${f.city === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <label class="small">${t("minscore")} <input type="range" id="min" min="0" max="100" value="${f.min}"> <b>${f.min}</b></label>
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>${S.lang === "hi" ? "बिज़नेस" : "Business"}</th><th>Score</th><th class="hide-sm">${S.lang === "hi" ? "कहाँ रुका" : "Stopped at"}</th><th class="hide-sm">${S.lang === "hi" ? "अगला कदम" : "Next best action"}</th><th></th></tr></thead>
      <tbody>${rows.slice(0, 120).map((l) => `<tr>
        <td><b>${esc(l.business_name)}</b><div class="tiny muted">${esc(l.business_type)} · ${esc(l.city)} · ${l.employee_count} staff · ${l.num_sites} site${l.num_sites > 1 ? "s" : ""} · ${esc(l.preferred_language)}</div><div class="tiny muted">${why(l).map((w) => `<span class="pill" style="margin:3px 4px 0 0">${esc(w)}</span>`).join("")}</div></td>
        <td><div class="score"><div class="bar"><div style="width:${l.score}%"></div></div><b>${l.score}</b></div></td>
        <td class="hide-sm"><div class="small">${esc(l.stage_reached)}</div><div class="tiny muted">${esc(l.drop_reason)}</div></td>
        <td class="hide-sm small">${esc(ACTION[l.drop_reason] || "Call")}</td>
        <td>${S.assigned[l.lead_id] ? `<span class="pill ok">${t("assigned")}</span>` : `<button class="btn sm ghost" data-a="${l.lead_id}">${t("assign")}</button>`}</td>
      </tr>`).join("")}</tbody></table></div>
    <p class="tiny muted">${S.lang === "hi" ? "स्कोर: smb_leads.csv पर प्रशिक्षित लॉजिस्टिक रिग्रेशन (analysis/build_data.py)। पिन-कोड के पार्टनर को पूरा कमीशन।" : "Score: logistic regression trained on smb_leads.csv (analysis/build_data.py). Leads are routed to the partner who owns the pin code, who keeps full commission on digital closes."}</p>
  </div>`;
  v.querySelector("#seg").onchange = (e) => { f.seg = e.target.value; save(); render(); };
  v.querySelector("#city").onchange = (e) => { f.city = e.target.value; save(); render(); };
  v.querySelector("#min").onchange = (e) => { f.min = +e.target.value; save(); render(); };
  v.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { S.assigned[b.dataset.a] = Date.now(); save(); toast("Assigned to local partner"); render(); }));
}
