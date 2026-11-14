# RecallReady

Run every product recall as a tracked case in Jira Service Management: what is affected, where it is, who has pulled it from sale, and which clocks are running.

When a supplier or a regulator recalls a product, a retailer or food business has to answer hard questions fast. Which of our products and lots are affected? At which stores, warehouses and online orders is the stock? Who has confirmed that it is off the shelf? Which customers bought it? Is every step on time? Too often the answers live in spreadsheets and email threads. RecallReady keeps the catalog in Assets and runs the recall itself in Jira, with Rovo on hand to answer questions.

| Surface | What it does |
|---|---|
| Recall board (Jira app page) | Open recalls with stop-sale progress, units pulled and the next clock; totals for locations still to confirm, units not yet pulled and overdue clocks; Check a notice; Run a mock recall; the recall radar review queue |
| Recall panel (on the case) | Stop-sale progress per location, response plan clocks, online orders with affected lots, a customer notice and a regulator summary ready to copy, and Close with a closing record |
| Recall panel (on each stop-sale task) | The location manager confirms how many units were pulled, with an optional note |
| Settings (Jira admin page) | Create the catalog in Assets (optionally with a fictional sample retailer), choose the project for recall cases, set the company name, the response plan hours and the radar sources |
| Recall radar (every hour) | Reads the last 30 days of FDA enforcement reports (food, drug, device) and CPSC recalls and checks them against the catalog; opens a case on a High match, sends the rest to review |
| Rovo agent "RecallReady" | Checks notices, opens recalls, reports who has not confirmed, answers "can we still sell this lot?", drafts the customer notice |
| Rovo skill "recall-response" | The recall workflow as reusable instructions for any Rovo agent |

## How a recall runs

1. A notice arrives: pasted on the board, given to the Rovo agent, found by the hourly radar, or started as a mock recall.
2. RecallReady matches it against the catalog and shows why each product matched.
3. Starting the recall creates one case work item and one stop-sale sub-task per location that holds affected stock, with the units to pull per lot. Several products from one notice go into one case, and a lot that is already under an open recall is not opened twice.
4. Each location manager confirms the units pulled on their task. When the last location confirms, the stop-sale clock is met.
5. The case panel shows the affected online orders, a customer notice and a regulator summary to copy into your own tools. RecallReady never sends anything to customers or regulators itself.
6. When every location has confirmed, the case closes with a closing record: units recovered against units expected (effectiveness), every clock and a timeline.

## Matching you can explain

Every match carries its evidence, for example "GTIN 02000000000237 appears in the notice" or "Lot 26J10A is listed in the notice".

| Confidence | Rule | What happens |
|---|---|---|
| High | A GTIN on the notice equals the product GTIN; or the brand is named and a model number equals the product SKU; or the brand is named, at least 60% of the product name's words appear and one of the product's lot codes is listed | Ticked on the board for one recall; the radar opens the case by itself |
| Medium | The brand is named and at least 60% of the product name's words appear; or a GTIN or model matches but the brand is missing, or the notice lists lots and none of them is ours | Shown for review; never opened by itself |
| Low | The brand is named but fewer of the product name's words appear | Shown for review; matches with no product word at all are folded under "Show brand-only matches" |

GTINs are read even when printed with spaces or dashes and are checked with the GS1 check digit. Lot codes are read after "lot", "lots", "batch" or "batches", model numbers after "model", "item" or "SKU", and dates are not mistaken for lots.

## Response plan

Each case shows four clocks, counted from the moment the recall opens. They are your own targets, set in Settings:

| Step | Default |
|---|---|
| Stop sale at every location | 4 hours |
| Customer notice ready | 24 hours |
| Regulator summary ready | 24 hours |
| Effectiveness check | 168 hours |

## Mock recalls

Food-safety schemes expect the recall procedure to be tested; the SQF Code, for example, requires the withdrawal and recall procedure to be reviewed and tested at least once a year. A mock recall runs the real process on a product and lots you choose. Each location gets a task to find and count the units, not to take them off sale. It is labelled "Mock recall" everywhere, its customer notice starts with "Mock recall test: do not send this notice to customers.", its regulator summary is marked "not for submission", and asking "can we still sell this lot?" never answers no because of a test.

## Catalog in Assets

Settings creates an Assets schema "RecallReady catalog" (key RRC):

| Object type | Attributes |
|---|---|
| Product | Brand, SKU, GTIN, Category, Supplier |
| Location | Type (Store, Warehouse, Online, Seller), Region |
| Lot | Product, Best by date (the object name is the lot code) |
| Stock | Lot, Location, Units |
| Order | Lot, Units, Customer, Customer email, Ordered at (the object name is the order number) |

