import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './ToastContext';

function ToastHarness() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success('Student saved')}>Success</button>
      <button type="button" onClick={() => toast.error('Save failed')}>Error</button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('announces success and error messages with the correct live priority', () => {
    render(<ToastProvider><ToastHarness /></ToastProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Success' }));
    expect(screen.getByText('Student saved').closest('output')).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('Save failed').closest('output')).toHaveAttribute('aria-live', 'assertive');
  });
});
