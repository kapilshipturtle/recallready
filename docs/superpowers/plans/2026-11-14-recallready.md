# RecallReady Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Forge app for Jira Service Management that matches public and supplier recall notices against a catalog in Assets, runs each recall as a tracked case with stop-sale tasks, clocks, confirmations and a closing record, and exposes it to a Rovo agent and MCP clients.

**Architecture:** Pure logic (GTIN/lot parsing, notice adapters, matching, case model, clocks, sample data) lives in `src/lib` and is unit-tested with `node --test`. Forge I/O lives in `src/platform` (Assets, Jira, feeds, KVS). Orchestration lives in `src/services`, called by UI resolvers, Rovo actions and the scheduled trigger. Setup writes Assets as the admin (`asUser`); everything else runs `asApp`.

**Tech Stack:** Forge (Node 24 runtime, UI Kit `@forge/react`, `@forge/bridge`, `@forge/resolver`, `@forge/api`, `@forge/kvs`), node:test.

**Spec:** `docs/superpowers/specs/2026-11-14-recallready-design.md`

## Global Constraints

- App name **RecallReady**; Assets schema name "RecallReady catalog", key `RRC`; issue property key `recallready`.
- Free only: no Forge LLMs, no paid APIs. AI comes from Rovo.
- Runtime `nodejs24.x`, UI Kit only (`render: native`), MIT licence.
- Response plan defaults: stop sale 4 h, customer notice 24 h, regulator summary 24 h, effectiveness check 168 h (7 days).
- External fetch only to `api.fda.gov` and `www.saferproducts.gov`.
- Sample company and products are fictional; sample GTINs are GTIN-13 with prefix `2` and a valid check digit.
- Verified Assets codes (2026-11-14, live): attribute `type` 0 + `defaultTypeId` 0 Text, 1 Integer, 2 Boolean, 3 Float, 4 Date, 6 DateTime, 7 URL, 8 Email, 9 Textarea, 10 Select (`options` comma-separated); `type` 1 = object reference (`typeValue` = target objectTypeId, `additionalValue` = id of reference type named "Reference" from `GET /config/referencetype`); `type` 2 = user. Reference value = target objectKey. Date value `YYYY-MM-DD`. AQL `Ref = "KEY"` and `Ref.Name = "x"` both work.
- Assets schema/type/attribute creation must run `asUser` (asApp returns 403); asApp can then AQL-read and create objects.
- Copy rules for any user-facing text: plain English, no `**` markers in form text, no third-party trademarks in demo data.

## Review Focus

1. Notice with a GTIN printed with spaces or dashes ("UPC 2 001234 56789 2") must still match. Owner: Task 1.
2. A product name that merely shares common words with a notice ("Organic Whole Milk" vs "Organic Peanut Butter") must not become High or Medium. Owner: Task 3.
3. The same FDA/CPSC recall seen in two scans must never open two cases. Owner: Task 11.
4. A confirmation with more units than expected, zero, or a negative number: over-recovery is recorded with a flag, negatives rejected. Owner: Task 4.
5. A site without Assets (no workspace) must show a clear setup message, not a crash. Owner: Task 6.

---

### Task 1: Scaffold and identifier parsing

**Files:**
- Create: `package.json`, `manifest.yml` (app id after `forge register`), `.gitignore`, `src/lib/ids.js`
- Test: `test/ids.test.mjs`

**Interfaces:**
- Produces: `normalizeGtin(raw: string): string|null` (14 digits, valid check digit, else null); `gtinCheckDigitOk(d14: string): boolean`; `extractGtins(text: string): string[]` (unique, normalized); `extractLots(text: string): string[]` (unique, uppercase); `normalizeModel(s: string): string` (uppercase alphanumerics only).

- [ ] **Step 1: Write failing tests**

