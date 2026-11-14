# Live check (dev site your test site)

1. Settings: catalog set up, sample loaded (24 products), recall project chosen.
2. Board: Run a mock recall on Larkmere Creamy Peanut Butter 16 oz, lot 26I01A.
   Expected: one case work item labelled recallready-case + recallready-drill, with 7 stop-sale sub-tasks
   (stock rows for lot 26I01A: W01 48, S01 36, S02 24, S03 18, S05 30, S07 12, O01 20).
3. Open one stop-sale sub-task, confirm 36 units. Expected: sub-task Done with a comment; case panel shows 1 of 7 confirmed.
4. Confirm the rest. Expected: stop-sale clock met. Close the recall. Expected: closing record comment, case Done, Effectiveness 100%.
