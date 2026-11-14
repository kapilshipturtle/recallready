# Review of the demo video (2026-11-14)

Checked with `npx hyperframes@0.9.41 check`: no errors.

Warnings kept on purpose:

- `nested_media_start_basis_ambiguous` (23): every clip's `data-start` is local to its scene, as intended.
- `line_unread` (8): a few callouts are on screen for less time than a full read; the narration says the same words at the same moment.
- `text_below_floor` (3): the data credit line and two small labels.

Frames were captured with `npx hyperframes snapshot` at about 80 moments and around all 11 scene cuts, and looked at one by one. Fixed after looking:

- Highlight boxes resized where they cut through text (closing record clocks and timeline, radar sources, mock recall label).
- The evidence strip in Check a notice now shows a grey "Match" slot that turns into "High", and the Medium match sits in its own card.
- Callouts moved or shortened where they covered text; the scene label moved to the top right.
- Shots re-framed so the Jira sidebar ("Recommended for your team", which lists other vendors' apps) stays out of the picture.

Every cut between scenes is a short dip to the light background.
