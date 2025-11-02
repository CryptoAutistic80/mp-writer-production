import { OpenAiClientService } from './openai-client.service';

const openAiConstructor = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: openAiConstructor,
}));

describe('OpenAiClientService', () => {
  let service: OpenAiClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    openAiConstructor.mockReset();
    service = new OpenAiClientService();
  });

  it('reuses an existing client while under error and age thresholds', async () => {
    const clientInstance = { id: 'client-1' };
    openAiConstructor.mockImplementation(() => clientInstance);

    const client1 = await service.getClient('test-key');
    const client2 = await service.getClient('test-key');

    expect(client1).toBe(clientInstance);
    expect(client2).toBe(clientInstance);
    expect(openAiConstructor).toHaveBeenCalledTimes(1);

    service.markError('test-context', new Error('transient failure'));

    const client3 = await service.getClient('test-key');
    expect(client3).toBe(clientInstance);
    expect(openAiConstructor).toHaveBeenCalledTimes(1);
  });

  it('recreates the client after reaching the error threshold', async () => {
    const firstClient = { id: 'client-1' };
    const secondClient = { id: 'client-2' };
    openAiConstructor
      .mockImplementationOnce(() => firstClient)
      .mockImplementationOnce(() => secondClient);

    const client1 = await service.getClient('test-key');
    expect(client1).toBe(firstClient);

    for (let i = 0; i < 5; i += 1) {
      service.markError('test-context', new Error('failure'));
    }

    const client2 = await service.getClient('test-key');
    expect(client2).toBe(secondClient);
    expect(openAiConstructor).toHaveBeenCalledTimes(2);
  });

  it('resets the error counter after a successful operation', async () => {
    const firstClient = { id: 'client-1' };
    const secondClient = { id: 'client-2' };
    openAiConstructor
      .mockImplementationOnce(() => firstClient)
      .mockImplementationOnce(() => secondClient);

    await service.getClient('test-key');
    service.markError('test-context', new Error('temporary issue'));
    service.recordSuccess();

    const client = await service.getClient('test-key');
    expect(client).toBe(firstClient);
    expect(openAiConstructor).toHaveBeenCalledTimes(1);
  });
});

