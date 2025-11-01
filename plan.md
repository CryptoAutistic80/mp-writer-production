# Refactoring Plan: Extract Components and Utils from ai.service.ts

## Overview

`ai.service.ts` is 4737 lines and contains multiple responsibilities. This plan extracts reusable code into focused modules while preserving functionality and updating tests accordingly. The focus is solely on the backend AI service refactoring.

### 1.1 Extract Constants (`backend-api/src/ai/constants/ai.constants.ts`)

- Move all credit cost constants (`FOLLOW_UP_CREDIT_COST`, `DEEP_RESEARCH_CREDIT_COST`, `LETTER_CREDIT_COST`, `TRANSCRIPTION_CREDIT_COST`)
- Move timeout constants (`LETTER_STREAM_INACTIVITY_TIMEOUT_MS`, `RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS`, etc.)
- Move buffer size constants (`DEEP_RESEARCH_RUN_BUFFER_SIZE`, `LETTER_RUN_BUFFER_SIZE`)
- Move TTL constants (`DEEP_RESEARCH_RUN_TTL_MS`, `LETTER_RUN_TTL_MS`)
- Move retry/attempt constants (`RESEARCH_MAX_RESUME_ATTEMPTS`, `LETTER_MAX_RESUME_ATTEMPTS`)
- Move background polling constants (`BACKGROUND_POLL_INTERVAL_MS`, `BACKGROUND_POLL_TIMEOUT_MS`)

### 1.2 Extract Types and Interfaces (`backend-api/src/ai/types/streaming.types.ts`)

- Extract `DeepResearchStreamPayload` type
- Extract `LetterStreamPayload` type
- Extract `DeepResearchRun` interface and `DeepResearchRunStatus` type
- Extract `LetterRun` interface and `LetterRunStatus` type
- Extract `LetterDocumentInput` interface
- Extract `LetterContext` interface
- Extract `LetterCompletePayload` interface
- Extract `WritingDeskLetterResult` interface
- Extract `DeepResearchRequestExtras` interface
- Extract `ResponseStreamLike` type

### 1.3 Extract OpenAI Client Management (`backend-api/src/ai/utils/openai-client.util.ts`)

- Extract `getOpenAiClient` method → `createOrGetOpenAiClient()`
- Extract `handleOpenAiError` method → `handleOpenAiError()`
- Extract `handleOpenAiSuccess` method → `handleOpenAiSuccess()`
- Move client lifecycle management (creation, recreation on errors/age)

### 1.4 Extract Letter Schema and Prompts (`backend-api/src/ai/utils/letter-schema.util.ts`)

- Extract `LETTER_RESPONSE_SCHEMA` constant
- Extract `buildLetterResponseSchema()` method
- Extract `LETTER_SYSTEM_PROMPT` constant
- Extract `buildLetterSystemPrompt()` method
- Extract `buildLetterPrompt()` method
- Extract `LETTER_TONE_DETAILS`, `LETTER_TONE_SIGN_OFFS`, `LETTER_TONE_REQUEST_PREFIX` constants

### 1.5 Extract Letter Document Builder (`backend-api/src/ai/utils/letter-document.util.ts`)

- Extract `buildLetterDocumentHtml()` method
- Extract letter HTML template generation logic

### 1.6 Extract Stream Utilities (`backend-api/src/ai/utils/stream.util.ts`)

- Extract `createStreamWithTimeout()` method
- Extract `normaliseStreamEvent()` method
- Extract `extractOutputTextDelta()` method
- Extract stream resume logic (common parts of `attemptStreamResume` from both letter and research)

### 1.7 Extract Error Handling Utilities (`backend-api/src/ai/utils/error.util.ts`)

- Extract `isRecoverableTransportError()` method
- Extract `isOpenAiResponseMissingError()` method
- Extract `buildBackgroundFailureMessage()` method
- Extract error logging utilities

### 1.8 Extract Letter Processing Utilities (`backend-api/src/ai/utils/letter-processing.util.ts`)

- Extract `parseLetterResult()` method
- Extract `mergeLetterResultWithContext()` method
- Extract `extractLetterPreview()` method
- Extract `extractSubjectLinePreview()` method
- Extract `extractReferencesFromJson()` method
- Extract `toLetterCompletePayload()` method
- Extract `normaliseLetterTone()` method
- Extract `normaliseLetterVerbosity()` method
- Extract `normaliseLetterReasoningEffort()` method