```js
test('UPC-A pads to GTIN-14', () => assert.equal(normalizeGtin('012345678905'), '00012345678905'));
test('bad check digit is null', () => assert.equal(normalizeGtin('012345678904'), null));
test('spaced and dashed UPC in text', () => assert.deepEqual(extractGtins('UPC 2 001234 56789 2 and EAN 2-0012345-6789-2'), ['02001234567892']));
test('FDA code_info lots', () => assert.deepEqual(extractLots('Lot 260417, Best By date 4-17-28 Lot 260617, Best By date 12-17-27'), ['260417', '260617']));
test('lot list forms', () => assert.deepEqual(extractLots('Lot #: 24B17, 24B18 and 24C01; Batch No. AX-77'), ['24B17', '24B18', '24C01', 'AX-77']));
test('dates are not lots', () => assert.deepEqual(extractLots('Best by 12/17/27'), []));
test('model normalize', () => assert.equal(normalizeModel('fp-2000 x'), 'FP2000X'));
```

- [ ] **Step 2: Run** `npm test` → FAIL (module missing).
- [ ] **Step 3: Implement `src/lib/ids.js`.** GTIN: strip non-digits, accept 8/12/13/14 digits, left-pad to 14, GS1 mod-10 check. `extractGtins`: scan for runs of 12–14 digits allowing single spaces/dashes between digits, keep valid ones. `extractLots`: after `lot|lots|batch` with optional `#|no.|number|code(s)` and `:`, capture comma/`and`/`;`-separated tokens matching `[A-Z0-9][A-Z0-9-]{2,}` until a word that is not a code; reject tokens that look like dates.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: identifier parsing (GTIN, lots, models)`.

### Task 2: Notice adapters

**Files:**
- Create: `src/lib/notices.js`, `test/fixtures/fda-food.json`, `test/fixtures/cpsc.json` (real API records saved 2026-11-14)
- Test: `test/notices.test.mjs`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `Notice = { source: 'FDA food'|'FDA drug'|'FDA device'|'CPSC'|'Text', id: string, title: string, firm: string, date: 'YYYY-MM-DD', classification: string, reason: string, productText: string, codeText: string, url: string, gtins: string[], lots: string[], models: string[] }`; `fromFda(record, kind: 'food'|'drug'|'device'): Notice`; `fromCpsc(record): Notice`; `fromText(text: string, title?: string): Notice`.

- [ ] **Step 1: Write failing tests** with the fixtures: FDA record `H-0184-2027` → `id: 'FDA:H-0184-2027'`, `date: '2026-11-04'`, `lots` include `'260417'`, `classification: 'Class I'`; CPSC record `RecallNumber 27082` → `id: 'CPSC:27082'`, `date: '2026-11-12'`, `title` starts with "Allstar Recalls", `url` = record URL; `fromText('Recall of Lot 24B17 GTIN 2001234567892')` → `source: 'Text'`, `gtins: ['02001234567892']`, `lots: ['24B17']`, `id` stable for the same text.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** FDA url = `https://api.fda.gov/<kind>/enforcement.json?search=recall_number:"<n>"`; FDA text fields `product_description`, `code_info`, `more_code_info`; CPSC productText from `Products[].Name/Description/Type`, models from `Products[].Model`, gtins from `ProductUPCs[].UPC`, firm from `Manufacturers|Importers|Distributors[0].Name`. `fromText` id = `TEXT:` + first 12 hex of sha256(text).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: FDA, CPSC and text notice adapters`.

### Task 3: Match engine

**Files:**
- Create: `src/lib/match.js`
- Test: `test/match.test.mjs`

**Interfaces:**
- Consumes: `Notice`, Task 1.
- Produces: `Catalog = { products: Product[], lots: Lot[], locations: Location[], stock: Stock[], orders: Order[] }` with `Product {key,name,brand,sku,gtin,category,supplier}`, `Lot {key,code,productKey,bestBy}`, `Location {key,name,type:'Store'|'Warehouse'|'Online'|'Seller',region}`, `Stock {key,lotKey,locationKey,units}`, `Order {key,orderNumber,lotKey,units,customerName,customerEmail,orderedAt}`; `matchNotice(notice: Notice, catalog: Catalog): Match[]` sorted High→Low then score desc, where `Match {productKey, confidence:'High'|'Medium'|'Low', score:number, lotKeys:string[], evidence:string[]}`; `nameSimilarity(a: string, b: string): number` (Dice on word tokens, stop words and units removed).

