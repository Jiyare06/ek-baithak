import { STR } from "./i18n.js";
import { renderHome, renderSettings } from "./views/home.js";
import { renderAdvisor } from "./views/advisor.js";
import { renderQuote } from "./views/quote.js";
import { renderKyc } from "./views/kyc.js";
import { renderTracker } from "./views/tracker.js";
import { renderConsole } from "./views/console.js";

// ---------- state ---------------------------------------------------------
const KEY = "ekb_state_v1";
const fresh = () => ({ lang: "en", profile: null, chat: [], step: 0, items: [], spread: true, kyc: { consent: null, extracted: {}, thumbs: {}, specimen: "", gstin: "", udyam: "", lookup: null, esign: false }, order: null, lastRemoved: null, voice: false, assigned: {}, llm: { key: "", model: "claude-sonnet-4-5" } });
export const S = (() => { try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return fresh(); } })();
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: keep in memory */ } };
export const reset = () => { const keep = { lang: S.lang, llm: S.llm, assigned: S.assigned }; Object.assign(S, fresh(), keep); save(); };

export const t = (k, vars) => {
  let s = (STR[S.lang] && STR[S.lang][k]) || STR.en[k] || k;
  if (vars) for (const v in vars) s = s.replace("{" + v + "}", vars[v]);
  return s;
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function toast(msg) {
  const el = document.getElementById("toast"); el.textContent = msg; el.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add("hidden"), 2600);
}
export function modal(html) {
  const m = document.getElementById("modal"); m.innerHTML = `<div class="box">${html}</div>`; m.classList.remove("hidden");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return m;
}
export const closeModal = () => document.getElementById("modal").classList.add("hidden");

// ---------- data -----------------------------------------------------------
export const D = {};
async function loadData() {
  const names = ["catalogue", "gstin", "udyam", "cities", "leads_open", "model", "specimens_ocr"];
  const res = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
  names.forEach((n, i) => (D[n] = res[i]));
  D.C = Object.fromEntries(D.catalogue.map((p) => [p.id, p]));
}

// ---------- router ---------------------------------------------------------
const ROUTES = [
  { id: "home", ico: "⌂", render: renderHome },
  { id: "advisor", ico: "✦", render: renderAdvisor },
  { id: "whatsapp", ico: "✆", render: (v) => renderAdvisor(v, { wa: true }) },
  { id: "quote", ico: "₹", render: renderQuote },
  { id: "kyc", ico: "✓", render: renderKyc },
  { id: "track", ico: "◷", render: renderTracker },
  { id: "console", ico: "▤", render: renderConsole, staff: true },
];
export const go = (id) => { location.hash = "#" + id; };

function nav(active) {
  const link = (r) => `<a href="#${r.id}" class="${r.id === active ? "active" : ""}"><span class="ico">${r.ico}</span><span>${t("nav_" + r.id)}</span></a>`;
  document.getElementById("nav").innerHTML =
    `<div class="sep">${t("nav_customer")}</div>` + ROUTES.filter((r) => !r.staff).map(link).join("") +
    `<div class="sep">${t("nav_staff")}</div>` + ROUTES.filter((r) => r.staff).map(link).join("");
  document.getElementById("bottomNav").innerHTML = ROUTES.map(link).join("");
  document.getElementById("crumb").textContent = t("nav_" + active);
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
}

export function render() {
  const id = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  nav(r.id);
  document.documentElement.lang = S.lang;
  const view = document.getElementById("view");
  view.innerHTML = "";
  r.render(view);
  window.scrollTo(0, 0);
}

async function boot() {
  const lang = document.getElementById("lang");
  lang.value = S.lang;
  lang.onchange = () => { S.lang = lang.value; save(); render(); };
  document.getElementById("settingsBtn").onclick = renderSettings;
  document.getElementById("view").innerHTML = `<div class="muted">Loading…</div>`;
  await loadData();
  window.addEventListener("hashchange", render);
  render();
}
boot();
