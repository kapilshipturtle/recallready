# RecallReady: design

Second Codegeist 2026 entry. Category: **Apps for Specialized Industries**. Bonus: **Best Agents (Rovo)**. Deadline Dec 22, 2026 12:00 PT. Target: submitted by Nov 28 with buffer.

## Intent and why

When a product is recalled, a retailer, grocer, e-commerce marketplace or consumer-goods brand must answer three questions fast and prove the answers later:

1. Which of our products and lots are affected?
2. Where are they: which stores, warehouses, sellers and online orders?
3. Has every location pulled them, and have the buyers been told?

RecallReady answers all three inside Jira Service Management. The product catalog, lots, locations, stock and orders live in **Assets**. Public recall feeds are matched against that catalog automatically. Every recall becomes a tracked case with a stop-sale task per location, response clocks, confirmations, a customer notice, and an audit-ready closing record. A **Rovo agent** answers "which stores haven't confirmed?" and drafts notices.

Why this pick (evidence, 2026-11-14):
- Codegeist 2025 Specialized Industries winners (my inference from their pages) all modelled a physical operation in Jira/JSM with Assets and Rovo: FleetOps (1st), YardMaster (2nd), Compliant Workflows (3rd).
- Atlassian Marketplace REST search: no app for product recall, stop-sale, quarantine or withdrawal management.
- Live public data exists: openFDA food enforcement API (29,598 records, latest 2026-11-04), CPSC Recalls API (19 recalls since 2026-11-01).

Facts used in the pitch (sourced; check wording before quoting):
- SQF (2.6.3.2) and BRCGS require the withdrawal and recall system to be tested at least annually (forum and consultant quotes of the clauses; confirm against the official code text).
- CPSC: a firm must report within 24 hours of obtaining reportable information (Section 15(b)).
- EU GPSR applies from 13 Dec 2024; online marketplaces must directly notify consumers who bought a recalled product through them and publish recall information.

## Goals

- A complete product, not a proof of concept: setup wizard, sample data, real feeds, cases, board, agent, closing record.
- Explainable matching: every match says why ("GTIN 2001234567890 appears in the notice", "lot 24B17 listed in code info").
- Judges can test in minutes on a fresh Codegeist dev site with one click of sample data and one click of a mock recall.
- Free to run: no paid AI, no external servers. AI comes from Rovo.

## Non-goals

- Submitting reports to regulators (we generate the summary; people submit it).
- Sending emails or messages to consumers (we generate the notice and the list of affected orders).
- Inventory or ERP sync (CSV import into Assets is enough; integrations are "what's next").
- Legal advice: deadlines are the company's own response plan, configurable, not encoded law.

## Anti-goals (failure even if it technically works)

- A match engine that silently guesses. Low-confidence matches go to a review queue, never straight to a case.
- Needing manual Assets configuration before anything works.
- A demo that only works with our data and breaks on a judge's site.
- Showing third-party trademarks in the video (all demo brands and products are fictional).

## Users

- **Quality / product safety manager** (runs the recall): board, case panel, agent.
- **Store or warehouse manager**: gets one stop-sale task, confirms units pulled.
- **Customer care / marketplace ops**: affected orders list and customer notice.
- **Jira admin**: one-time setup wizard.

## How it works

1. **Setup (admin page, runs as the admin).** Creates the Assets schema "RecallReady catalog" with object types Product, Lot, Location, Stock, Order, and their attributes. Optional: loads sample data for a fictional retailer. Admin picks the Jira project for recall cases (or lets the wizard create one), sets the response plan clocks and radar sources.
   - Verified 2026-11-14: creating schemas/types/attributes/objects as the app returns 403; as the admin user it returns 201. After that, the app (asApp) can query and create objects in that schema (AQL 200, create 201).
2. **Radar (scheduled, hourly, runs as the app).** Fetches new FDA enforcement reports (food, drug, device) and CPSC recalls since the last cursor, matches them against the catalog, and:
   - high confidence → opens a recall case automatically,
   - medium/low → adds to the review queue on the board.
   Processed recall IDs are remembered so nothing is opened twice. "Scan now" runs the same code on demand.
3. **Notice check (any text).** Paste a supplier notice or email (board or Rovo) → same match engine → "Start recall" from the result.
4. **Mock recall drill.** Pick a product and lot (or random) → creates a case flagged DRILL; everything else is identical. Closing report includes time-to-trace and time-to-confirm.
5. **Recall case** (Jira work item in the chosen project):
   - Summary, description with source link and match evidence.
   - Issue property `recallready` holds case data: products, lots, expected units per location, affected orders, clocks, confirmations, audit log.
   - One sub-task per affected location: "Stop sale: pull 36 units of lot 24B17 at Store 12".
6. **Execute and track.** Location managers confirm on their sub-task (units pulled + optional note). The case panel shows locations confirmed, units recovered vs expected, clock status, affected orders and notice draft, regulator summary.
7. **Close.** Effectiveness check (units recovered ÷ units expected), closing record posted as a comment and stored in the issue property; case moves to Done.

## Surfaces (Forge modules)

- `jira:adminPage`: setup wizard and settings.
- `jira:globalPage` (or projectPage): Recall board with KPIs, open cases with progress and clocks, radar status, review queue, notice check, mock recall.
- `jira:issuePanel`: Recall command on case work items; confirmation form on stop-sale sub-tasks.
- `scheduledTrigger`: radar every hour.
- `action` modules (Rovo): check-product, get-recall-status, list-recalls, check-notice (GET), start-recall (CREATE).
- `rovo:agent` "RecallReady" + `rovo:skill` "recall-response".
- `rovo:mcp`: read-only tools (check-product, get-recall-status, list-recalls, check-notice) so a store, checkout or support agent can ask "is this lot recalled?". Extra depth; the bonus entered is Best Agents.

## Matching (deterministic, tested)

- GTIN/UPC: digits only, padded to 14; exact match → High.
- Model number (CPSC Products[].Model) exact, case-insensitive → High.
- Lot codes parsed from code info (patterns like "Lot 260417", "Lot #", "Batch", lists) matched to Lot objects of the matched product → raises to High, scopes the case to those lots.
- Brand + product-name token overlap (stop words removed) above threshold → Medium (review queue).
- Brand only → Low (review queue, collapsed).
- Every match carries evidence strings.

## Data and storage

- Assets: catalog (Product, Lot, Location, Stock, Order). Sample retailer is fictional; GTINs use the GS1 restricted-circulation prefix 2 so they never collide with real products.
- Issue property `recallready`: case data.
- Forge KVS: settings, radar cursors, processed recall IDs, review queue.

## Permissions

- Jira: read/write work, issue properties, comments.
- Assets: read/write object, read/write schema, type, attribute (setup runs as the admin).
- External fetch: api.fda.gov, www.saferproducts.gov.
- Not Runs on Atlassian (egress for public feeds); not a 2026 bonus requirement.

## Constraints

- Free: Forge free tier, no Forge LLMs (no free quota), no paid APIs.
- Same stack as Context Pack: Node 24, UI Kit, resolvers, KVS, node --test.
- Video under 5 minutes, fictional brands only, no music.

## Risks

- Judge sites without Assets: wizard detects it and explains; testing instructions state the requirement (Codegeist dev sites include JSM; our dev site has Assets).
- Feed downtime: radar is fail-soft and shows the last error on the board.
- Rovo action payload size: actions return compact summaries.

## Left to the builder (my calls)

- Exact object type attributes, UI layout, clock defaults (stop sale 4 h, customer notice 24 h, regulator summary 24 h, effectiveness check 7 days), sample data contents, wording.
