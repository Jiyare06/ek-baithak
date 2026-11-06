import { S, t, save, go, modal, closeModal, toast, esc, D } from "../app.js";
import { fmt, price } from "../engine.js";

export function renderHome(v) {
  const hasOrder = S.order || S.items.length;
  const q = S.items.length ? price(S.items, D.catalogue, S.spread) : null;
  v.innerHTML = `
  <div class="hero">
    <div>
      <div class="eyebrow">${t("hero_eyebrow")}</div>
      <h1>${t("hero_title")}</h1>
      <p class="lead">${t("hero_lead")}</p>
      <div class="row wrap">
        <a class="btn" href="#/advisor" id="startBtn">${t("start")} →</a>
        ${hasOrder ? `<a class="btn ghost" href="#/${S.order ? "track" : "quote"}">${t("resume")}</a>` : ""}
      </div>
      <div class="row wrap" style="margin-top:16px">
        <span class="pill">English</span><span class="pill">हिंदी</span><span class="pill">मराठी</span><span class="pill">தமிழ்</span><span class="pill">తెలుగు</span><span class="pill">বাংলা</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="float"><div class="ic">✦</div><div><b>${S.lang === "hi" ? "क्लिनिक, 8 लोग, पुणे" : "\"Dental clinic, 8 staff, Pune\""}</b><div class="small muted">${S.lang === "hi" ? "सलाहकार 6 सवालों में बंडल बनाता है" : "The advisor builds a bundle in 6 questions"}</div></div></div>
      <div class="float"><div class="ic">₹</div><div><b>${q ? fmt(q.monthly) + t("per_month") : "₹4,316" + t("per_month")}</b><div class="small muted">${S.lang === "hi" ? "एक दाम, एक बिल, हर चीज़ का कारण" : "One price, one bill, a reason for every line"}</div></div></div>
      <div class="float"><div class="ic">✓</div><div><b>${S.lang === "hi" ? "GSTIN से अपने-आप भरा" : "Filled from your GSTIN"}</b><div class="small muted">${S.lang === "hi" ? "दस्तावेज़ अपलोड करते ही जाँच" : "Documents checked the moment you upload"}</div></div></div>
      <div class="float"><div class="ic">◷</div><div><b>${S.lang === "hi" ? "5 दिन में चालू" : "Live in 5 days"}</b><div class="small muted">${S.lang === "hi" ? "हर अपडेट WhatsApp पर" : "Every update on WhatsApp"}</div></div></div>
    </div>
  </div>
  <h2>${t("how")}</h2>
  <div class="grid g4">
    ${[1, 2, 3, 4].map((i) => `<div class="card step-card"><div class="num">${i}</div><h3>${t("s" + i)}</h3><div class="small muted">${t("s" + i + "d")}</div></div>`).join("")}
  </div>
  <div class="grid g4" style="margin-top:16px">
    <div class="card"><div class="stat">17.6 → 7</div><div class="small muted">${S.lang === "hi" ? "लीड से चालू होने तक दिन (लक्ष्य)" : "days from lead to live (target)"}</div></div>
    <div class="card"><div class="stat">3 → 0</div><div class="small muted">${S.lang === "hi" ? "स्टेटस पूछने के कॉल" : "status-chasing calls per customer"}</div></div>
    <div class="card"><div class="stat">25</div><div class="small muted">${S.lang === "hi" ? "प्रोडक्ट, एक बिल पर" : "products, on a single bill"}</div></div>
    <div class="card"><div class="stat">0</div><div class="small muted">${S.lang === "hi" ? "अयोग्य बंडल बिक सकते हैं" : "ineligible bundles can be sold"}</div></div>
  </div>`;
}

export function renderSettings() {
  const m = modal(`
    <h2>${t("settings")}</h2>
    <p class="small muted">${t("settings_lead")}</p>
    <label class="fld">Anthropic API key</label>
    <input class="input" id="llmKey" type="password" placeholder="sk-ant-..." value="${esc(S.llm.key)}">
    <label class="fld" style="margin-top:10px">Model</label>
    <input class="input" id="llmModel" value="${esc(S.llm.model)}">
    <p class="tiny muted">Stored only in this browser. In production the call goes through the Accel backend, never from the device.</p>
    <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn ghost" id="cl">${t("close")}</button><button class="btn" id="sv">${t("save")}</button></div>`);
  m.querySelector("#cl").onclick = closeModal;
  m.querySelector("#sv").onclick = () => {
    S.llm.key = m.querySelector("#llmKey").value.trim(); S.llm.model = m.querySelector("#llmModel").value.trim() || "claude-sonnet-4-5";
    save(); closeModal(); toast(S.llm.key ? "AI explanations on" : "Using built-in explanations");
  };
}

/** Ask the LLM to explain an already-decided bundle. It cannot change items or prices. */
export async function llmExplain(profile, lines, total) {
  if (!S.llm.key) return null;
  const lang = S.lang === "hi" ? "Hindi (simple, everyday words, Devanagari)" : "simple English";
  const prompt = `You are the Accel Business advisor talking to a small business owner on their phone.
Business: ${JSON.stringify(profile)}
Bundle (fixed by the eligibility and pricing rules; do NOT add, remove or re-price anything):
${lines.map((l) => `- ${l.name} x${l.qty}: ${l.price}/month. Reason: ${l.why}`).join("\n")}
Total: ${total}/month.
Write 3 short bullet points in ${lang} explaining why this bundle fits this business and what they will notice day to day. No jargon, no product codes, under 70 words.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": S.llm.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: S.llm.model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return j.content.map((c) => c.text || "").join("").trim();
  } catch (e) {
    toast("AI explanation unavailable (" + e.message + "), showing built-in text");
    return null;
  }
}
export { go };
