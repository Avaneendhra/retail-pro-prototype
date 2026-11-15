import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext';

function Trigger({ toasts }) {
  const { showToast } = useToast();
  return <button onClick={() => toasts.forEach(([message, type]) => showToast(message, type))}>go</button>;
}

const raise = (toasts) => {
  render(<ToastProvider><Trigger toasts={toasts} /></ToastProvider>);
  act(() => screen.getByText('go').click());
};

describe('ToastProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message and removes it after 3 seconds', () => {
    raise([['Saved']]);
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3000));

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('error toasts have role alert', () => {
    raise([['Could not save', 'error']]);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('success toasts have role status', () => {
    raise([['Saved']]);

    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('two toasts raised in the same instant are both shown', () => {
    raise([['First'], ['Second']]);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
