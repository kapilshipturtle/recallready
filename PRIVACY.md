# RecallReady privacy policy

Last updated: 14 November 2026

RecallReady is a Forge app for Jira Service Management and Assets. This page explains what it reads, what it keeps, what it sends and where it runs.

## What the app reads

- The RecallReady catalog in Assets: products, locations, lots, stock and online orders, including the customer name and email address stored on each order. The catalog is read by the app itself, so anyone who can use RecallReady can look up products, lots and stock.
- Jira work items in the project chosen for recall cases: the recall cases, their stop-sale tasks and the RecallReady data stored on them. These are read with the current person's own Jira permissions, except during the hourly recall radar, which has no person and runs as the app.
- Public recall notices from the openFDA enforcement reports (api.fda.gov) and the CPSC recalls API (www.saferproducts.gov).
- Text that a person pastes into Check a notice or gives to the Rovo agent.

## What the app stores

In your Jira site:

- An Assets schema "RecallReady catalog" with the object types Product, Location, Lot, Stock and Order, and, if an admin asks for it, a fictional sample catalog.
- Recall cases and stop-sale tasks (Jira work items) in the project an admin chooses, with a work item property named `recallready`. A case keeps the affected products, lots and locations, the units expected and confirmed, who confirmed and when, the response plan clocks, a timeline, and the order number, customer name, customer email and units of every online order that contains an affected lot, so the team can notify those customers. Anyone who can view the case work item can read this data.
- Comments that RecallReady adds to cases and tasks: stop-sale confirmations and the closing record.

In Forge storage, inside your installation:

- The settings: the Assets schema and object type ids, the project key, the company name, the response plan hours and which radar sources are on.
- Progress of the sample catalog load and the list of sample objects it created.
- Recall radar state: the last date read from each source, the ids of up to 5,000 public notices already checked, up to 100 public notices waiting for review with the products they may match, and a summary of the last scan.

When the app is uninstalled, Forge deletes the data in Forge storage. The Assets schema, the work items and the comments are ordinary site data and stay until an admin deletes them.

## What the app sends outside Atlassian

Only the recall radar makes outside calls, to api.fda.gov and www.saferproducts.gov. Each request asks for recall notices published in a date range. No catalog data, customer data or work item data is sent. Because of these calls RecallReady is not a "Runs on Atlassian" app.

RecallReady never sends email, messages or reports to customers or regulators. It prepares the text; people decide what to send and send it with their own tools.

## AI

RecallReady does not call any AI model itself. The Rovo agent and skill run in Atlassian Rovo, under your agreements with Atlassian.

## Logs

Forge keeps the app's logs. The hourly radar logs how many notices it checked and how many cases it opened; error logs may contain work item keys or error messages. Site admins can turn off log sharing with the developer in Atlassian Administration under Connected apps.

## Contact

Questions or requests: open an issue at https://github.com/kapilshipturtle/recallready/issues