### 1.9 Extract Deep Research Utilities (`backend-api/src/ai/utils/deep-research.util.ts`)

- Extract `buildDeepResearchPrompt()` method
- Extract `buildDeepResearchRequestExtras()` method
- Extract `buildDeepResearchStub()` method
- Extract `resolveUserMpName()` method

### 1.10 Extract Background Polling Service (`backend-api/src/ai/services/background-polling.service.ts`)

- Extract `waitForBackgroundResponseCompletion()` method
- Extract background polling logic with retries and timeouts

### 1.11 Extract Stub Builders (`backend-api/src/ai/utils/stub-builders.util.ts`)

- Extract `buildStubLetter()` method
- Extract `buildStubFollowUps()` method
- Extract dev stub generation logic

### 1.12 Extract Context Resolution (`backend-api/src/ai/utils/context.util.ts`)

- Extract `resolveLetterContext()` method
- Extract context building logic for MP and sender information

### 1.13 Extract Persistence Utilities (`backend-api/src/ai/utils/persistence.util.ts`)

- Extract `persistLetterState()` method
- Extract `persistLetterResult()` method
- Extract `persistDeepResearchStatus()` method
- Extract `persistDeepResearchResult()` method

### 1.14 Update ai.service.ts

- Import all extracted utilities and types
- Remove extracted code
- Update method calls to use extracted utilities
- Ensure service class focuses on orchestration and run management

### 1.15 Update Tests (`backend-api/src/ai/ai.service.spec.ts`)

- Update imports to include new utility modules
- Mock extracted utilities where appropriate
- Ensure all existing tests still pass

---

## Phase 2: Frontend WritingDesk Client Refactoring

### 2.1 Extract Constants (`frontend/src/features/writing-desk/constants/writing-desk.constants.ts`)

- Extract `followUpCreditCost`, `deepResearchCreditCost`, `letterCreditCost` constants
- Extract `MAX_RESEARCH_ACTIVITY_ITEMS`, `MAX_LETTER_REASONING_ITEMS` constants
- Extract `LETTER_TONE_LABELS` constant
- Extract `steps` and `initialFormState` constants

### 2.2 Extract Types (`frontend/src/features/writing-desk/types/streaming.types.ts`)

- Extract `DeepResearchStreamMessage` type
- Extract `LetterStreamMessage` type
- Extract `DeepResearchHandshakeResponse` type
- Extract `ResearchStatus` type

### 2.3 Extract Utility Functions (`frontend/src/features/writing-desk/utils/stream-utils.ts`)

- Extract `extractReasoningSummary()` function
- Extract `describeResearchEvent()` function
- Extract `createLetterRunId()` function
- Extract `formatCredits()` function

### 2.4 Extract Research Stream Hook (`frontend/src/features/writing-desk/hooks/useResearchStream.ts`)

- Extract all research stream handling logic from `startDeepResearch`
- Extract EventSource management for research
- Extract research state management (status, content, activities, errors)
- Extract auto-resume logic for research
- Return: research state, handlers, cleanup functions

### 2.5 Extract Letter Stream Hook (`frontend/src/features/writing-desk/hooks/useLetterStream.ts`)

- Extract all letter stream handling logic from `openLetterStream` and related functions
- Extract EventSource management for letter composition
- Extract letter state management (status, content, events, errors)
- Extract auto-resume logic for letter
- Return: letter state, handlers, cleanup functions

### 2.6 Extract State Management Hook (`frontend/src/features/writing-desk/hooks/useWritingDeskState.ts`)

- Extract form state management
- Extract phase/step navigation logic
- Extract follow-up state management
- Extract job persistence logic
- Extract snapshot/apply logic (`applySnapshot`, `buildSnapshotPayload`, `resourceToPayload`)

### 2.7 Extract Modal Handlers Hook (`frontend/src/features/writing-desk/hooks/useWritingDeskModals.ts`)

- Extract all modal state and handlers (start over, recompose, create letter, edit intake, research, follow-ups, exit)
- Consolidate modal management logic

### 2.8 Extract Credits Management Hook (`frontend/src/features/writing-desk/hooks/useCredits.ts`)

- Extract `refreshCredits()` function
- Extract `reportRefundedFailure()` function
- Extract credits state management
- Extract credit calculation utilities

### 2.9 Extract Form Handlers (`frontend/src/features/writing-desk/components/WritingDeskForm.tsx`)

