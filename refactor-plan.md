# Restore Writing Desk Experience Plan

## Scope

- Reintroduce tone styling, reasoning feed updates, streaming preview, and full letter metadata so the Writing Desk matches the pre-refactor behaviour.

## Steps

1. Compare Styles - COMPLETED

- Audit `frontend/src/features/writing-desk/components/WritingDeskLetterPanel.tsx` against the pre-refactor styling in `mp-writer-production` to restore tone-specific CSS tokens (pastel backgrounds, badges, hover states).

2. Reinstate Reasoning Feed Events

- In `backend-api/src/ai/writing-desk/letter/letter.service.ts`, forward `response.reasoning*` events (and summaries) through `send({ type: 'event', ... })` so `useLetterComposer` receives them.

3. Stream Letter Preview

- Reintroduce incremental preview logic: parse `delta` JSON to extract `letter_content` and `subject_line_html`, build HTML via the existing `buildLetterDocumentHtml`, and emit `letter_delta` updates while persisting progress.

4. Deliver Complete Letter Metadata

- Ensure the final `complete` payload returns the fully rendered HTML (including addresses, date, phone, references) and populate `LetterCompletePayload`/snapshot so the front end displays the full letter envelope.

5. Verify Front-End Integration

- Adjust `useLetterComposer` if needed to handle the restored streaming events, reasoning feed, and letter metadata. Confirm `composeLetterHtml` usage matches server output.

6. Regression Checks

Regression Checks
Run targeted unit/e2e smoke tests (nx test frontend, nx test backend-api, nx e2e frontend-e2e if time allows) focusing on the Writing Desk flow.

- FURTHER POINTS TO NOTE
stream items are displayed in the activity feed NOT the progress spinner.
