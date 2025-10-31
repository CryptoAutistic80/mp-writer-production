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
  const saveJobMock = jest.fn();
  const clearJobMock = jest.fn();
  const refetchMock = jest.fn(async () => null);
  const followUpQueue: FollowUpResponse[] = [];
  let fetchMock: jest.Mock<Promise<ResponseLike>, FetchArgs>;

  const setupFetchMock = () => {
    fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/auth/me') {
        return createJsonResponse({ credits: 1 });
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

  const renderComponent = () => {
    render(<WritingDeskClient />);
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
    setupFetchMock();
    refetchMock.mockClear();
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

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('persists summary state after submitting follow-up answers', async () => {
    followUpQueue.push({
      followUpQuestions: ['Question one?', 'Question two?'],
      notes: 'Helpful note',
      responseId: 'resp-1',
      remainingCredits: 0.8,
    });

    renderComponent();
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

    renderComponent();
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
});
