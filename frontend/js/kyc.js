// Smart-KYC: image quality, OCR and validation rules.
// JS twin of analysis/kyc_validator.py. Runs fully in the browser; no document
// leaves the device in this prototype.

export const TODAY = new Date(2026, 6, 15); // "today" fixed by the dataset README
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const DOCS = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"];
const CH = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinChecksumOk(g) {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  let t = 0;
  for (let i = 0; i < 14; i++) { const v = CH.indexOf(g[i]) * (i % 2 ? 2 : 1); t += Math.floor(v / 36) + (v % 36); }
  return CH[(36 - (t % 36)) % 36] === g[14];
}

const DIGIT_POS = new Set([0, 1, 7, 8, 9, 10]), LETTER_POS = new Set([2, 3, 4, 5, 6, 11]);
const TO_DIGIT = { O: "0", D: "0", Q: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };
const TO_LETTER = { 0: "O", 1: "I", 2: "Z", 5: "S", 8: "B", 6: "G" };
const CONF = new Set(["O0", "IJ", "IT", "I1", "IL", "S5", "B8", "Z2", "G6", "D0", "QO"].flatMap((p) => [p, p[1] + p[0]]));

/** Normalise an OCR'd GSTIN by position and snap to the registry if the only differences are OCR confusions. */
export function resolveGstin(raw, reg) {
  raw = raw.toUpperCase();
  const g = [...raw].map((c, i) => (DIGIT_POS.has(i) ? TO_DIGIT[c] || c : LETTER_POS.has(i) ? TO_LETTER[c] || c : c)).join("");
  if (reg[g]) return { gstin: g, corrected: g !== raw };
  for (const cand in reg) {
    if (cand.slice(0, 2) !== g.slice(0, 2)) continue;
    const diff = [];
    for (let i = 0; i < 15; i++) if (cand[i] !== g[i]) diff.push(cand[i] + g[i]);
    if (diff.length && diff.length <= 3 && diff.every((d) => CONF.has(d))) return { gstin: cand, corrected: true };
  }
  return { gstin: g, corrected: false };
}

export const maskId = (s) => !s || s.length <= 6 ? s : s.startsWith("UDYAM") ? s.slice(0, 9) + "•••••" + s.slice(-3) : s.slice(0, 4) + "•".repeat(s.length - 7) + s.slice(-3);

function field(text, label) {
  let m = text.match(new RegExp(label + "[ \\t]*:?[ \\t]*(.+)"));
  if (m && m[1].trim()) return m[1].trim();
  m = text.match(new RegExp(label + "[ \\t]*\\n\\s*(.+)"));
  return m ? m[1].trim() : "";
}
const norm = (s) => s.toLowerCase().replace(/\b(llp|pvt|ltd|private|limited)\b/g, "").replace(/[^a-z0-9]/g, "");
const LBL = { gst_certificate: "GST certificate", udyam_certificate: "Udyam certificate", signatory_id: "Signatory ID", address_proof: "Address proof" };

/**
 * Apply every rule. extracted[doc] = {text, blur, skew} | null
 * Returns {checks:[{lvl:'ok'|'info'|'warn'|'bad', msg}], gstin, gstRecord}
 */
