// Recommendation, eligibility and pricing engine.
// Deterministic on purpose: the LLM may explain a bundle, but only these rules
// decide which products are offered and at what price. Pure functions, no DOM.

export const BUSINESS_TYPES = [
  { id: "kirana", en: "Kirana / grocery", hi: "किराना / जनरल स्टोर", seg: "micro", kw: ["kirana", "grocery", "general store", "किराना"] },
  { id: "salon", en: "Salon / beauty", hi: "सैलून / ब्यूटी", seg: "micro", kw: ["salon", "parlour", "parlor", "beauty", "सैलून"] },
  { id: "pharmacy", en: "Pharmacy", hi: "फ़ार्मेसी / मेडिकल", seg: "micro", kw: ["pharmacy", "chemist", "medical store", "मेडिकल"] },
  { id: "food", en: "Bakery / food shop", hi: "बेकरी / खाने की दुकान", seg: "micro", kw: ["bakery", "sweet", "cafe", "food", "बेकरी"] },
  { id: "clinic", en: "Clinic / diagnostic lab", hi: "क्लिनिक / लैब", seg: "prof", kw: ["clinic", "dental", "doctor", "lab", "diagnostic", "physio", "क्लिनिक"] },
  { id: "office", en: "CA / law / consultancy", hi: "CA / वकील / कंसल्टेंसी", seg: "prof", kw: ["ca firm", "chartered", "law", "legal", "consult", "insurance", "agency", "वकील"] },
  { id: "coaching", en: "Coaching centre", hi: "कोचिंग सेंटर", seg: "prof", kw: ["coaching", "tuition", "academy", "institute", "कोचिंग"] },
  { id: "restaurant", en: "Restaurant / café chain", hi: "रेस्टोरेंट चेन", seg: "multi", kw: ["restaurant", "dhaba", "chain", "रेस्टोरेंट"] },
  { id: "retail", en: "Retail chain (2+ stores)", hi: "रिटेल चेन (2+ दुकानें)", seg: "multi", kw: ["retail chain", "stores", "showroom", "outlets", "hotel"] },
  { id: "mfg", en: "Manufacturing unit", hi: "मैन्युफ़ैक्चरिंग यूनिट", seg: "mfg", kw: ["factory", "manufactur", "unit", "textile", "auto parts", "auto-parts", "workshop", "फ़ैक्ट्री"] },
];
export const EMP = [{ v: 2, l: "1-2" }, { v: 6, l: "3-9" }, { v: 15, l: "10-24" }, { v: 40, l: "25-99" }, { v: 120, l: "100+" }];
export const SITES = [{ v: 1, l: "1" }, { v: 2, l: "2" }, { v: 4, l: "3-5" }, { v: 8, l: "6+" }];
export const NETS = [
  { id: "hotspot", en: "Mobile hotspot", hi: "मोबाइल हॉटस्पॉट" }, { id: "home", en: "Home broadband", hi: "घर का ब्रॉडबैंड" },
  { id: "biz", en: "Business broadband", hi: "बिज़नेस ब्रॉडबैंड" }, { id: "ll", en: "Leased line", hi: "लीज़्ड लाइन" },
  { id: "mixed", en: "Different ISP per site", hi: "हर जगह अलग ISP" }, { id: "none", en: "Nothing yet", hi: "अभी कुछ नहीं" },
];
export const NEEDS = [
  { id: "pos", en: "UPI & billing counter", hi: "UPI और बिलिंग", p: "P19" },
  { id: "cctv", en: "CCTV on my phone", hi: "फ़ोन पर CCTV", p: "P23" },
  { id: "wa", en: "WhatsApp customers", hi: "ग्राहकों को WhatsApp", p: "P15" },
  { id: "email", en: "Business email & docs", hi: "बिज़नेस ईमेल", p: "P16" },
  { id: "backup", en: "Data backup", hi: "डेटा बैकअप", p: "P17" },
  { id: "secure", en: "Protect PCs from viruses", hi: "कंप्यूटर सुरक्षा", p: "P20" },
  { id: "failover", en: "Never go offline", hi: "इंटरनेट कभी बंद न हो", p: "P09" },
  { id: "wifi", en: "Guest Wi-Fi", hi: "ग्राहकों के लिए Wi-Fi", p: "P22" },
  { id: "calls", en: "One number for customer calls", hi: "ग्राहक कॉल के लिए एक नंबर", p: "P13" },
  { id: "web", en: "Website", hi: "वेबसाइट", p: "P18" },
  { id: "iot", en: "Monitor machines", hi: "मशीनों की निगरानी", p: "P24" },
  { id: "fleet", en: "Track vehicles", hi: "गाड़ियाँ ट्रैक करें", p: "P25" },
];

