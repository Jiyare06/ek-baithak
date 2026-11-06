"""Reproduces every number used in the business-case deck.

Usage: python analysis/funnel_analysis.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
d = pd.read_csv(ROOT / "data" / "smb_leads.csv")
cat = pd.read_csv(ROOT / "data" / "product_catalogue.csv").set_index("product_id")
gst = pd.read_csv(ROOT / "data" / "mock_gstin_registry.csv")[["gstin", "status"]]
d = d.merge(gst, on="gstin", how="left")
act = d[d.outcome == "Activated"].copy()
churn = lambda s: (s == "Y").mean()

print("== Funnel")
stages = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"]
d["si"] = d.stage_reached.map({s: i for i, s in enumerate(stages)})
reached = [(d.si >= i).sum() for i in range(6)]
for i, s in enumerate(stages):
    print(f"  {s:15s} {reached[i]:5d}  {'' if i == 0 else f'{reached[i] / reached[i - 1]:.0%}'}")
print(f"  lead->activation {len(act) / len(d):.1%}, days {act.days_lead_to_activation.mean():.1f}, "
      f"chases {act.customer_follow_up_calls.mean():.1f}, CAC Rs {d.acquisition_cost_inr.sum() / len(act):,.0f}, "
      f"6-mo churn {churn(act.churned_within_6_months):.1%}, mean bundle Rs {act.monthly_bundle_value_inr.mean():,.0f}")

print("\n== Drop reasons by stage")
print(d[d.outcome == "Dropped"].groupby(["stage_reached", "drop_reason"]).size().to_string())

print("\n== Segments")
seg = d.groupby("segment").agg(leads=("lead_id", "size"), conv=("outcome", lambda s: (s == "Activated").mean()),
                                cac=("acquisition_cost_inr", "sum"))
seg["cac_per_act"] = seg.cac / (seg.leads * seg.conv)
a = act.groupby("segment").agg(median_mrr=("monthly_bundle_value_inr", "median"),
                                churn=("churned_within_6_months", churn),
                                value_share=("monthly_bundle_value_inr", "sum"))
a["value_share"] /= a.value_share.sum()
seg = seg.join(a)
seg["payback_months"] = seg.cac_per_act / seg.median_mrr
seg["lead_share"] = seg.leads / len(d)
print(seg.round(3).to_string())

print("\n== Channels")
ch = d.groupby("lead_source").agg(leads=("lead_id", "size"), conv=("outcome", lambda s: (s == "Activated").mean()),
                                   cost_per_lead=("acquisition_cost_inr", "mean"), cac=("acquisition_cost_inr", "sum"))
ch["cac_per_act"] = ch.cac / (ch.leads * ch.conv)
print(ch.round(3).to_string())

print("\n== Churn vs status chases")
print(act.groupby("customer_follow_up_calls").churned_within_6_months.apply(churn).round(2).to_string())

print("\n== Catalogue-rule violations in activated bundles")
def violations(r):
    ps = [p.split("x")[0] for p in r.bundle_products.split(";")]
    v = set()
    for p in ps:
        x = cat.loc[p]
        if str(r.city_tier) not in str(x.available_city_tiers).split(";"): v.add("tier")
        if r.employee_count < x.min_employees: v.add("employees")
        if r.num_sites < x.min_sites: v.add("sites")
        if x.requires_gstin == "Y" and (r.has_gstin != "Y" or r.status != "Active"): v.add("gstin")
        if isinstance(x.requires_one_of, str) and not set(x.requires_one_of.split("|")) & set(ps): v.add("dependency")
    return ",".join(sorted(v))
act["viol"] = act.apply(violations, axis=1)
print(f"  {(act.viol != '').sum()} of {len(act)} activations break a rule; "
      f"{act.status.isin(['Cancelled', 'Suspended']).sum()} sold on a cancelled/suspended GSTIN")

print("\n== Provider mix")
print(d.groupby("current_provider").agg(leads=("lead_id", "size"),
                                        conv=("outcome", lambda s: (s == "Activated").mean())).round(3).to_string())

print("\n== Impact model (recover half of each addressable drop reason)")
recover = {"Unreachable after 3 attempts": .25, "Not interested on first call": .1, "Owner had no time for a visit": .6,
           "Visit not scheduled by sales": .8, "Locked in with current provider": .1, "Price too high": .25,
           "Competitor offered cheaper plan": .2, "Quote too complex to understand": .7, "Quote took too long to arrive": .9,
           "Decided to wait": .2, "Missing GST or Udyam document": .5, "Found paperwork too long": .8,
           "Authorised signatory not available": .7, "Document details did not match": .6,
           "Installation delayed beyond 21 days": .6, "Customer cancelled before install": .3,
           "Site not feasible for fibre": .7, "First payment failed": .8}
rates = []
for i in range(5):
    dropped = d[(d.si == i) & (d.outcome == "Dropped")]
    rec = sum(recover.get(r, 0) for r in dropped.drop_reason) * 0.5
    rates.append((reached[i + 1] + rec) / reached[i])
conv = float(np.prod(rates))
mean_mrr = act.monthly_bundle_value_inr.mean()
print("  stage rates", [f"{r:.1%}" for r in rates], f"-> {conv:.1%}, {5000 * conv:.0f} activations / 5,000 leads")
base_yr, new_yr = len(act) * 4, 20000 * conv
print(f"  per year: {base_yr} -> {new_yr:.0f} (+{new_yr - base_yr:.0f}); "
      f"ARR Rs {base_yr * mean_mrr * 12 / 1e7:.1f} cr -> Rs {new_yr * mean_mrr * 12 / 1e7:.1f} cr; "
      f"CAC at same spend Rs {d.acquisition_cost_inr.sum() / (5000 * conv):,.0f}")
