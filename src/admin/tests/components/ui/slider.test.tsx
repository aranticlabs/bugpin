import { useState } from 'react';
import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider } from '../../../components/ui/slider';

function ZoomSlider() {
  const [zoom, setZoom] = useState(1);
  return (
    <>
      <span id="zoom-label">Zoom</span>
      <Slider
        aria-labelledby="zoom-label"
        min={1}
        max={3}
        step={0.5}
        value={[zoom]}
        onValueChange={([next]) => setZoom(next)}
      />
      <output>{zoom}</output>
    </>
  );
}

it('names the thumb from its label and changes the value with the keyboard', async () => {
  const user = userEvent.setup();
  render(<ZoomSlider />);

  const slider = screen.getByRole('slider', { name: 'Zoom' });
  expect(slider).toHaveAttribute('aria-valuenow', '1');

  slider.focus();
  await user.keyboard('{ArrowRight}');

  expect(slider).toHaveAttribute('aria-valuenow', '1.5');
  expect(screen.getByRole('status')).toHaveTextContent('1.5');
});