const FIXED = ["P01", "P02", "P03", "P04", "P05", "P06"];

/** Why a product can't be offered to this profile (null = eligible). */
export function ineligibleReason(p, prof, items, lang = "en") {
  const H = lang === "hi";
  if (!p.tiers.includes(prof.tier)) return H ? "आपके शहर में उपलब्ध नहीं" : "Not sold in tier-" + prof.tier + " cities yet";
  if (prof.employees < p.minEmployees) return H ? `${p.minEmployees}+ कर्मचारियों के लिए` : `Needs ${p.minEmployees}+ employees`;
  if (prof.sites < p.minSites) return H ? `${p.minSites}+ जगहों के लिए` : `Needs ${p.minSites}+ sites`;
  if (p.requiresGstin && !(prof.gstin && prof.gstStatus === "Active"))
    return H ? "सक्रिय GSTIN ज़रूरी" : prof.gstin ? `Needs an active GSTIN (yours is ${prof.gstStatus})` : "Needs an active GSTIN";
  if (p.requiresOneOf.length && items && !p.requiresOneOf.some((id) => items.some((i) => i.id === id)))
    return H ? "पहले फ़ाइबर/लीज़्ड लाइन चाहिए" : "Needs a fibre or leased-line connection in the bundle";
  return null;
}

/** Build the recommended bundle. Returns [{id, qty, why}] */
export function recommend(prof, cat) {
  const C = Object.fromEntries(cat.map((p) => [p.id, p]));
  const items = [];
  const ok = (id) => !ineligibleReason(C[id], prof, items);
  const add = (id, qty, why) => { if (C[id] && ok(id) && !items.find((i) => i.id === id)) items.push({ id, qty: Math.max(1, qty), why }); };
  const { seg, employees: e, sites: s, net, needs = [] } = prof;
  const H = prof.lang === "hi";

  // 1. Connectivity: the backbone every other product depends on
  if (seg === "mfg") {
    if (e >= 25 && ok("P06")) add("P06", s, H ? "मशीनों और ERP के लिए 100 Mbps समर्पित लाइन" : "Dedicated 100 Mbps for machines and ERP, not shared with anyone");
    else if (ok("P05")) add("P05", s, H ? "समर्पित लाइन: स्पीड कभी नहीं गिरती" : "Dedicated 20 Mbps line, so speed never drops at peak hours");
    else add("P02", s, H ? "पूरी यूनिट के लिए 300 Mbps फ़ाइबर" : "300 Mbps fibre for the whole unit (leased line needs an active GSTIN)");
  } else if (seg === "micro" && (net === "hotspot" || net === "none") && s === 1) {
    add("P04", s, H ? "हॉटस्पॉट से बेहतर, और फ़ाइबर का इंतज़ार नहीं: 2 दिन में चालू" : "Better than a phone hotspot, and no wait for fibre: live in 2 days");
  } else if (seg === "micro") {
    add("P01", s, H ? "UPI और बिलिंग के लिए भरोसेमंद 100 Mbps फ़ाइबर" : "Reliable 100 Mbps fibre so UPI and billing never stall");
  } else if (seg === "prof") {
    if (e >= 25 && ok("P03")) add("P03", s, H ? "बड़ी टीम के लिए 1 Gbps और प्राथमिक सपोर्ट" : "1 Gbps with priority support for a larger team");
    else if (e >= 6) add("P02", s, H ? "पूरी टीम के लिए 300 Mbps, एक साथ वीडियो कॉल भी" : "300 Mbps so the whole team can work and video-call at once");
    else add("P01", s, H ? "छोटे ऑफ़िस के लिए 100 Mbps फ़ाइबर" : "100 Mbps fibre, right-sized for a small office");
  } else {
    add("P01", s, H ? `हर जगह (${s}) एक जैसा फ़ाइबर, एक बिल` : `Same fibre at all ${s} sites, on one bill`);
  }

  // 2. Mobile lines
  if (seg === "micro") add("P07", 1, H ? "दुकान का बिज़नेस नंबर, निजी नंबर से अलग" : "A business number for the shop, separate from your personal one");
  else add("P08", Math.min(10, Math.max(1, Math.round(e / 5))), H ? "मुख्य स्टाफ़ के लिए बिज़नेस नंबर, एक बिल पर" : "Business numbers for key staff, all on the same bill");

  // 3. Needs the owner asked for
  const qtyFor = { P19: seg === "micro" ? 1 : s, P23: 2 * s, P16: Math.min(e, 50), P20: Math.min(e, 50), P09: s, P22: s, P24: 5, P25: 3 };
  const whyFor = {
    P19: H ? "UPI, बिल और स्टॉक एक जगह" : "UPI, bills and stock in one place",
    P23: H ? "हर जगह 2 कैमरे, फ़ोन पर लाइव" : "2 cameras per site, live on your phone",
    P15: H ? "ग्राहकों को ऑफ़र और रिमाइंडर WhatsApp पर" : "Send offers and reminders to customers on WhatsApp",
    P16: H ? "हर व्यक्ति का प्रोफ़ेशनल ईमेल और दस्तावेज़" : "A professional email and shared documents for everyone",
    P17: H ? "रिकॉर्ड सुरक्षित, कंप्यूटर ख़राब हो तब भी" : "Records stay safe even if a computer fails",
    P20: H ? "हर कंप्यूटर वायरस और रैनसमवेयर से सुरक्षित" : "Every computer protected from viruses and ransomware",
    P09: H ? "फ़ाइबर कटे तो 4G/5G अपने-आप चालू" : "If fibre is cut, 4G/5G takes over automatically",
    P22: H ? "ग्राहकों का Wi-Fi आपके सिस्टम से अलग" : "Customer Wi-Fi kept apart from your own systems",
    P13: H ? "ग्राहकों के लिए एक टोल-फ़्री नंबर" : "One toll-free number customers can remember",
    P18: H ? "Google पर दिखने के लिए वेबसाइट और डोमेन" : "A website and domain so customers find you on Google",
    P24: H ? "मशीन रुकने से पहले अलर्ट" : "Alerts before a machine stops",
    P25: H ? "गाड़ियाँ लाइव मैप पर" : "Vehicles on a live map",
  };
  const ids = needs.map((n) => NEEDS.find((x) => x.id === n)?.p).filter(Boolean);
  if (!ids.length) ({ micro: ["P19"], prof: ["P16", "P20"], multi: ["P19", "P09", "P23"], mfg: ["P16", "P20"] }[seg] || []).forEach((x) => ids.push(x));
  for (const id of ids) {
    if (id === "P13" && !ok("P13") && ok("P12") && e >= 3) { add("P12", 2, H ? "ग्राहक कॉल के लिए क्लाउड नंबर" : "Cloud phone line for customer calls"); continue; }
    add(id, qtyFor[id] || 1, whyFor[id]);
  }
  return items;
}