Load your own catalog into these object types with Assets import. The optional sample is a fictional retailer, Larkmere Market: 24 products, 10 locations, 59 lots, 302 stock rows and 40 online orders. Every brand and person in it is invented.

## Try it

You need a Jira site with Jira Service Management and Assets, and a Jira admin account.

1. Install RecallReady (install link: added when the production version is shared).
2. Open Jira settings, Apps, RecallReady. Select Create catalog with sample data and allow access when Jira asks. Wait for "Sample data (done): 435 of 435 objects".
3. Choose a project for recall cases (any project with a standard work type and a sub-task type), check the company name and select Save settings.
4. Open Apps, RecallReady. Under Run a mock recall choose Larkmere Creamy Peanut Butter 16 oz and lot 26I01A, then Start mock recall. RecallReady opens a case with 7 stop-sale tasks and 188 units to pull.
5. Open a stop-sale task, open the RecallReady panel and select Confirm stop sale. Confirm the other locations the same way.
6. On the case, mark the customer notice and the regulator summary ready, then Close recall with closing record. The closing record says "Effectiveness 100%".
7. Back on the board, paste into Check a notice: "Quillbrook Farms is recalling Larkmere Creamy Peanut Butter 16 oz, lot 26J10A, because it may contain undeclared tree nuts (almonds)." The first row is a High match on lot 26J10A.
8. Select Ask Rovo, switch the agent to RecallReady and ask "Can we still sell Larkmere Creamy Peanut Butter 16 oz from lot 26J10A?"

## Rovo actions

| Action | Verb | What it does |
|---|---|---|
| check-product | GET | Is a product, GTIN, SKU or lot in the catalog, and is it under an open recall? |
| get-recall-status | GET | Who has confirmed and who has not (with units), every clock, and how many online orders are affected |
| list-recalls | GET | Open recalls with progress and the next clock |
| check-notice | GET | Matches a notice against the catalog, with confidence and evidence |
| get-customer-notice | GET | The customer notice, the regulator summary and the affected orders |
| start-recall | CREATE | Opens a recall for the High matches of a notice (Rovo asks the person to confirm first) |

## How it is built

- Atlassian Forge app on the Node 24 runtime, with UI Kit for the board, the panel and the settings page.
- Jira calls from the board, the panel and the agent run as the current user. The hourly radar has no user, so it runs as the app.
- Creating the Assets schema runs as the admin who sets it up. Reading the catalog and creating sample objects run as the app.
- Each stop-sale confirmation is stored on its own sub-task and merged when the case is read, so two managers confirming at the same moment never overwrite each other. A closed case is frozen as it was closed.
- Stop-sale sub-tasks are created in bulk (50 per call), each with its own work item property. The case property stays small: the list of online orders is read from Assets when it is needed.
- "Can we still sell this?" reads every open recall case in the site and never gives an all-clear it could not check.
- The radar claims each notice before it opens a case, so two scans can never open the same case twice. Scan now and the sample catalog load run in a Forge queue consumer that reports progress.
- Pure logic (identifier parsing, notice adapters, matching, catalog lookup, the case model, clocks, the radar plan, answers) lives in `src/lib` and is covered by Node's built-in test runner: `npm test` runs 91 tests.

```
src/
  lib/            parsing, notices, matching, case model, clocks, sample data (pure, tested)
  platform/       Assets, Jira, Forge storage and public feed calls
  services/       setup, recalls and the radar
  resolvers/      board, panel and settings resolvers
  frontend/       UI Kit board, panel and settings
  actions.js      Rovo actions
skills/recall-response/   rovo:skill instructions
test/             unit tests and real FDA and CPSC records used as fixtures
```

## Run it yourself

```bash
npm install
npm test
forge deploy -e development
forge install --site <your-site>.atlassian.net --product Jira -e development
```

## Privacy, terms and security

The recall radar reads two public sources, the openFDA enforcement reports (api.fda.gov) and the CPSC recalls API (www.saferproducts.gov). It sends them only a date range; no catalog or customer data leaves Atlassian. See [PRIVACY.md](PRIVACY.md), [TERMS.md](TERMS.md) and [SECURITY.md](SECURITY.md).

Data sources: FDA recall data is provided by the U.S. Food and Drug Administration (https://open.fda.gov) and is in the public domain. CPSC recall data comes from the U.S. Consumer Product Safety Commission's Recalls API, which CPSC makes publicly available to consumers, businesses and software developers. Always check the original notice.

Questions and bug reports: [GitHub issues](https://github.com/kapilshipturtle/recallready/issues).

## License

[MIT](LICENSE)
