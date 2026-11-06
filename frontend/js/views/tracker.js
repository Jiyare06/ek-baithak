import { S, t, save, esc, D, render } from "../app.js";
import { fmt } from "../engine.js";

const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d; };
const fd = (d, lang) => d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });

export function renderTracker(v) {
  const o = S.order, H = S.lang === "hi";
  if (!o) {
    v.innerHTML = `<div class="eyebrow">${t("nav_track")}</div><h1>${t("track_title")}</h1><div class="card"><p>${H ? "अभी कोई ऑर्डर नहीं।" : "No order yet."}</p><a class="btn" href="#/advisor">${t("start")} →</a></div>`;
    return;
  }
  const inst = o.q.install;
  // Planned day offsets from order placement for each milestone
  const plan = [0, 0, 0, 1, inst, inst];
  const keys = ["t_placed", "t_kyc", "t_pay", "t_sched", "t_inst", "t_live"];
  const notes = [
    H ? `ऑर्डर ${o.id}, ${fmt(o.q.monthly)}/महीना` : `Order ${o.id} for ${fmt(o.q.monthly)}/month`,
    H ? "GST रजिस्ट्री और दस्तावेज़ जाँच पूरी" : "GST registry and document checks passed",
    H ? "पहला बिल चालू होने के बाद ही कटेगा" : "Nothing is charged until you are live",
    o.slot ? (H ? `तकनीशियन: ${o.slot}` : `Technician slot: ${o.slot}`) : (H ? "अपना पसंदीदा समय चुनें" : "Pick a slot that suits you"),
    H ? "तकनीशियन स्पीड टेस्ट दिखाएगा" : "Technician shows you a live speed test",
    H ? "एक बिल, एक सपोर्ट नंबर" : "One bill, one support number",
  ];
  const live = addDays(o.placed, inst);
  const waMsg = [
    `Hi! Your Accel Business order ${o.id} is confirmed. Track it any time: ekbaithak.app/t/${o.id}`,
    `Business verified ✓ Your order ${o.id} is moving to installation.`,
    `UPI AutoPay set up ✓ First debit only after you're live.`,
    `Installation booked for ${o.slot || fd(addDays(o.placed, Math.max(1, inst - 1)), "en") + ", 10am-1pm"}. Technician details will follow.`,
    `Installed & tested ✓ Speed test: 104 Mbps. Reply 1 if anything isn't working.`,
    `You're live 🎉 One bill on the 1st of every month. Help: 1800-000-0000`,
  ][Math.min(o.stage, 5)];

  v.innerHTML = `
  <div class="eyebrow">${t("nav_track")} · ${esc(o.id)}</div>
  <h1>${t("track_title")}</h1>
  <p class="lead">${t("track_lead")}</p>
  <div class="split">
    <div class="card">
      <div class="row wrap" style="margin-bottom:16px">
        <div><div class="small muted">${t("expected")}</div><div style="font-size:24px;font-weight:800">${fd(live, S.lang)}</div></div>
        <span class="spacer"></span>
        <span class="pill ${o.stage >= 5 ? "ok" : "red"}">${o.stage >= 5 ? (H ? "चालू" : "Live") : `${Math.round((o.stage / 5) * 100)}% ${H ? "पूरा" : "done"}`}</span>
      </div>
      <div class="progress" style="margin-bottom:22px"><div style="width:${(o.stage / 5) * 100}%"></div></div>
      <div class="timeline">
        ${keys.map((k, i) => `<div class="tl ${i < o.stage ? "done" : i === o.stage ? "cur" : ""} ${i === o.stage && o.stage === 5 ? "done" : ""}">
          <div class="dot">${i < o.stage || (i === 5 && o.stage === 5) ? "✓" : i + 1}</div>
          <div><b>${t(k)}</b><div class="small muted">${esc(notes[i])}</div>
            ${i === 3 && o.stage === 3 && !o.slot ? `<div class="row wrap" style="margin-top:8px">${[1, 2, 3].map((d) => { const dd = addDays(o.placed, Math.max(1, inst - 3 + d)); return ["10am-1pm", "2pm-5pm"].map((s) => `<button class="chip" data-slot="${fd(dd, "en")}, ${s}">${fd(dd, S.lang)} · ${s}</button>`).join(""); }).join("")}</div>` : ""}
          </div>
          <div class="tiny muted">${fd(addDays(o.placed, plan[i]), S.lang)}</div>
        </div>`).join("")}
      </div>
      <button class="btn ghost sm" id="next" ${o.stage >= 5 ? "disabled" : ""}>${t("next_update")} ▸</button>
    </div>
    <div class="grid">
      <div class="wa"><div class="row"><b style="color:#128c4a">WhatsApp</b><span class="spacer"></span><span class="tiny muted">${H ? "अभी" : "now"}</span></div>
        <div class="bubble"><div class="from">Accel Business</div>${esc(waMsg)}</div></div>
      <div class="card">
        <h3>${t("items")}</h3>
        ${o.items.map((i) => `<div class="kv"><span>${esc(D.C[i.id].name)}${i.qty > 1 ? " × " + i.qty : ""}</span><span class="muted small">${D.C[i.id].installDays} ${D.C[i.id].installDays === 1 ? (H ? "दिन" : "day") : t("days")}</span></div>`).join("")}
        <hr class="soft"><div class="kv"><span>${t("monthly")}</span><b>${fmt(o.q.monthly)}</b></div>
      </div>
      <div class="card small"><b>${H ? "फ़ोन करने की ज़रूरत नहीं" : "No need to call"}</b><div class="muted">${H ? "आज ग्राहक औसतन 3 बार स्टेटस पूछने के लिए फ़ोन करते हैं। यह पेज और WhatsApp अपडेट उसकी जगह लेते हैं।" : "Today customers call 3 times on average to chase status. This page and the WhatsApp updates replace those calls."}</div></div>
    </div>
  </div>`;
  v.querySelectorAll("[data-slot]").forEach((b) => (b.onclick = () => { o.slot = b.dataset.slot; o.stage = 4; save(); render(); }));
  v.querySelector("#next").onclick = () => { if (o.stage === 3 && !o.slot) o.slot = fd(addDays(o.placed, Math.max(1, inst - 1)), "en") + ", 10am-1pm"; o.stage = Math.min(5, o.stage + 1); save(); render(); };
}
