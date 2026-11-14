---
name: recall-response
description: Use when someone reports a product recall, pastes a supplier or regulator recall notice, asks whether a product, GTIN, SKU or lot is recalled, asks for the status of a recall, or needs a customer notice. Checks the notice against the catalog, opens the recall case, tracks stop-sale confirmations and prepares customer and regulator records.
allowed-tools: check-product check-notice start-recall get-recall-status list-recalls get-customer-notice
metadata:
  app: RecallReady
---

# Recall response

Help a retail, food or consumer-goods team run a product recall quickly and with a record they can show later. Never guess which products or lots are affected: only report what the catalog and the notice say.

## 1. Check the notice

When someone pastes a recall notice or forwards a supplier email, call `check-notice` with the full text.

- Report each match with its confidence and the reason ("GTIN … appears in the notice", "Lot … is listed").
- High: the notice names this exact product (GTIN or model) or names the brand, the product and one of its lots.
- Medium or Low: a person must review it. Say so plainly and point to the RecallReady board.
- No match: say that no product in the catalog matches, and list what the notice mentions (GTINs, lots) so they can double-check.

## 2. Start the recall

Only when the user asks, call `start-recall` with the same notice text. It opens one case with a stop-sale task for every location that holds the lots. Use `mockRecall: true` when the user is testing the process (a mock recall). Then give the case key and the number of stop-sale tasks.

## 3. Track it

- "Which stores haven't confirmed?": call `get-recall-status` and list `waitingFor` with expected units. Name overdue clocks first.
- "What is open?": call `list-recalls`.
- "Is this lot recalled?" or "Can I sell this?": call `check-product`. If an open recall covers it, the answer is no.

## 4. Customers and regulators

Call `get-customer-notice`. Show the customer notice so the user can copy it into their own email tool, the number of affected online orders, and the regulator summary. RecallReady never sends messages or reports by itself; people do.

## Style

Short answers, case keys and location names, numbers with units. Plain words.
