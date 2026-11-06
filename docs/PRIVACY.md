# Data privacy & security note: Ek Baithak

*One page, as requested by the case. It covers the design choices we made under the Digital Personal Data Protection Act, 2023 (DPDP), and how the prototype implements them. All data in the prototype is synthetic, but we treat it as if it were real.*

## 1. Collect only what each step needs (data minimisation)

| Step | What we ask | What we do **not** ask |
|---|---|---|
| Advisor | Business type, size, sites, city, current internet, needs, GSTIN (optional) | Name, phone number, personal ID |
| Quote | Nothing new | — |
| Smart KYC | GSTIN and Udyam number, plus 4 documents: GST certificate, Udyam certificate, signatory ID, address proof | Anything the GST registry already holds: legal name, address and constitution are **pre-filled from the lookup**, not typed or re-uploaded |
| Installation | Contact name, phone, site address, shared with the installer | Bank or card details (the UPI AutoPay mandate is handled by the payment app) |

## 2. Consent before KYC, separate for each purpose

* The consent screen comes **before** any document is requested. It lists four purposes: verifying the business (required), checking the address (required), sharing with the installer (required) and marketing (**optional, unticked by default**).
* The **Continue** button stays disabled until all three required purposes are ticked. Declining marketing never blocks the order.
* Each consent is stored with a timestamp and the list of purposes. In production these records go to a consent ledger and can be withdrawn from the tracker page.

## 3. Purpose limitation and retention

* Document images are used **only** to extract and check the fields listed on the KYC screen.
* **Images:** deleted 30 days after the service goes live, long enough to resolve installation disputes.
* **Extracted fields** (GSTIN, names, dates): kept only for as long as telecom customer-record rules require, then deleted.
* **Leads the advisor did not close:** shown to partners with business details only. They are never sold or shared outside Accel and its authorised local partner.

## 4. Masking and security

* Identifiers are **masked in the UI and logs**: `27QT••••••••1Z9`, `UDYAM-MH-•••••096`.
* **OCR runs on the device.** The prototype uses vendored tesseract.js in the browser, so the image never leaves the phone. No third-party CDN loads the OCR engine. In production, server-side OCR would run inside Accel's Indian region, over TLS, with encryption at rest.
* **The LLM never sees a document or a personal identifier.** It receives only the business profile (type, size, city) and the bundle that has already been decided. In production, calls go through the Accel backend with a no-retention setting; API keys are never kept on the device.
* **Fraud controls:** GSTIN checksum, live registry status (Cancelled and Suspended are blocked), a cross-document check that every document names the same business, address proof under 90 days, ID expiry, image-quality checks, and Aadhaar e-Sign so the signatory is the one who agrees.
* **Role-based access:** partners see only leads in their own pin codes, and every view or assignment is written to the audit log.

## 5. Rights of the data principal

Customers can see, correct and withdraw consent from the tracker page. A request to erase data deletes the images and extracted fields, except where the law requires us to keep the record. We name a grievance contact in the consent screen footer.

## 6. Where AI is used

| Component | Model | Can it change the outcome? |
|---|---|---|
| Bundle selection & price | Deterministic rules from `product_catalogue.csv` | **Yes.** These rules are auditable and have unit-level traceability. |
| Explanation text | LLM (optional) | **No.** It only writes text about a bundle that is already fixed. |
| Lead ranking | Logistic regression, AUC 0.74 | It changes who gets called first, never what a customer is offered. |
