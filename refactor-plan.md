# Writing Desk Client Refactor

1. Snapshot Current Behaviour

- Review existing writing desk flows (initial intake, follow-ups, research, letter generation) to ensure refactor preserves state transitions and streaming behaviour.
- Identify current tests covering the desk (frontend unit/e2e) and note any gaps that may need new coverage after the split.

2. Extract Shared Types, Constants, Utilities

- Move `steps`, `LETTER_TONE_LABELS`, credit costs, helper fns like `createLetterRunId`, `extractReasoningSummary`, `describeResearchEvent`, `formatCredits` into `frontend/src/app/features/writing-desk/utils/` (or similar) with targeted exports.
- Ensure `WritingDeskClient` imports via module root and update any dependent files.

3. Isolate Streaming & Persistence Logic Into Hooks

- Carve out deep-research stream management (EventSource lifecycle, retry, activity feed) into `useDeepResearchStream` hook.
- Do the same for letter composition (`useLetterComposer`) and job persistence (`useWritingDeskPersistence`), exposing clear APIs (`start`, `resume`, `reset`, state snapshots).
- Keep side effects (EventSource setup/cleanup, retries) encapsulated inside hooks, returning status and actions for the client component.

4. Componentize UI Sections

- Extract intake form (`WritingDeskIntakeForm`), follow-up workflow (`WritingDeskFollowUpForm`), summary panel (`WritingDeskSummary` including research panel + follow-up summary), and letter presentation (`WritingDeskLetterPanel`).
- Pass only necessary props/state handlers from `WritingDeskClient`, ensuring state remains single-sourced in the container for now.

5. Recompose `WritingDeskClient`

- Rewire the client to compose the new hooks and subcomponents, trimming redundant state where hooks now manage it.
- Confirm modals still render correctly and props remain unchanged externally.

6. Verify & Augment Tests

- Update or add component/hook tests as needed (Jest/RTL) and run `nx test frontend`.
- Run relevant e2e (`nx e2e frontend-e2e`) or smoke checks to confirm no regression.
