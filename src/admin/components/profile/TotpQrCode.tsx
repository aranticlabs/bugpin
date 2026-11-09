import { useMemo } from 'react';
import { encode } from 'uqr';

/**
 * The otpauth URI as a QR code. It is drawn as one SVG path from the module matrix and
 * always black on white, because authenticator apps scan dark-on-light codes best.
 */
export function TotpQrCode({ uri }: { uri: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(uri, { ecc: 'M', border: 2 });
    const segments: string[] = [];
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) segments.push(`M${x} ${y}h1v1h-1z`);
      });
    });
    return { size: qr.size, path: segments.join('') };
  }, [uri]);

  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-48 w-48 rounded-md border bg-white"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
