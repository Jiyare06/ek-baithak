"""Smart-KYC reference validator (Python twin of frontend/js/kyc.js).

Runs OCR + image-quality checks on the 12 specimen applicants and applies the
validation rules against the mock GSTIN / Udyam registries.

Usage:  python analysis/kyc_validator.py            # prints a report
        python analysis/kyc_validator.py --cache    # also writes frontend/data/specimens_ocr.json
Needs:  tesseract on PATH, Pillow, numpy, pandas
"""
import datetime as dt
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "frontend" / "specimens"
TODAY = dt.date(2026, 7, 15)          # "today" fixed by the dataset README
DOCS = ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"]
GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

gst_reg = pd.read_csv(ROOT / "data" / "mock_gstin_registry.csv").set_index("gstin")
udy_reg = pd.read_csv(ROOT / "data" / "mock_udyam_registry.csv").set_index("udyam_number")


# ---------- image quality --------------------------------------------------
def gray(path, w=620):
    im = Image.open(path).convert("L")
    return im.resize((w, int(im.height * w / im.width)))


def blur_score(path):
    a = np.asarray(gray(path), dtype=float)
    lap = -4 * a[1:-1, 1:-1] + a[:-2, 1:-1] + a[2:, 1:-1] + a[1:-1, :-2] + a[1:-1, 2:]
    return float(lap.var())


def skew_angle(path):
    """Projection-profile skew estimate in degrees (0 = straight)."""
    im = gray(path, 400)
    best, best_a = -1, 0
    for a in np.arange(-8, 8.5, 0.5):
        b = np.asarray(im.rotate(a, fillcolor=255), dtype=float) < 128
        v = b.sum(axis=1).var()
        if v > best:
            best, best_a = v, a
    return float(best_a)


def ocr(path, angle=0.0):
    src = Image.open(path)
    if abs(angle) >= 1:
        src = src.rotate(angle, fillcolor="white", expand=True)
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        src.save(f.name)
        return subprocess.run(["tesseract", f.name, "-", "--psm", "6"], capture_output=True, text=True).stdout


# ---------- identifier checks ------------------------------------------------
def gstin_checksum_ok(g):
    if not re.fullmatch(r"\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]", g):
        return False
    total = 0
    for i, ch in enumerate(g[:14]):
        v = GST_CHARS.index(ch) * (2 if i % 2 else 1)
        total += v // 36 + v % 36
    return GST_CHARS[(36 - total % 36) % 36] == g[14]


DIGIT_POS, LETTER_POS = {0, 1, 7, 8, 9, 10}, {2, 3, 4, 5, 6, 11}
TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"}
TO_LETTER = {v: k for k, v in TO_DIGIT.items() if k in "OIZSBG"}
CONFUSABLE = {frozenset(p) for p in ["O0", "IJ", "IT", "I1", "IL", "S5", "B8", "Z2", "G6", "D0", "QO"]}


def resolve_gstin(raw):
    """Normalise an OCR'd GSTIN by position, then snap to a registry entry if the
    only differences are classic OCR confusions (O/0, I/J/T, S/5 ...).
    Returns (gstin, corrected?)."""
    raw = raw.upper()
    g = "".join(TO_DIGIT.get(c, c) if i in DIGIT_POS else TO_LETTER.get(c, c) if i in LETTER_POS else c
                for i, c in enumerate(raw))
    if g in gst_reg.index:
        return g, g != raw
    for cand in gst_reg.index:
        if cand[:2] != g[:2]:
            continue
        diff = [(a, b) for a, b in zip(cand, g) if a != b]
        if 0 < len(diff) <= 3 and all(frozenset(x) in CONFUSABLE for x in diff):
            return cand, True
    return g, False


def field(text, label):
    m = re.search(label + r"[ \t]*:?[ \t]*(.*)", text)
    if m and m.group(1).strip():
        return m.group(1).strip()
    m = re.search(label + r"[ \t]*\n\s*(.+)", text)       # value on next line (ID cards)
    return m.group(1).strip() if m else ""


def norm(s):
    s = re.sub(r"\b(llp|pvt|ltd|private|limited)\b", "", s.lower())
    return re.sub(r"[^a-z0-9]", "", s)


