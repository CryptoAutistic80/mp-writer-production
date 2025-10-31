import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WritingDeskClient from './WritingDeskClient';
import { useActiveWritingDeskJob } from '../../features/writing-desk/hooks/useActiveWritingDeskJob';

jest.mock('../../features/writing-desk/hooks/useActiveWritingDeskJob');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

type FollowUpResponse = {
  followUpQuestions?: string[];
  notes?: string | null;
  responseId?: string | null;
  remainingCredits?: number;
};

type FetchArgs = Parameters<typeof fetch>;

type ResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  public onmessage: ((event: MessageEvent<string>) => void) | null = null;

  public onerror: ((event: Event) => void) | null = null;

  public close = jest.fn();

  constructor(public url: string, _?: EventSourceInit) {
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

const mockUseActiveWritingDeskJob = useActiveWritingDeskJob as jest.MockedFunction<
  typeof useActiveWritingDeskJob
>;

const createJsonResponse = (payload: any): ResponseLike => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

describe('WritingDeskClient', () => {
  const originalFetch = global.fetch;
  const originalEventSource = window.EventSource;
  const saveJobMock = jest.fn();
  const clearJobMock = jest.fn();
  const refetchMock = jest.fn(async () => null);
  const followUpQueue: FollowUpResponse[] = [];
  let mockCredits = 1;
  let fetchMock: jest.Mock<Promise<ResponseLike>, FetchArgs>;

  const setupFetchMock = () => {
    fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return createJsonResponse({ credits: mockCredits });
      }
      if (url === '/api/ai/writing-desk/follow-up') {
        const response = followUpQueue.shift();
        if (!response) {
          throw new Error('No queued follow-up response');
        }
        return createJsonResponse({
          followUpQuestions: response.followUpQuestions ?? [],
          notes: response.notes ?? null,
          responseId: response.responseId ?? null,
          remainingCredits: response.remainingCredits ?? 0.9,
        });
      }
      if (url === '/api/ai/writing-desk/follow-up/answers') {
        return createJsonResponse({ status: 'ok' });
      }
      if (url === '/api/writing-desk/jobs/active/research/start') {
        return createJsonResponse({
          jobId: 'job-123',
          streamPath: '/api/ai/writing-desk/deep-research?jobId=job-123',
        });
      }
      if (url === '/api/auth/csrf-token') {
        return createJsonResponse({ csrfToken: 'test-token' });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }) as unknown as jest.Mock<Promise<ResponseLike>, FetchArgs>;
    global.fetch = fetchMock as unknown as typeof fetch;
  };

  const renderComponent = async () => {
    await act(async () => {
      render(<WritingDeskClient />);
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ cache: 'no-store' }),
      ),
    );
    await screen.findByRole('status', { name: /You have .* credits available/i });
  };

  const answerInitialQuestions = async () => {
    const textarea = await screen.findByLabelText(/Tell us everything/i);
    fireEvent.change(textarea, { target: { value: 'Issue description' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate follow-up questions' }));
    });
    const confirmDialog = await screen.findByRole('dialog', { name: 'Generate follow-up questions?' });
    expect(confirmDialog).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, generate questions' }));
    });
  };

  const answerFollowUpQuestions = async (answers: string[]) => {
    for (let idx = 0; idx < answers.length; idx += 1) {
      const label = new RegExp(`Follow-up question ${idx + 1}`);
      const textarea = await screen.findByLabelText(label);
      fireEvent.change(textarea, { target: { value: answers[idx] } });
      const buttonLabel = idx === answers.length - 1 ? 'Save answers' : 'Next';
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: buttonLabel }));
      });
    }
  };

  beforeEach(() => {
    saveJobMock.mockResolvedValue({ jobId: 'job-123' });
    clearJobMock.mockResolvedValue(undefined);
    followUpQueue.length = 0;
    mockCredits = 1;
    setupFetchMock();
    refetchMock.mockClear();
    MockEventSource.reset();
    mockUseActiveWritingDeskJob.mockReturnValue({
      activeJob: null,
      isLoading: false,
      refetch: refetchMock,
      saveJob: saveJobMock,
      isSaving: false,
      clearJob: clearJobMock,
      isClearing: false,
      error: null,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(() => {
    window.EventSource = MockEventSource as unknown as typeof EventSource;
    (global as any).EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    window.EventSource = originalEventSource;
    (global as any).EventSource = originalEventSource;
  });

  it('persists summary state after submitting follow-up answers', async () => {
    followUpQueue.push({
      followUpQuestions: ['Question one?', 'Question two?'],
      notes: 'Helpful note',
      responseId: 'resp-1',
      remainingCredits: 0.8,
    });

    await renderComponent();
    await answerInitialQuestions();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/writing-desk/follow-up', expect.any(Object)));
    await answerFollowUpQuestions(['First answer', 'Second answer']);

    await screen.findByText('Initial summary captured');

    const summaryCall = saveJobMock.mock.calls.find(([payload]) => payload.phase === 'summary');
    expect(summaryCall).toBeDefined();
    expect(summaryCall?.[0]).toMatchObject({
      phase: 'summary',
      followUpQuestions: ['Question one?', 'Question two?'],
      followUpAnswers: ['First answer', 'Second answer'],
      notes: 'Helpful note',
      responseId: 'resp-1',
    });
    expect(clearJobMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Review / Edit Follow up answers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit intake answers' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show intake details' }));
    });

    expect(screen.getByRole('button', { name: 'Ask for new follow-up questions' })).toBeInTheDocument();
  });


  it('regenerates follow-up questions when requested from the summary view', async () => {
    followUpQueue.push({
      followUpQuestions: ['Question one?', 'Question two?'],
      notes: 'Helpful note',
      responseId: 'resp-1',
      remainingCredits: 0.8,
    });
    followUpQueue.push({
      followUpQuestions: ['New follow-up question'],
      notes: 'Fresh note',
      responseId: 'resp-2',
      remainingCredits: 0.7,
    });

    await renderComponent();
    await answerInitialQuestions();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/writing-desk/follow-up', expect.any(Object)));
    await answerFollowUpQuestions(['First answer', 'Second answer']);
    await screen.findByText('Initial summary captured');

    const followUpCallsBefore = fetchMock.mock.calls.filter(([url]) => {
      const requestUrl = typeof url === 'string' ? url : url.toString();
      return requestUrl === '/api/ai/writing-desk/follow-up';
    }).length;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show intake details' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask for new follow-up questions' }));
    });

    const regenerateDialog = await screen.findByRole('dialog', { name: 'Generate new follow-up questions?' });
    expect(regenerateDialog).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, generate new questions' }));
    });

    await screen.findByLabelText(/Follow-up question 1 of 1/);
    expect(screen.getByText('New follow-up question')).toBeInTheDocument();

    const followUpCallsAfter = fetchMock.mock.calls.filter(([url]) => {
      const requestUrl = typeof url === 'string' ? url : url.toString();
      return requestUrl === '/api/ai/writing-desk/follow-up';
    }).length;
    expect(followUpCallsAfter).toBe(followUpCallsBefore + 1);
  });

  it('disables credit-consuming summary actions when credits are below the required amount', async () => {
    mockCredits = 0.2;
    followUpQueue.push({
      followUpQuestions: ['First question?'],
      notes: null,
      responseId: 'resp-low',
      remainingCredits: 0.05,
    });

    await renderComponent();
    await answerInitialQuestions();
    mockCredits = 0.05;
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/writing-desk/follow-up', expect.any(Object)));
    await answerFollowUpQuestions(['Answer']);
    await screen.findByText('Initial summary captured');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show intake details' }));
    });

    const regenerateButton = await screen.findByRole('button', { name: 'Ask for new follow-up questions' });
    expect(regenerateButton).toBeDisabled();
    expect(
      screen.getByText('You need at least 0.1 credits to generate new follow-up questions.'),
    ).toBeInTheDocument();
  });

  it('does not auto-resume deep research while background polling is active', async () => {
    jest.useFakeTimers();
    try {
      followUpQueue.push({
        followUpQuestions: ['Question one?', 'Question two?'],
        notes: 'Helpful note',
        responseId: 'resp-1',
        remainingCredits: 0.8,
      });

      await renderComponent();
      await answerInitialQuestions();
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/ai/writing-desk/follow-up', expect.any(Object)),
      );
      await answerFollowUpQuestions(['First answer', 'Second answer']);
      await screen.findByText('Initial summary captured');

      const researchButton = await screen.findByRole('button', { name: 'Start deep research' });
      await act(async () => {
        fireEvent.click(researchButton);
      });

      const confirmDialog = await screen.findByRole('dialog', { name: 'Start deep research?' });
      expect(confirmDialog).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Yes, start research' }));
      });

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/writing-desk/jobs/active/research/start', expect.any(Object)),
      );

      expect(MockEventSource.instances).toHaveLength(1);
      const [eventSource] = MockEventSource.instances;

      act(() => {
        eventSource.emit({ type: 'status', status: 'background_polling' });
      });

      const handshakeCallsBefore = fetchMock.mock.calls.filter(([url]) => {
        const requestUrl = typeof url === 'string' ? url : url.toString();
        return requestUrl === '/api/writing-desk/jobs/active/research/start';
      }).length;

      await act(async () => {
        jest.advanceTimersByTime(60000);
      });

      // Allow any pending microtasks triggered by the interval to settle
      await Promise.resolve();

      const handshakeCallsAfter = fetchMock.mock.calls.filter(([url]) => {
        const requestUrl = typeof url === 'string' ? url : url.toString();
        return requestUrl === '/api/writing-desk/jobs/active/research/start';
      }).length;

      expect(handshakeCallsAfter).toBe(handshakeCallsBefore);
      expect(eventSource.close).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
