import { S, t, save, esc, D, render, go, modal, closeModal, toast } from "../app.js";
import { DOCS, validate, maskId, gstinChecksumOk, blurScore, skewAngle, ocrImage, TODAY, isoDate } from "../kyc.js";
import { price, enforce } from "../engine.js";

const memThumbs = {}; // user uploads stay in memory only (never written to storage)
const LBL = { gst_certificate: "d_gst", udyam_certificate: "d_udyam", signatory_id: "d_sig", address_proof: "d_addr" };

function applyGst(gstin) {
  const rec = D.gstin[gstin];
  S.kyc.lookup = rec ? { gstin, rec } : { gstin, rec: null };
  if (rec && S.profile) {
    S.profile.gstin = gstin; S.profile.gstStatus = rec[6];
    S.items = enforce(S.profile, D.catalogue, S.items);
  }
}

export function renderKyc(v) {
  const k = S.kyc, H = S.lang === "hi";
  const stage = !k.consent ? 0 : !k.lookup ? 1 : !k.esign ? 2 : 3;
  const stepper = `<div class="stepper">${["st_consent", "st_lookup", "st_docs", "st_sign"].map((s, i) => `<div class="st ${i < stage ? "done" : i === stage ? "cur" : ""}"><div class="b">${i < stage ? "✓" : i + 1}</div>${t(s)}</div>`).join("")}</div>`;
  const head = `<div class="eyebrow">${t("nav_kyc")}</div><h1>${t("kyc_title")}</h1><p class="lead">${t("kyc_lead")}</p>${stepper}`;

  if (!k.consent) {
    v.innerHTML = `${head}
    <div class="split"><div class="card">
      <h2>${t("consent_h")}</h2>
      ${[["c_verify", true], ["c_address", true], ["c_install", true], ["c_mkt", false]].map(([key, req]) => `
        <label class="consent-item"><input type="checkbox" data-c="${key}" ${req ? "data-req" : ""}><div><b>${t(key)}</b>${req ? "" : ` <span class="pill">${H ? "वैकल्पिक" : "Optional"}</span>`}<div class="small muted">${t(key + "_d")}</div></div></label>`).join("")}
      <p class="small muted">${t("retention")}</p>
      <button class="btn" id="agree" disabled>${t("agree")} →</button>
    </div>
    <div class="card small"><b>DPDP Act, 2023</b><ul class="muted" style="padding-left:18px;margin:8px 0 0">
      <li>${H ? "हर उद्देश्य के लिए अलग सहमति" : "Separate consent for each purpose"}</li>
      <li>${H ? "सिर्फ़ 4 दस्तावेज़; बाकी GST रजिस्ट्री से" : "Only 4 documents; the rest comes from the GST registry"}</li>
      <li>${H ? "पहचान नंबर हर जगह छिपे" : "Identifiers masked everywhere"}</li>
      <li>${H ? "मार्केटिंग सहमति कभी भी वापस लें" : "Marketing consent can be withdrawn any time"}</li></ul></div></div>`;
    const boxes = [...v.querySelectorAll("[data-c]")], btn = v.querySelector("#agree");
    boxes.forEach((b) => (b.onchange = () => (btn.disabled = !boxes.filter((x) => x.hasAttribute("data-req")).every((x) => x.checked))));
    btn.onclick = () => { k.consent = { at: new Date().toISOString(), purposes: boxes.filter((b) => b.checked).map((b) => b.dataset.c) }; save(); render(); };
    return;
  }

  const res = validate(k.extracted, D.gstin, D.udyam);
  if (k.digilocker) res.checks.push({ lvl: "ok", msg: H ? "हस्ताक्षरकर्ता की पहचान DigiLocker से मिली (मॉक)" : "Signatory identity fetched from DigiLocker (mock)." });
  const nBad = res.checks.filter((c) => c.lvl === "bad").length, nWarn = res.checks.filter((c) => c.lvl === "warn").length;
  const docsDone = DOCS.filter((d) => k.extracted[d]).length;
  const clear = docsDone === 4 && !nBad && !nWarn && k.lookup && k.lookup.rec && k.lookup.rec[6] === "Active";
  const L = k.lookup;
  const specOpts = Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`);

  v.innerHTML = `${head}
  <div class="split">
    <div class="grid">
      <div class="card">
        <h2>1 · ${t("st_lookup")}</h2>
        <div class="grid g2">
          <div><label class="fld">${t("gstin")}</label><input class="input" id="gstin" maxlength="15" value="${esc(k.gstin || S.profile?.gstin || "")}" placeholder="27ABCDE1234F1Z5"></div>
          <div><label class="fld">${t("udyam")}</label><input class="input" id="udyam" value="${esc(k.udyam || "")}" placeholder="UDYAM-MH-00-1234567"></div>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn sm" id="lookupBtn">${t("lookup")}</button><span class="tiny muted">${H ? "मॉक GST/उद्यम API, सिंथेटिक रजिस्ट्री पर" : "Mock GST / Udyam APIs backed by the synthetic registries"}</span></div>
        ${L ? (L.rec ? `<div class="reg">
            <div class="row"><b>${esc(L.rec[1])}</b><span class="spacer"></span><span class="pill ${L.rec[6] === "Active" ? "ok" : "bad"}">${esc(L.rec[6])}</span></div>
            <div class="kv"><span class="muted">GSTIN</span><span>${maskId(L.gstin)}</span></div>
            <div class="kv"><span class="muted">${H ? "कानूनी नाम" : "Legal name"}</span><span>${esc(L.rec[0])}</span></div>
            <div class="kv"><span class="muted">${H ? "प्रकार" : "Constitution"}</span><span>${esc(L.rec[2])}</span></div>
            <div class="kv"><span class="muted">${H ? "पता" : "Address"}</span><span style="text-align:right">${esc(L.rec[3])}</span></div>
            ${L.rec[6] !== "Active" ? `<div class="check bad" style="margin-top:8px"><span class="ic">✕</span><span>${H ? "GSTIN सक्रिय नहीं है। GST वाले प्रोडक्ट कोटेशन से हटा दिए गए।" : "GSTIN is not active. Products that need GST have been removed from your quote."}</span></div>` : ""}
          </div>` : `<div class="check bad" style="margin-top:10px"><span class="ic">✕</span><span>${gstinChecksumOk(L.gstin) ? (H ? "GSTIN रजिस्ट्री में नहीं मिला" : "GSTIN not found in the registry") : (H ? "GSTIN का फ़ॉर्मेट/चेकसम ग़लत" : "GSTIN format or checksum is invalid")}</span></div>`) : ""}
      </div>
      <div class="card">
        <div class="row wrap"><h2 style="margin:0">2 · ${t("docs_h")}</h2><span class="spacer"></span>
          <select class="input" id="spec" style="width:auto"><option value="">${t("specimen")}</option>${specOpts.map((s) => `<option ${k.specimen === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <p class="small muted">${t("docs_lead")}</p>
        ${DOCS.map((d) => {
          const x = k.extracted[d], th = memThumbs[d] || k.thumbs[d];
          const st = !x ? "" : x.blur < 200 ? `<span class="pill warn">${H ? "धुंधला" : "Blurred"}</span>` : Math.abs(x.skew) >= 2 ? `<span class="pill">${H ? "सीधा किया" : "Straightened"}</span>` : `<span class="pill ok">${H ? "पढ़ लिया" : "Read"}</span>`;
          return `<div class="doc"><div class="thumb" style="${th ? `background-image:url('${th}')` : ""}">${th ? "" : "▤"}</div>
            <div><b>${t(LBL[d])}</b> ${st}<div class="tiny muted" id="p_${d}">${x ? (x.text ? esc(x.text.split("\n").filter((l) => l.trim()).slice(2, 4).join(" · ")).slice(0, 90) : H ? "पढ़ा नहीं जा सका" : "Could not read text") : "—"}</div></div>
            <label class="btn sm ghost">${x ? t("replace") : t("upload")}<input type="file" accept="image/*" data-doc="${d}" hidden></label></div>`;
        }).join("")}
        <div class="row wrap"><button class="btn sm ghost" id="dl">⬇ ${t("digilocker")}</button><span class="tiny muted">${H ? "मॉक: असली में DigiLocker OAuth से" : "Mock: production uses DigiLocker OAuth with consent"}</span></div>
      </div>
    </div>
    <div class="card summary">
      <h2>${t("results")}</h2>
      <div class="row" style="margin-bottom:10px">${docsDone ? `<span class="pill ${clear ? "ok" : nBad ? "bad" : "warn"}">${clear ? t("all_clear") : `${nBad + nWarn} ${H ? "समस्या" : "to fix"}`}</span>` : ""}<span class="tiny muted">${docsDone}/4 ${H ? "दस्तावेज़" : "documents"}</span></div>
      <div class="checks">${docsDone ? res.checks.map((c) => `<div class="check ${c.lvl}"><span class="ic">${{ ok: "✓", warn: "!", bad: "✕", info: "i" }[c.lvl]}</span><span>${esc(c.msg)}</span></div>`).join("") : `<div class="muted small">${H ? "दस्तावेज़ जोड़ें या नमूना आवेदक चुनें" : "Add documents or load a specimen applicant to see live checks."}</div>`}</div>
      <hr class="soft">
      ${!clear && docsDone ? `<p class="small muted">${t("needs_fix")}</p>` : ""}
      <button class="btn block" id="esign" ${clear ? "" : "disabled"}>${k.esign ? "✓ " : ""}${t("esign")}</button>
      <button class="btn block ghost" id="place" style="margin-top:8px" ${clear && k.esign ? "" : "disabled"}>${t("place")} →</button>
      <p class="tiny muted">${H ? "जाँच की तारीख" : "Checks run as of"} ${isoDate(TODAY)}</p>
    </div>
  </div>`;

  v.querySelector("#lookupBtn").onclick = () => {
    k.gstin = v.querySelector("#gstin").value.trim().toUpperCase(); k.udyam = v.querySelector("#udyam").value.trim().toUpperCase();
    applyGst(k.gstin); save(); render();
  };
  v.querySelector("#spec").onchange = (e) => {
    const id = e.target.value; if (!id) return;
    k.specimen = id; k.extracted = {}; k.thumbs = {}; k.esign = false; k.lookup = null; k.gstin = ""; k.digilocker = false;
    for (const d of DOCS) {
      const x = D.specimens_ocr[id][d];
      k.extracted[d] = x || null;
      if (x) k.thumbs[d] = `specimens/${id}_${d}.png`;
      delete memThumbs[d];
    }
    if (!k.extracted.udyam_certificate) delete k.extracted.udyam_certificate;
    const r = validate(k.extracted, D.gstin, D.udyam);
    if (r.gstin) { k.gstin = r.gstin; applyGst(r.gstin); }
    const um = (k.extracted.udyam_certificate?.text || "").replace(/ /g, "").match(/UDYAM-[A-Z]{2}-\d{2}-\d{7}/);
    k.udyam = um ? um[0] : "";
    save(); render();
  };
  v.querySelectorAll("[data-doc]").forEach((inp) => (inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const d = inp.dataset.doc, url = URL.createObjectURL(f), img = new Image();
    img.src = url; await img.decode();
    memThumbs[d] = url;
    const p = v.querySelector("#p_" + d);
    p.textContent = t("reading");
    const blur = blurScore(img), skew = blur < 200 ? 0 : skewAngle(img);
    let text = "";
    if (blur >= 200) {
      try { text = await ocrImage(img, skew, (x) => (p.textContent = `${t("reading")} ${Math.round(x * 100)}%`)); }
      catch { toast(H ? "OCR लोड नहीं हुआ (इंटरनेट चाहिए)" : "OCR engine could not load (needs internet)"); }
    }
    k.extracted[d] = { text, blur, skew }; k.specimen = "";
    if (d === "gst_certificate") { const r = validate(k.extracted, D.gstin, D.udyam); if (r.gstin) { k.gstin = r.gstin; applyGst(r.gstin); } }
    save(); render();
  }));
  v.querySelector("#dl").onclick = () => { k.digilocker = true; save(); toast(H ? "DigiLocker से हस्ताक्षरकर्ता की पहचान मिली (मॉक)" : "Signatory identity fetched from DigiLocker (mock)"); render(); };
  v.querySelector("#esign").onclick = () => {
    const m = modal(`<h2>${t("esign")}</h2><p class="small muted">${H ? "मॉक: आधार से जुड़े मोबाइल पर आया 6 अंकों का OTP डालें (कोई भी 6 अंक)।" : "Mock: enter the 6-digit OTP sent to the Aadhaar-linked mobile (any 6 digits)."}</p>
      <input class="input" id="otp" inputmode="numeric" maxlength="6" placeholder="••••••"><div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn ghost" id="c">${t("close")}</button><button class="btn" id="ok">${H ? "साइन करें" : "Sign"}</button></div>`);
    m.querySelector("#c").onclick = closeModal;
    m.querySelector("#ok").onclick = () => { if (!/^\d{6}$/.test(m.querySelector("#otp").value)) return toast("6 digits"); k.esign = true; save(); closeModal(); render(); };
  };
  v.querySelector("#place").onclick = () => {
    const q = price(S.items, D.catalogue, S.spread);
    S.order = { id: "EB-26-" + String(Math.floor(1000 + Math.random() * 9000)), placed: isoDate(TODAY), stage: 2, items: S.items.map((i) => ({ ...i })), q, city: S.profile?.city, business: L?.rec?.[1] || S.profile?.gstName || "", slot: null };
    save(); go("track");
  };
}