- [ ] **Step 1: Write failing tests:**
  - GTIN equality → High, evidence contains `GTIN 02001234567892`.
  - Model equal to SKU (normalized) → High.
  - Brand present + similarity ≥ 0.6 + a product lot code in `notice.lots` → High, `lotKeys` = only those lots.
  - Brand present + similarity ≥ 0.6, no lot → Medium.
  - Brand present + similarity < 0.6 → Low.
  - No brand, shares only "Organic" with notice → no match (`[]`).
  - Notice lots that match a product's lots narrow `lotKeys`; with no lot info on a High GTIN match, `lotKeys` = all lots of the product.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (brand present = every brand token appears in title+firm+productText). **Step 4: Run** → PASS. **Step 5: Commit** `feat: explainable recall matching`.

### Task 4: Case model, clocks, closing record

**Files:**
- Create: `src/lib/case.js`, `src/lib/clocks.js`
- Test: `test/case.test.mjs`, `test/clocks.test.mjs`

**Interfaces:**
- Consumes: `Notice`, `Match`, `Catalog`.
- Produces: `DEFAULT_PLAN = [{key:'stopSale',label:'Stop sale at every location',hours:4},{key:'customerNotice',label:'Customer notice ready',hours:24},{key:'regulatorSummary',label:'Regulator summary ready',hours:24},{key:'effectiveness',label:'Effectiveness check',hours:168}]`; `buildCase({notice, matches, catalog, plan, now, drill}): CaseData`; `confirmLocation(caseData, {locationKey, units, by, at, note}): CaseData` (throws on units < 0; sets `overRecovered: true` when units > expected); `markMilestone(caseData, key, at, by): CaseData`; `caseSummary(caseData, now): {expectedUnits, recoveredUnits, locationsTotal, locationsConfirmed, percent, effectiveness, nextClock}`; `closingRecord(caseData, now): string` (plain text, no `**`); `clockStatus(startedAt, plan, milestones, now): [{key,label,dueAt,status:'met'|'due'|'overdue',metAt}]`; `customerNotice(caseData, company): string`; `regulatorSummary(caseData): string`.
- `CaseData = {version:1, drill, notice:{source,id,title,firm,date,url,reason}, startedAt, plan, products:[{key,name,gtin,brand}], lots:[{key,code,productKey,bestBy}], locations:[{key,name,type,expectedUnits,confirmedUnits:null|number,confirmedBy,confirmedAt,note,overRecovered,subtaskKey:null|string}], orders:[{key,orderNumber,units,customerName,customerEmail}], milestones:{stopSale,customerNotice,regulatorSummary,effectiveness,closed}, audit:[{at,by,event}]}`.

- [ ] **Step 1: Write failing tests:** expected units per location = sum of Stock units for matched lots at that location (fixture: lot A 36 @ Store 12, 12 @ DC 1 → two locations 36 and 12); locations with 0 units excluded; orders = orders on matched lots; `confirmLocation` negative throws "Units must be 0 or more"; over-recovery flag; `stopSale` milestone auto-set when last location confirms; clock at now = startedAt+5h with stopSale unmet → `overdue`; effectiveness = recovered/expected rounded to 1 decimal; `closingRecord` contains product name, lots, "Effectiveness 100%" and no `**`.
- [ ] **Step 2–4:** fail → implement → pass. **Step 5: Commit** `feat: recall case model, clocks and records`.

### Task 5: Sample data

**Files:**
- Create: `src/lib/sample.js`
- Test: `test/sample.test.mjs`

**Interfaces:**
- Produces: `SAMPLE: Catalog` (keys are local ids like `P01`, `L01-1`, `S01`) and `SAMPLE_COMPANY = 'Harbor Lane Market'`. Content: 24 products across Food, Baby, Household, Toys, Small appliances (fictional brands), 2–3 lots each, 10 locations (8 stores, 1 distribution centre, 1 online store), stock rows, 40 online orders.

