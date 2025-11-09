import { act, renderHook } from '@testing-library/react';
import { useWritingDeskPersistence } from './useWritingDeskPersistence';
import { useActiveWritingDeskJob } from './useActiveWritingDeskJob';

jest.mock('./useActiveWritingDeskJob');

const mockUseActiveWritingDeskJob = useActiveWritingDeskJob as jest.MockedFunction<
  typeof useActiveWritingDeskJob
>;

describe('useWritingDeskPersistence', () => {
  beforeEach(() => {
    mockUseActiveWritingDeskJob.mockReturnValue({
      activeJob: null,
      isLoading: false,
      saveJob: jest.fn(),
      isSaving: false,
      clearJob: jest.fn(),
      isClearing: false,
      error: null,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applies the snapshot before re-enabling persistence when resuming an existing job', () => {
    const pendingJob = {
      jobId: 'job-123',
      phase: 'summary',
    } as any;

    const setJobId = jest.fn();
    const setHasHandledInitialJob = jest.fn();
    const setPendingJob = jest.fn();
    const setResumeModalOpen = jest.fn();
    const setPersistenceEnabled = jest.fn();
    const setJobSaveError = jest.fn();
    const serializeJob = jest.fn(() => ({
      jobId: 'job-123',
      phase: 'summary',
    }));
    const onApplySnapshot = jest.fn();

    const { result } = renderHook(() =>
      useWritingDeskPersistence({
        jobId: null,
        setJobId,
        hasHandledInitialJob: false,
        setHasHandledInitialJob,
        pendingJob,
        setPendingJob,
        setResumeModalOpen,
        persistenceEnabled: false,
        setPersistenceEnabled,
        setJobSaveError,
        getSnapshot: jest.fn(),
        serializeJob,
        onApplySnapshot,
        onResetLocalState: jest.fn(),
      }),
    );

    act(() => {
      result.current.handleResumeExistingJob();
    });

    expect(onApplySnapshot).toHaveBeenCalledWith(pendingJob);
    expect(setPersistenceEnabled).toHaveBeenCalledWith(true);
    expect(onApplySnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      setPersistenceEnabled.mock.invocationCallOrder[0],
    );
  });
});
