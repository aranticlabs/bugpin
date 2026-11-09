import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TotpQrCode } from '../../components/profile/TotpQrCode';

describe('TotpQrCode', () => {
  it('draws the otpauth URI as an SVG QR code', () => {
    render(<TotpQrCode uri="otpauth://totp/BugPin:admin%40example.com?secret=JBSWY3DPEHPK3PXP" />);

    const qr = screen.getByRole('img', { name: /qr code/i });
    const [, , width, height] = (qr.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(width).toBeGreaterThanOrEqual(25);
    expect(width).toBe(height);
    expect(qr.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});