- [ ] **Step 1: Tests:** every GTIN valid and starts with `02`; every lot references a product; every stock references lot+location; all units > 0; product names unique; no real brand list hit (assert brands ∈ fixed fictional list).
- [ ] **Step 2–4.** **Step 5: Commit** `feat: fictional sample retailer`.

### Task 6: Assets layer and setup

**Files:**
- Create: `src/platform/assets.js`, `src/services/setup.js`
- Test: `test/assets-map.test.mjs` (pure mapping only)

**Interfaces:**
- Consumes: `SAMPLE`, `Catalog` shape.
- Produces: `getWorkspaceId(who:'app'|'user'): Promise<string|null>`; `SCHEMA_SPEC` (types and attributes: Product[Brand Text, SKU Text, GTIN Text, Category Select, Supplier Text]; Lot[Product ref, Code Text, Best by Date]; Location[Type Select Store,Warehouse,Online,Seller; Region Text]; Stock[Lot ref, Location ref, Units Integer]; Order[Order number Text, Lot ref, Units Integer, Customer Text, Customer email Email, Ordered at Date]); `ensureSchema(): Promise<SchemaIds>` (asUser, idempotent: reuses schema key `RRC`); `loadSample(ids): Promise<{created:number}>` (asUser); `loadCatalog(ids): Promise<Catalog>` (asApp, AQL per type, paginated 500); `mapAqlObjects(response, typeName): object[]` (pure).
- Settings stored in KVS key `settings` include `schemaIds`.

- [ ] **Step 1: Test** `mapAqlObjects` against a fixture shaped like the live AQL response (values[].attributes[].objectTypeAttributeId, objectTypeAttributes[] for id→name, references via `referencedObject.objectKey`).
- [ ] **Step 2–4** for the mapper.
- [ ] **Step 5: Live check** (after Task 8 UI exists): Setup creates schema `RRC` with 5 types; sample load creates objects; `loadCatalog` returns 24 products. On a site without Assets, `getWorkspaceId` → null and setup returns `{ok:false, message:'Assets is not available on this site. RecallReady needs Jira Service Management with Assets.'}`.
- [ ] **Step 6: Commit** `feat: Assets catalog setup and loading`.

### Task 7: Jira layer and recall service

**Files:**
- Create: `src/platform/jira.js`, `src/services/recalls.js`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces: `startRecall({notice, productKeys, lotKeys, drill, by}): Promise<{issueKey}>` (creates case work item in the configured project, one sub-task per location "Stop sale: pull <n> units of lot <codes> at <location>", stores `CaseData` in property `recallready`); `getCase(issueKey): Promise<CaseData|null>`; `confirm(issueKey, locationKey, units, note, by)`; `markMilestone(issueKey, key, by)`; `closeRecall(issueKey, by)` (comment = `closingRecord`, transition to a done-category status); `listOpenRecalls(): Promise<CaseSummaryRow[]>` (JQL `issue.property[recallready].version = 1 AND statusCategory != Done` in the configured project); `checkProduct(query): Promise<{matches, openCases}>`.
- Sub-task issue type = first issue type with `subtask: true` in the project.

- [ ] **Step 1: Live check script** in `scripts/live-check.md`: start a drill on sample product P03 lot L03-1 → case with N sub-tasks equal to locations holding stock; confirm one location → property updated; close → comment present and status Done.
- [ ] **Step 2: Commit** `feat: recall cases in Jira`.

### Task 8: Admin page (setup and settings)

**Files:**
- Create: `src/frontend/admin/index.jsx`, `src/resolvers/admin.js`; Modify: `manifest.yml` (`jira:adminPage`, resolver function).

**Interfaces:**
- Resolver functions: `getAdminState()`, `runSetup({withSample})`, `saveSettings({projectKey, plan, sources})`, `scanNow()`.

- [ ] **Step 1:** UI sections: Catalog (status counts, "Create catalog in Assets", "Load sample data"), Recall project (Select of projects), Response plan (4 hour fields with the defaults), Radar (toggles FDA food/drug/device, CPSC; last scan; "Scan now").
- [ ] **Step 2: Live check** on your test site: setup + sample + save settings succeed; values read back after reload.
- [ ] **Step 3: Commit** `feat: setup and settings page`.