/** Products not in the bundle that this segment usually wants, with eligibility. */
export function addonOptions(prof, cat, items, lang) {
  return cat
    .filter((p) => !items.find((i) => i.id === p.id))
    .filter((p) => p.segments.includes(prof.seg) && !FIXED.includes(p.id) && !["P07", "P08"].includes(p.id))
    .map((p) => ({ p, reason: ineligibleReason(p, prof, items, lang) }));
}

/** Drop items that became ineligible (e.g. GSTIN found cancelled) or lost their dependency. */
export function enforce(prof, cat, items) {
  const C = Object.fromEntries(cat.map((p) => [p.id, p]));
  let out = items.slice(), changed = true;
  while (changed) {
    changed = false;
    for (const it of out) if (ineligibleReason(C[it.id], prof, out)) { out = out.filter((x) => x !== it); changed = true; break; }
  }
  return out;
}

export function price(items, cat, spread) {
  const C = Object.fromEntries(cat.map((p) => [p.id, p]));
  let monthly = 0, setup = 0, term = 1, install = 0;
  for (const i of items) {
    const p = C[i.id];
    monthly += p.priceMin * i.qty; setup += p.setup * i.qty;
    term = Math.max(term, p.minContract); install = Math.max(install, p.installDays);
  }
  term = Math.max(term, 12);
  const spreadAdd = spread ? Math.ceil(setup / term) : 0;
  return { monthly: monthly + spreadAdd, base: monthly, setup: spread ? 0 : setup, setupTotal: setup, term, install, spreadAdd };
}

/** Very small free-text parser so owners can just type their situation. */
export function parseFreeText(txt, cities) {
  const t = txt.toLowerCase(), out = {};
  const type = BUSINESS_TYPES.find((b) => b.kw.some((k) => t.includes(k)));
  if (type) out.type = type.id;
  const em = t.match(/(\d+)\s*(staff|people|employees|log|लोग|कर्मचारी|workers|members)/);
  if (em) out.employees = +em[1];
  const sm = t.match(/(\d+)\s*(sites|branches|outlets|stores|shops|locations|units|ब्रांच|दुकान)/);
  if (sm) out.sites = +sm[1];
  const city = Object.keys(cities).find((c) => t.includes(c.toLowerCase()));
  if (city) out.city = city;
  return out;
}

export const fmt = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
