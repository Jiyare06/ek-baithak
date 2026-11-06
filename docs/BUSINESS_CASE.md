# Business case: Ek Baithak (summary)

The full story is in the 7-slide deck (`Jagh_Ek_Baithak_SYNC.pptx`). Every number below comes from `python analysis/funnel_analysis.py` run on the synthetic dataset (Apr–Jun 2026, 5,000 leads).

## Target customers and bundles

We prioritise segments by how fast each customer pays back its acquisition cost (CAC ÷ median monthly bundle), not by lead volume.

| Segment | Lead share | Conversion | CAC / activation | Median bundle /mo | 6-mo churn | Payback | Priority |
|---|---|---|---|---|---|---|---|
| Professional offices | 25% | 11.1% | ₹10.7k | ₹6,575 | 14% | 1.6 mo | Wave 1, advisor-led |
| Small multi-site | 15% | 11.0% | ₹15.6k | ₹28,080 | 11% | 0.6 mo | Wave 1, digital + field |
| Small manufacturers | 6% | 12.8% | ₹15.3k | ₹15,910 | 8% | 1.0 mo | Wave 1b, field-assisted |
| Micro retail & services | 54% | 4.1% | ₹20.0k | ₹2,470 | 23% | 8.1 mo | Wave 2, WhatsApp self-serve |

Starter bundles, priced at catalogue floor prices: Clinic & Office Pro ₹4,316/mo · Chain Connect (3 sites) ₹10,532/mo · Factory Connect ₹13,791/mo · Dukaan Digital ₹1,797/mo.

## Metrics and targets (12 months)

| Metric | Baseline | Target |
|---|---|---|
| Lead → activation | 7.4% | 15% |
| Days, lead → live | 17.6 | ≤ 7 |
| CAC per activation | ₹15,054 | ≤ ₹7,500 |
| Status chases per customer | 3.0 | ≤ 0.5 |
| 6-month churn | 15.2% | ≤ 10% |

**How we got the targets.** We assume half of each addressable drop reason is recovered: the stage conversion rates go from 68/58/44/68/63% to 71/67/56/79/73%. That gives 751 activations per 5,000 leads instead of 368: **+1,533 SMBs a year** and **+₹22.7 cr in annual recurring revenue** (₹21.8 cr → ₹44.5 cr at a mean bundle of ₹12,350/month). If acquisition spend stays the same, CAC falls to about ₹7,400.

## Rollout

1. **0–3 months:** pilot with Professional offices in 4 tier-1 cities, in Hindi and English, on web and WhatsApp.
2. **3–6 months:** add Multi-site and Manufacturers, plus Marathi, Tamil, Telugu and Kannada.
3. **6–12 months:** Micro self-serve with AirFiber, tier-2 cities, and a voice front end.

Each phase starts only after the previous one reaches at least 12% conversion and goes live in 7 days or less.

## Risks

GenAI mis-recommendation, document fraud, DPDP compliance, channel conflict with partners, and installation capacity. Mitigations are on slide 7 and in [PRIVACY.md](PRIVACY.md).
