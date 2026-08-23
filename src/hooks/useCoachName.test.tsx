import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoachNameProvider, useCoachName } from './useCoachName';

function CoachHarness() {
  const { coachName, showPrompt, saveCoachName, clearCoachName } = useCoachName();
  return (
    <div>
      <output aria-label="coach name">{coachName}</output>
      <output aria-label="prompt state">{String(showPrompt)}</output>
      <button type="button" onClick={() => saveCoachName('  Coach Meera  ')}>Save</button>
      <button type="button" onClick={clearCoachName}>Clear</button>
    </div>
  );
}

describe('CoachNameProvider', () => {
  it('trims, persists, and clears the coach identity reactively', () => {
    render(<CoachNameProvider><CoachHarness /></CoachNameProvider>);

    expect(screen.getByLabelText('prompt state')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('coach name')).toHaveTextContent('Coach Meera');
    expect(screen.getByLabelText('prompt state')).toHaveTextContent('false');
    expect(localStorage.getItem('chess_coach_name')).toBe('Coach Meera');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('coach name')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('prompt state')).toHaveTextContent('true');
    expect(localStorage.getItem('chess_coach_name')).toBeNull();
  });
});