# ---------- rules -----------------------------------------------------------
def validate(app_id, extracted):
    issues, facts = [], {}
    for d in DOCS:
        x = extracted.get(d)
        if x is None:
            issues.append(("block", f"{d.replace('_', ' ').title()} not uploaded"))
        elif x["blur"] < 200:
            issues.append(("fix", f"{d.replace('_', ' ').title()} is blurred - retake the photo in good light"))
        elif abs(x["skew"]) >= 2:
            issues.append(("info", f"{d.replace('_', ' ').title()} tilted {x['skew']:+.1f} deg - auto-straightened"))
    gst = extracted.get("gst_certificate", {}).get("text", "")
    udy = extracted.get("udyam_certificate", {}).get("text", "") if extracted.get("udyam_certificate") else ""
    sid = extracted.get("signatory_id", {}).get("text", "")
    adr = extracted.get("address_proof", {}).get("text", "")

    m = re.search(r"GSTIN\s+([0-9A-Z]{15})", gst)
    if m:
        g, fixed = resolve_gstin(m.group(1))
        facts["gstin"] = g
        if not gstin_checksum_ok(g):
            issues.append(("block", "GSTIN fails the checksum - digits altered or mistyped"))
        elif g not in gst_reg.index:
            issues.append(("block", "GSTIN not found in GST registry"))
        else:
            st = gst_reg.loc[g, "status"]
            if st != "Active":
                issues.append(("block", f"GSTIN is {st} in the registry - GST-only products cannot be sold"))
            trade = field(gst, r"Trade[\s-]*name")
            if trade and norm(trade) != norm(gst_reg.loc[g, "trade_name"]):
                issues.append(("fix", "Trade name on certificate differs from registry"))
        legal, trade = field(gst, "Legal name"), field(gst, r"Trade[\s-]*name")
        prop = re.search(r"\(Prop\. (.+?)\)", legal)
        if prop and trade and norm(prop.group(1)) != norm(trade):
            issues.append(("fix", f"Name mismatch: legal name says '{prop.group(1)}', trade name says '{trade}'"))
        facts["trade"] = trade
    elif extracted.get("gst_certificate") and extracted["gst_certificate"]["blur"] >= 200:
        issues.append(("fix", "GSTIN could not be read from the certificate"))

    trade = field(gst, r"Trade[\s-]*name")
    if trade:  # cross-document check: all documents must name the same business
        for doc, name in {"Udyam certificate": field(udy, "Enterprise name"), "Address proof": field(adr, "Billed to"),
                          "Signatory ID": field(sid, "For business")}.items():
            a_, b_ = norm(name), norm(trade)
            if name and a_ != b_ and a_ not in b_ and b_ not in a_:
                issues.append(("block", f"{doc} is for '{name}', not '{trade}'"))

    if udy:
        um = re.search(r"UDYAM-[A-Z]{2}-\d{2}-\d{7}", udy.replace(" ", ""))
        if not um:
            issues.append(("fix", "Udyam certificate has no registration number"))
        elif um.group(0) not in udy_reg.index:
            issues.append(("block", "Udyam number not found in Udyam registry"))

    bm = re.search(r"Bill date\s+(\d{4}-\d{2}-\d{2})", adr)
    if bm:
        age = (TODAY - dt.date.fromisoformat(bm.group(1))).days
        if age > 90:
            issues.append(("fix", f"Address proof is {age} days old - needs a bill from the last 90 days"))
    vm = re.search(r"Valid till\s*\n?\s*(\d{4}-\d{2}-\d{2})", sid)
    if vm and dt.date.fromisoformat(vm.group(1)) < TODAY:
        issues.append(("block", "Signatory ID has expired"))
    return issues, facts


def main():
    cache, any_flag, auto = {}, 0, 0
    for i in range(1, 13):
        app = f"K{i:02d}"
        ex = {}
        for d in DOCS:
            p = SPEC / f"{app}_{d}.png"
            if not p.exists():
                ex[d] = None
                continue
            b, s = blur_score(p), skew_angle(p)
            ex[d] = {"blur": round(b), "skew": s, "text": ocr(p, s) if b >= 200 else ""}
        issues, facts = validate(app, ex)
        cache[app] = ex
        any_flag += bool(issues)
        fixed_only = issues and all(x[0] == "info" for x in issues)
        auto += bool(fixed_only)
        print(f"{app}: " + ("; ".join(f"[{lvl}] {msg}" for lvl, msg in issues) or "clean"))
    print(f"\n{any_flag} of 12 applicants flagged: {auto} auto-fixed, {any_flag - auto} need customer action")
    if "--cache" in sys.argv:
        out = ROOT / "frontend" / "data" / "specimens_ocr.json"
        out.write_text(json.dumps(cache, ensure_ascii=False))
        print("wrote", out)


if __name__ == "__main__":
    main()
