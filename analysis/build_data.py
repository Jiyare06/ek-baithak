"""Build the JSON files the frontend reads, and train the lead propensity model.

Usage:  python analysis/build_data.py
Reads:  data/*.csv  (synthetic hackathon dataset)
Writes: frontend/data/{catalogue,gstin,udyam,cities,leads_open,model}.json
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
DATA, OUT = ROOT / "data", ROOT / "frontend" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def dump(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {name}: {(OUT / name).stat().st_size / 1024:.0f} KB")


# ---- catalogue -------------------------------------------------------------
cat = pd.read_csv(DATA / "product_catalogue.csv").fillna("")
catalogue = []
for r in cat.itertuples():
    catalogue.append({
        "id": r.product_id, "category": r.category, "name": r.product_name, "desc": r.description,
        "unit": r.unit, "priceMin": int(r.price_min_inr_per_month), "priceMax": int(r.price_max_inr_per_month),
        "setup": int(r.one_time_setup_inr), "minContract": int(r.min_contract_months),
        "tiers": [int(t) for t in str(r.available_city_tiers).split(";")],
        "minEmployees": int(r.min_employees), "minSites": int(r.min_sites),
        "requiresGstin": r.requires_gstin == "Y",
        "requiresOneOf": [p for p in str(r.requires_one_of).split("|") if p],
        "installDays": int(r.typical_install_days), "segments": str(r.target_segments).split(";"),
    })
dump("catalogue.json", catalogue)

# ---- registries (mock lookup APIs) -----------------------------------------
g = pd.read_csv(DATA / "mock_gstin_registry.csv")
dump("gstin.json", {r.gstin: [r.legal_name, r.trade_name, r.constitution, r.principal_place_of_business,
                              r.state, r.registration_date, r.status] for r in g.itertuples()})
u = pd.read_csv(DATA / "mock_udyam_registry.csv")
dump("udyam.json", {r.udyam_number: [r.enterprise_name, r.enterprise_type, r.major_activity, r.nic_description,
                                     r.state, r.city, r.date_of_registration] for r in u.itertuples()})

# ---- leads: cities + propensity model ------------------------------------
d = pd.read_csv(DATA / "smb_leads.csv")
cities = d.groupby("city").agg(tier=("city_tier", "first"), state=("state", "first")).reset_index()
dump("cities.json", {r.city: [int(r.tier), r.state] for r in cities.itertuples()})

d["y"] = (d.outcome == "Activated").astype(int)
cat_cols = ["segment", "lead_source", "current_internet"]
X = pd.get_dummies(d[cat_cols], prefix=cat_cols, dtype=float)
X["has_gstin"] = (d.has_gstin == "Y").astype(float)
X["has_udyam"] = (d.has_udyam == "Y").astype(float)
X["tier1"] = (d.city_tier == 1).astype(float)
X["log_employees"] = np.log1p(d.employee_count)
X["log_sites"] = np.log1p(d.num_sites)
X["log_spend"] = np.log1p(d.monthly_telecom_spend_inr)
mu, sd = X.mean(), X.std().replace(0, 1)
Xs = (X - mu) / sd
Xtr, Xte, ytr, yte = train_test_split(Xs, d.y, test_size=0.3, random_state=7, stratify=d.y)
m = LogisticRegression(max_iter=2000, C=0.5).fit(Xtr, ytr)
auc = roc_auc_score(yte, m.predict_proba(Xte)[:, 1])
print(f"propensity model hold-out AUC = {auc:.3f}")
m = LogisticRegression(max_iter=2000, C=0.5).fit(Xs, d.y)
coef = dict(zip(X.columns, m.coef_[0]))
dump("model.json", {"intercept": float(m.intercept_[0]), "auc": round(float(auc), 3),
                    "features": [{"name": c, "mean": float(mu[c]), "sd": float(sd[c]), "w": float(coef[c])} for c in X.columns]})

d["score"] = m.predict_proba(Xs)[:, 1]
# Leads the journey could not close and that are worth a human call (not wrong numbers / mobile-only asks)
skip = {"Wrong or invalid number", "Only wanted a mobile plan"}
open_ = d[(d.outcome == "Dropped") & (~d.drop_reason.isin(skip))].copy()
open_["score"] = (open_.score / d.score.max() * 100).round().astype(int)
cols = ["lead_id", "business_name", "business_type", "segment", "city", "city_tier", "preferred_language",
        "employee_count", "num_sites", "has_gstin", "lead_source", "stage_reached", "drop_reason",
        "current_provider", "products_of_interest", "score"]
rows = open_.sort_values("score", ascending=False)[cols].head(600).fillna("")
dump("leads_open.json", rows.to_dict(orient="records"))