- Extract initial form UI (phase === 'initial')
- Extract follow-up form UI (phase === 'followup')
- Keep form handlers in parent but move UI rendering here

### 2.10 Extract Summary View Component (`frontend/src/features/writing-desk/components/WritingDeskSummary.tsx`)

- Extract summary phase UI rendering
- Extract research section UI
- Extract intake details section UI
- Extract follow-up questions display UI

### 2.11 Extract Letter Composition Component (`frontend/src/features/writing-desk/components/LetterComposition.tsx`)

- Extract tone selection UI (letterPhase === 'tone')
- Extract streaming UI (letterPhase === 'streaming')
- Extract completed letter UI (letterPhase === 'completed')
- Extract error state UI

### 2.12 Update WritingDeskClient.tsx

- Import all extracted hooks and components
- Remove extracted code
- Use hooks for state management and handlers
- Compose components for UI rendering
- Keep main orchestration logic in the client component

### 2.13 Update Tests (`frontend/src/app/writingDesk/WritingDeskClient.test.tsx`)

- Mock new hooks
- Update test setup for new component structure
- Ensure all existing tests still pass

---

## Phase 3: Verification and Testing

### 3.1 Run Type Checking

- `nx run backend-api:typecheck` (if available) or `tsc --noEmit`
- `nx run frontend:typecheck` or equivalent
- Fix any type errors from refactoring

### 3.2 Run Tests

- `nx test backend-api` - verify all AI service tests pass
- `nx test frontend` - verify all WritingDeskClient tests pass
- Ensure no regressions introduced

### 3.3 Manual Testing Checklist

- [ ] Follow-up question generation works
- [ ] Deep research stream works (start, resume, background polling)
- [ ] Letter composition stream works (start, resume, background polling)
- [ ] Job persistence and restoration works
- [ ] All modals open/close correctly
- [ ] Credits deduction and display work
- [ ] Error handling and refunds work
- [ ] Transcription integration works

### 3.4 Code Quality

- Ensure no unused imports remain
- Verify proper exports in all new modules
- Check that file sizes are reduced appropriately
- Ensure proper separation of concerns

---

## File Structure After Refactoring

### Backend Structure

```
backend-api/src/ai/
├── ai.service.ts (reduced to ~1500-2000 lines)
├── ai.controller.ts
├── ai.module.ts
├── constants/
│   └── ai.constants.ts
├── types/
│   └── streaming.types.ts
├── utils/
│   ├── openai-client.util.ts
│   ├── letter-schema.util.ts
│   ├── letter-document.util.ts
│   ├── letter-processing.util.ts
│   ├── deep-research.util.ts
│   ├── stream.util.ts
│   ├── error.util.ts
│   ├── context.util.ts
│   ├── persistence.util.ts
│   └── stub-builders.util.ts
└── services/
    └── background-polling.service.ts
```

### Frontend Structure

```
frontend/src/features/writing-desk/
├── components/
│   ├── WritingDeskForm.tsx (new)
│   ├── WritingDeskSummary.tsx (new)
│   ├── LetterComposition.tsx (new)
│   └── ... (existing components)
├── hooks/
│   ├── useResearchStream.ts (new)
│   ├── useLetterStream.ts (new)
│   ├── useWritingDeskState.ts (new)
│   ├── useWritingDeskModals.ts (new)
│   ├── useCredits.ts (new)
│   └── ... (existing hooks)
├── constants/
│   └── writing-desk.constants.ts (new)
├── types/
│   ├── streaming.types.ts (new)
│   └── types.ts (existing)
└── utils/
    ├── stream-utils.ts (new)
    └── composeLetterHtml.ts (existing)
```

---

## Risks and Mitigations

1. **Risk**: Breaking existing functionality

   - **Mitigation**: Comprehensive test suite, incremental extraction, verify after each phase

2. **Risk**: Circular dependencies

   - **Mitigation**: Careful dependency planning, extract utilities first, then services

3. **Risk**: Test updates become extensive

   - **Mitigation**: Maintain same public interfaces where possible, mock new utilities appropriately

4. **Risk**: Import path changes break other files

   - **Mitigation**: Use barrel exports, update all imports systematically

---

## Success Criteria

1. `ai.service.ts` reduced to <2000 lines (target: ~1500-1800 lines)
2. `WritingDeskClient.tsx` reduced to <1000 lines (target: ~800-1000 lines)
3. All existing tests pass
4. No functionality changes
5. Code is more maintainable with clear separation of concerns
6. New modules are properly typed and documented