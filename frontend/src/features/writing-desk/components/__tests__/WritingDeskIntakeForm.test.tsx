import { fireEvent, render, screen } from '@testing-library/react';
import { WritingDeskIntakeForm } from '../WritingDeskIntakeForm';

describe('WritingDeskIntakeForm', () => {
  const baseProps = {
    step: {
      key: 'issueDescription' as const,
      title: 'Tell us everything',
      description: 'Share the details',
      placeholder: 'Type here',
    },
    value: '',
    loading: false,
    error: null as string | null,
    serverError: null as string | null,
    stepIndex: 0,
    isFirstStep: true,
    isLastStep: false,
    hasFollowUps: false,
    creditState: 'ok' as const,
    availableCredits: 1,
    followUpCreditCost: 0.1,
    formatCredits: (value: number) => value.toFixed(1),
    onChange: jest.fn(),
    onTranscriptionComplete: jest.fn(),
    onBack: jest.fn(),
    onSubmit: jest.fn(),
  };

  it('renders title, description, and textarea', () => {
    render(<WritingDeskIntakeForm {...baseProps} />);

    expect(screen.getByLabelText('Tell us everything')).toBeInTheDocument();
    expect(screen.getByText('Share the details')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('calls onChange when text changes', () => {
    render(<WritingDeskIntakeForm {...baseProps} />);

    fireEvent.change(screen.getByPlaceholderText('Type here'), { target: { value: 'New text' } });
    expect(baseProps.onChange).toHaveBeenCalledWith('New text');
  });

  it('disables controls while loading', () => {
    render(<WritingDeskIntakeForm {...baseProps} loading />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeDisabled();
  });

  it('shows credit warning when credits are insufficient', () => {
    render(
      <WritingDeskIntakeForm
        {...baseProps}
        isFirstStep={false}
        isLastStep
        hasFollowUps={false}
        creditState="low"
        availableCredits={0.05}
      />,
    );

    expect(
      screen.getByText('Generating follow-up questions costs 0.1 credits. Please top up to continue.'),
    ).toBeInTheDocument();
  });
});