export function validate(extracted, gstReg, udyReg) {
  const checks = [], push = (lvl, msg) => checks.push({ lvl, msg });
  for (const d of DOCS) {
    const x = extracted[d];
    if (!x) push("bad", `${LBL[d]} not uploaded yet.`);
    else if (x.blur < 200) push("warn", `${LBL[d]} is blurred and can't be read. Retake it in good light, holding the phone steady.`);
    else if (Math.abs(x.skew) >= 2) push("info", `${LBL[d]} was tilted ${x.skew > 0 ? "+" : ""}${x.skew}°. We straightened it automatically.`);
    else push("ok", `${LBL[d]} is clear and readable.`);
  }
  const T = (d) => (extracted[d] && extracted[d].text) || "";
  const gst = T("gst_certificate"), udy = T("udyam_certificate"), sid = T("signatory_id"), adr = T("address_proof");
  let gstin = null, gstRecord = null;

  const m = gst.match(/GSTIN\s+([0-9A-Z]{15})/);
  if (m) {
    const r = resolveGstin(m[1], gstReg);
    gstin = r.gstin;
    if (!gstinChecksumOk(gstin)) push("bad", `GSTIN ${maskId(gstin)} fails the checksum. A digit has been altered or mistyped.`);
    else if (!gstReg[gstin]) push("bad", `GSTIN ${maskId(gstin)} is not in the GST registry.`);
    else {
      gstRecord = gstReg[gstin];
      const st = gstRecord[6];
      if (st !== "Active") push("bad", `GSTIN ${maskId(gstin)} is ${st} in the GST registry. Products that need GST can't be sold.`);
      else push("ok", `GSTIN ${maskId(gstin)} is valid and Active in the registry${r.corrected ? " (OCR misread corrected against registry)" : ""}.`);
    }
    const legal = field(gst, "Legal name"), trade = field(gst, "Trade[\\s-]*name");
    const prop = legal.match(/\(Prop\. (.+?)\)/);
    if (prop && trade && norm(prop[1]) !== norm(trade)) push("warn", `Name mismatch: legal name says "${prop[1]}" but trade name says "${trade}". Upload the latest certificate or explain the change.`);
    else if (trade) push("ok", `Business name "${trade}" matches across the certificate.`);
  } else if (extracted.gst_certificate && extracted.gst_certificate.blur >= 200) push("warn", "GSTIN could not be read from the certificate.");

  // Cross-document check: every document must belong to the same business
  const trade = field(gst, "Trade[\\s-]*name");
  if (trade) {
    const others = { "Udyam certificate": field(udy, "Enterprise name"), "Address proof": field(adr, "Billed to"), "Signatory ID": field(sid, "For business") };
    for (const [doc, name] of Object.entries(others))
      if (name && norm(name) !== norm(trade) && !norm(name).includes(norm(trade)) && !norm(trade).includes(norm(name)))
        push("bad", `${doc} is for "${name}", not "${trade}". All documents must belong to the same business.`);
  }
  if (extracted.udyam_certificate) {
    const um = udy.replace(/ /g, "").match(/UDYAM-[A-Z]{2}-\d{2}-\d{7}/);
    if (!um) push("warn", "The Udyam certificate has no registration number on it. Upload the full certificate from udyamregistration.gov.in.");
    else if (!udyReg[um[0]]) push("bad", `Udyam number ${maskId(um[0])} is not in the Udyam registry.`);
    else push("ok", `Udyam ${maskId(um[0])} found: ${udyReg[um[0]][1]} enterprise, ${udyReg[um[0]][5]}.`);
  }
  const bm = adr.match(/Bill date\s+(\d{4}-\d{2}-\d{2})/);
  if (bm) {
    const age = Math.round((TODAY - new Date(bm[1] + "T00:00:00")) / 864e5);
    if (age > 90) push("warn", `Address proof is ${age} days old. Please upload a bill from the last 90 days.`);
    else push("ok", `Address proof dated ${bm[1]} (${age} days old) is recent enough.`);
  }
  const vm = sid.match(/Valid till\s*\n?\s*(\d{4}-\d{2}-\d{2})/);
  if (vm) {
    if (new Date(vm[1]) < TODAY) push("bad", "The signatory ID has expired.");
    else push("ok", `Signatory ID valid till ${vm[1]}.`);
  }
  return { checks, gstin, gstRecord };
}

// ---------- in-browser image checks ---------------------------------------
function toGray(img, w) {
  const h = Math.round((img.naturalHeight || img.height) * w / (img.naturalWidth || img.width));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return { g, w, h };
}
export function blurScore(img) {
  const { g, w, h } = toGray(img, 620);
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = -4 * g[i] + g[i - 1] + g[i + 1] + g[i - w] + g[i + w];
    s += v; s2 += v * v; n++;
  }
  return Math.round(s2 / n - (s / n) ** 2);
}
export function skewAngle(img) {
  const { g, w, h } = toGray(img, 300);
  let best = -1, bestA = 0;
  for (let a = -8; a <= 8; a += 0.5) {
    const r = (a * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), rows = new Float32Array(h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 2) {
      if (g[y * w + x] < 128) { const yy = Math.round(-x * sn + y * cs + (w / 2) * sn); if (yy >= 0 && yy < h) rows[yy]++; }
    }
    let m = 0; for (const v of rows) m += v; m /= h;
    let v2 = 0; for (const v of rows) v2 += (v - m) ** 2;
    if (v2 > best) { best = v2; bestA = a; }
  }
  return bestA;
}

let tess = null;
/** OCR with tesseract.js (vendored, runs in the browser), loaded lazily only when a user uploads their own file. */
export async function ocrImage(img, angle, onProgress) {
  if (!tess) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "vendor/tesseract/tesseract.min.js"; // vendored: no third-party CDN sees the document
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    const base = new URL("vendor/tesseract/", location.href).href;
    tess = await window.Tesseract.createWorker("eng", 1, {
      workerPath: base + "worker.min.js", corePath: base, langPath: base + "lang", gzip: true, workerBlobURL: false,
      logger: (m) => onProgress && m.progress && onProgress(m.progress),
    });
    await tess.setParameters({ tessedit_pageseg_mode: "6" });
  }
  let src = img;
  if (Math.abs(angle) >= 1) {
    const c = document.createElement("canvas"), W = img.naturalWidth, H = img.naturalHeight;
    c.width = W; c.height = H; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H); x.translate(W / 2, H / 2); x.rotate((-angle * Math.PI) / 180); x.drawImage(img, -W / 2, -H / 2);
    src = c;
  }
  const { data } = await tess.recognize(src);
  return data.text;
}