### Task 9: Recall board (global page)

**Files:** Create `src/frontend/board/index.jsx`, `src/resolvers/board.js`; Modify `manifest.yml` (`jira:globalPage`).

**Interfaces:** resolver `getBoard()`, `checkNoticeText({text})`, `startFromMatches({noticeId, productKeys, lotKeys})`, `runDrill({productKey, lotKeys})`, `dismissReview({noticeId})`.

- [ ] **Step 1:** KPIs (open recalls, locations pending, units outstanding, overdue clocks), open recalls table with progress, "Check a notice" (TextArea → matches with evidence → Start recall), "Run a mock recall" (product + lots selects), Radar card (last scan, checked, matched, errors) and Review queue.
- [ ] **Step 2: Live check** drill + notice check from the board. **Step 3: Commit** `feat: recall board`.

### Task 10: Recall command panel

**Files:** Create `src/frontend/panel/index.jsx`, `src/resolvers/panel.js`; Modify `manifest.yml` (`jira:issuePanel`).

**Interfaces:** resolver `getPanel({issueKey})` returns `{mode:'case'|'location'|'none', case, summary, clocks, location}`, `confirmHere({units, note})`, `markMilestoneHere({key})`, `closeHere()`.

- [ ] **Step 1:** Case mode: header (product, lots, source link, DRILL tag), clocks lozenges, locations table, affected orders count + customer notice (copyable), regulator summary, close button (enabled when all locations confirmed). Location mode (on a stop-sale sub-task): expected units, units pulled field, note, Confirm.
- [ ] **Step 2: Live check** confirm from a sub-task updates the parent case. **Step 3: Commit** `feat: recall command panel`.

### Task 11: Radar (feeds + schedule + review queue)

**Files:** Create `src/platform/feeds.js`, `src/services/radar.js`, `src/triggers.js`; Test `test/radar.test.mjs`; Modify `manifest.yml` (`scheduledTrigger` interval `hour`, function `timeoutSeconds: 300`, `permissions.external.fetch.backend`).

**Interfaces:** `fetchFda(kind, sinceYmd): Promise<object[]>`, `fetchCpsc(sinceYmd): Promise<object[]>`; `planScan({notices, catalog, seenIds}): {open: [{notice, matches}], queue: [{notice, matches}], seen: string[]}` (pure); `runScan({now}): Promise<{checked, opened, queued, errors}>`.

- [ ] **Step 1: Tests** for `planScan`: High → open, Medium/Low → queue, notices in `seenIds` skipped, no notice opened twice within one run.
- [ ] **Step 2–4.** **Step 5: Live check** Scan now on the dev site reports checked > 0 and no errors. **Step 6: Commit** `feat: recall radar`.

### Task 12: Rovo agent, actions, skill, MCP

**Files:** Create `src/actions.js`, `skills/recall-response/SKILL.md`, `agent-skill/recallready/SKILL.md`; Modify `manifest.yml` (`action` × 5, `rovo:agent`, `rovo:skill`, `rovo:mcp`).

**Interfaces:** actions `check-product` (GET, input `query`), `get-recall-status` (GET, `issueKey`), `list-recalls` (GET), `check-notice` (GET, `noticeText`), `start-recall` (CREATE, `noticeText`, `drill` boolean). All return compact plain-text summaries.

- [ ] **Step 1: Live check** in Rovo chat: "Is lot L03-1 of <sample product> under recall?", "Which locations haven't confirmed RR-…?", "Draft the customer notice for RR-…".
- [ ] **Step 2: Commit** `feat: RecallReady Rovo agent and MCP tools`.

### Task 13: Ship

- [ ] README, LICENSE (MIT), PRIVACY.md, TERMS.md, SECURITY.md; public repo; production deploy; sharing install link; install-link check; testing instructions. **Commit** `docs: ship RecallReady`.

### Task 14: Video and Devpost

- [ ] HyperFrames demo (under 5 min, fictional brands, no music) rendered on GitHub; public YouTube on the "Kapil Prajapati" channel; second Devpost submission (Specialized Industries, bonus Best Agents) with every field read back before submit.
