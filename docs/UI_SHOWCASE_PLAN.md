# Business showcase UI plan

Status: implementation in progress, 27 September 2026. This plan covers a visual and
interaction-quality pass for the existing mini-ERP. It is not a claim of SAP/Odoo
equivalence or production security/readiness. Keep the user's separate
`docs/ROADMAP.md` work intact.

## Reference patterns and what we will borrow

- [SAP Fiori analytical list pages](https://experience.sap.com/fiori-design-web/analytical-list-page/)
  put filters next to the data they control and offer charts alongside tables.
- [SAP Fiori overview guidance](https://experience.sap.com/fiori-design-web/v1-78/overview-page/)
  calls for deliberate hierarchy, a limited number of useful surfaces, and
  consistent semantic status colors. We will use fewer raised boxes, not copy
  Fiori cards or SAP branding.
- [SAP progress indicators](https://experience.sap.com/fiori-design-web/progress-indicator/)
  represent a real completion or threshold and require a visible label. We will
  use sales-stage share, low-stock threshold, and relative product contribution;
  we will not invent a "business health" percentage.
- [Odoo dashboards](https://www.odoo.com/documentation/19.0/applications/productivity/dashboards.html)
  connect real-time metrics with tables and charts. Here, every summary links to
  the existing orders, purchasing, inventory, or invoices screen where possible.

## Current problems in the supplied desktop screenshot

The 1180px content cap leaves large empty gutters on a wide monitor. Five isolated
KPI boxes and several tall, rounded panels use space without increasing information.
The greeting/CTA repeats actions already in the top bar. The right stock panel
stretches below its content. The analytics page has a 90-row daily table and weak
visual hierarchy. "Open sales" currently includes invoiced orders, so even the
most prominent metric can mislead a business viewer.

## Target structure

```text
Persistent navigation | Compact page title + as-of time / actions
                      | Unified KPI strip with drill-down links
                      | Sales order table       | Sales-stage mix
                      | Purchase order table    | Stock threshold watch
                      | Analytics: compact period filter + KPI strip
                      | Invoice/cash chart      | Top products and order mix
```

Desktop content should use the available workspace (up to roughly 1600px) with
small side gutters. Tablets collapse to one column; small screens keep the KPI
strip readable and allow detailed tables to scroll horizontally. Surfaces use
subtle borders, minimal radius and no large shadows. Color means information,
success, warning, or criticality and is always paired with a text label.

The user-provided SAP Business One sales-order reference adds a second, equally
important pattern: a **document workspace** for sales orders, purchase orders and
invoices. Use a compact title/status/action header, factual metadata, a labelled
workflow indicator, anchor tabs, a wide line-item grid and a clear total summary.
Avoid the old split between a large workflow card and a separate products card.
Keep our own product name, fields, and transaction rules; no SAP assets or
branding are copied.

## Data rules

- Open sales = draft orders + confirmed orders without an invoice. Show invoiced
  orders as their own completed stage rather than leaving them "open."
- Sales-stage bar denominator = non-cancelled orders; segments are Draft,
  Ready to invoice, and Invoiced. Label counts and percentages; show a neutral
  empty state when there are no orders.
- Stock meter = usable quantity (on-hand minus reserved) against the existing
  10-unit alert threshold. Zero/negative is critical, 1–4 warning, 5–9 watch.
  The threshold is a demo rule, not a per-product reorder policy.
- Analytics time-series uses daily buckets for 7 days and larger buckets for
  30/90 days. CSV export remains daily and unchanged. Cash received and invoices
  issued are independent event series; the chart does not imply profit.
- Product comparison bars are relative to the highest-ranked invoiced product,
  not a target-achievement measure. Every bar has its amount beside it.

## Showcase acceptance checks

1. At 1440px and 1920px, the dashboard fills the usable main area and does not
   present a tall empty companion panel or a row of floating cards.
2. Core actions, top risks and latest documents are visible near the first fold.
3. Progress bars are calculated from real records, remain bounded at 0–100%,
   use descriptive text, and render an honest empty state.
4. Analytics filters, CSV export, totals and charts agree. Existing reviewed
   browser/API contracts and build pass against a fresh database.
5. Sales, purchase and invoice details use one document pattern with operational
   actions visible in the header and line items readable without panel hopping.
6. Check signed-in desktop and mobile screenshots, keyboard focus, contrast,
   empty states and table overflow. Record unresolved gaps rather than calling
   the system production-ready.

## Explicitly out of this UI pass

Role-based authorization, CSRF, concurrency controls, audit logging, backup and
recovery, hosted deployment, and a full accounting model remain in the separate
product roadmap. A strong showcase UI must not disguise those limitations.
