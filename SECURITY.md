# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open this repository's Security tab and select Report a vulnerability. Only the maintainer can see the report.

## How RecallReady protects your data

- Atlassian Forge. RecallReady runs on Atlassian Forge and has no back end of its own.
- The person's own Jira permissions. Work items are read and changed as the current person, so nobody can see or change a recall case they could not open in Jira. The hourly radar has no person and runs as the app.
- The work item comes from Jira. The recall panel takes the work item key from the Forge context, never from the browser.
- Admin-only settings. Creating the catalog, loading the sample, saving settings and running a scan all check on the server that the person is a Jira admin.
- Human confirmation. The Rovo action that opens a recall is a CREATE action, so Rovo asks the person to confirm before it runs. A radar case opens by itself only on a High match (GTIN, model number, or brand plus product name plus lot code).
- Narrow outside access. The only outside calls go to api.fda.gov and www.saferproducts.gov and carry only a date range. See [PRIVACY.md](PRIVACY.md).
- No secrets. The app never asks for API tokens, passwords or other shared secrets.

## What to know before you install

The catalog in Assets is read by the app itself, so anyone who can use RecallReady can look up the catalog's products, lots and stock, and anyone who can view a recall case can read the affected customers' names and email addresses stored on it. Put recall cases in a project that only your recall team can browse.

## Supported versions

Only the current production version of the Forge app gets security fixes. A fix that needs no new permissions reaches every installation automatically when it is deployed.
