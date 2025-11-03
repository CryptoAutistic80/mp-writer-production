import { fireEvent, render, screen } from '@testing-library/react';
import { WritingDeskFollowUpForm } from '../WritingDeskFollowUpForm';

describe('WritingDeskFollowUpForm', () => {
  const baseProps = {
    question: 'What happened next?',
    followUpIndex: 0,
    totalFollowUps: 2,
    value: '',
    notes: null as string | null,
    loading: false,
    error: null as string | null,
    serverError: null as string | null,
    showBack: false,
    isEditingFromSummary: false,
    onChange: jest.fn(),
    onTranscriptionComplete: jest.fn(),
    onBack: jest.fn(),
    onSubmit: jest.fn(),
  };

  it('renders follow-up question and textarea', () => {
    render(<WritingDeskFollowUpForm {...baseProps} />);

    expect(screen.getByText('What happened next?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Follow-up question 1 of 2/)).toBeInTheDocument();
  });

  it('invokes callbacks when user interacts', () => {
    render(<WritingDeskFollowUpForm {...baseProps} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Answer' } });
    expect(baseProps.onChange).toHaveBeenCalledWith('Answer');

    fireEvent.submit(screen.getByRole('button', { name: 'Next' }));
    expect(baseProps.onSubmit).toHaveBeenCalled();
  });

  it('shows notes when provided', () => {
    render(<WritingDeskFollowUpForm {...baseProps} notes="Helpful note" />);
    expect(screen.getByText('Helpful note')).toBeInTheDocument();
  });

  it('disables controls while loading', () => {
    render(<WritingDeskFollowUpForm {...baseProps} loading />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
