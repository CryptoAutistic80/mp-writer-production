import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeepResearchStream } from './useDeepResearchStream';
import { apiClient } from '../../../lib/api-client';

jest.mock('../../../lib/api-client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

describe('useDeepResearchStream', () => {
  const originalEventSource = global.EventSource;

  class MockEventSource {
    static instances: MockEventSource[];

    public onmessage: ((event: MessageEvent<string>) => void) | null;

    public onerror: ((event: Event) => void) | null;

    public close: jest.Mock<void, []>;

    constructor(public url: string) {
      this.onmessage = null;
      this.onerror = null;
      this.close = jest.fn();
      MockEventSource.instances.push(this);
    }
  }

  MockEventSource.instances = [];

  beforeAll(() => {
    (global as any).EventSource = MockEventSource as unknown as typeof EventSource;
    (window as any).EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterAll(() => {
    (global as any).EventSource = originalEventSource;
    (window as any).EventSource = originalEventSource;
  });

  beforeEach(() => {
    MockEventSource.instances = [];
    (apiClient.post as jest.Mock).mockResolvedValue({
      jobId: 'job-123',
      streamPath: '/api/ai/writing-desk/deep-research?jobId=job-123',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('auto-resumes the research stream when applying a running snapshot', async () => {
    const reportRefundedFailure = jest.fn().mockResolvedValue(null);

    const { result } = renderHook(() =>
      useDeepResearchStream({
        jobId: 'job-123',
        onJobIdChange: jest.fn(),
        onCreditsChange: jest.fn(),
        reportRefundedFailure,
        canAutoResume: true,
      }),
    );

    await act(async () => {
      result.current.applySnapshot({
        researchStatus: 'running',
        researchContent: 'Existing notes',
        researchResponseId: 'resp-123',
      });
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/writing-desk/jobs/active/research/start',
      expect.objectContaining({ resume: true, jobId: 'job-123' }),
    );
  });
});
