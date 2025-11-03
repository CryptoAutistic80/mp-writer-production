import { fireEvent, render, screen } from '@testing-library/react';
import { WritingDeskLetterPanel } from '../WritingDeskLetterPanel';
import { WritingDeskLetterPhase } from '../../utils/shared';

const baseProps = {
  phase: 'tone' as WritingDeskLetterPhase,
  status: 'idle' as const,
  statusMessage: null,
  reasoningVisible: true,
  events: [],
  letterHtml: '<p>Preview</p>',
  onToneSelect: jest.fn(),
  onBackToSummary: jest.fn(),
  onSaveLetter: jest.fn(),
  isSaving: false,
  responseId: null,
  metadata: null,
  savedResponseId: null,
  onRecompose: jest.fn(),
  onExit: jest.fn(),
  letterCreditState: 'ok' as const,
  letterError: null,
  onTryAgain: jest.fn(),
  toastMessage: null,
  selectedTone: null,
};

describe('WritingDeskLetterPanel', () => {
  it('renders tone selection when phase is tone', () => {
    render(<WritingDeskLetterPanel {...baseProps} />);
    expect(screen.getByText('Choose a tone for your letter')).toBeInTheDocument();
  });

  it('renders streaming information during drafting', () => {
    render(
      <WritingDeskLetterPanel
        {...baseProps}
        phase="streaming"
        status="generating"
        statusMessage="Composing your letter…"
        events={[{ id: '1', text: 'Reasoning' }]}
      />,
    );
    expect(screen.getByText('Composing your letter…')).toBeInTheDocument();
    expect(screen.getByText('Reasoning')).toBeInTheDocument();
  });

  it('renders completed letter with actions', () => {
    render(
      <WritingDeskLetterPanel
        {...baseProps}
        phase="completed"
        metadata={{
          mpName: '',
          date: '2024-01-01',
          letterContent: '<p>Preview</p>',
          senderName: '',
          references: [],
          responseId: 'resp',
          tone: 'formal',
          rawJson: '{}',
        } as any}
        letterHtml="<p>Preview</p>"
        responseId="resp"
        selectedTone="formal"
      />,
    );
    expect(screen.getByText('Your drafted letter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to my letters' })).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(
      <WritingDeskLetterPanel
        {...baseProps}
        phase="error"
        letterError="Something went wrong"
      />,
    );
    expect(screen.getByText(/couldn't finish/)).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
