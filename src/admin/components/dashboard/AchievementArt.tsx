import { useId, type ReactNode } from 'react';
import type { AchievementId } from '@shared/types';

interface Palette {
  from: string;
  to: string;
  rim: string;
}

interface SceneContext {
  /** Prefix for gradient ids, unique per rendered badge */
  id: string;
}

/** Color for fine light strokes that sit on the background, like the spider web */
const LINE_COLOR = '#f8fafc';

interface BadgeDefinition {
  palette: Palette;
  scene: (context: SceneContext) => ReactNode;
}

const BADGES: Record<AchievementId, BadgeDefinition> = {
  hatchling: {
    palette: { from: '#bbf7d0', to: '#34d399', rim: '#047857' },
    scene: () => (
      <>
        <ellipse cx="32" cy="52" rx="14" ry="3" fill="#065f46" opacity={0.2} />
        <circle cx="32" cy="29" r="6.5" fill="#86efac" stroke="#15803d" strokeWidth={1.2} />
        <circle cx="29.6" cy="28.2" r="1.1" fill="#14532d" />
        <circle cx="34.4" cy="28.2" r="1.1" fill="#14532d" />
        <path d="M30 31.4 Q32 32.8 34 31.4" fill="none" stroke="#14532d" strokeWidth={0.9} />
        <path
          d="M20.5 32 L24.5 29 L27.5 33 L32 28.5 L36.5 33 L39.5 29 L43.5 32 C43.5 44 38.5 51 32 51 C25.5 51 20.5 44 20.5 32 Z"
          fill="#fffbeb"
          stroke="#c8b48c"
          strokeWidth={1.2}
        />
        <path
          d="M37 16.5 C39.5 12.5 46 12.5 48 16.5 L46.5 18.5 L44.5 16.5 L42.5 19.5 L40.5 17.5 L38.5 19 Z"
          fill="#fffbeb"
          stroke="#c8b48c"
          strokeWidth={1}
        />
        <ellipse cx="26" cy="40" rx="2" ry="4" fill="#fff" opacity={0.7} />
      </>
    ),
  },
  cocoon: {
    palette: { from: '#ecfccb', to: '#84cc16', rim: '#3f6212' },
    scene: ({ id }) => (
      <>
        <defs>
          <linearGradient id={`${id}-cocoon`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#d4a35a" />
          </linearGradient>
        </defs>
        <path d="M12 17 Q32 12 54 15" fill="none" stroke="#78350f" strokeWidth={3} />
        <path d="M44 14.5 Q49 9 53 11 Q49 15 44 14.5 Z" fill="#4d7c0f" />
        <line x1="32" y1="14" x2="32" y2="20" stroke="#78350f" strokeWidth={1.2} />
        <ellipse
          cx="32"
          cy="34"
          rx="8.5"
          ry="14.5"
          fill={`url(#${id}-cocoon)`}
          stroke="#a16207"
          strokeWidth={1.2}
        />
        {[25, 30, 35, 40].map((y) => (
          <path
            key={y}
            d={`M24.5 ${y} Q32 ${y + 3.5} 39.5 ${y}`}
            fill="none"
            stroke="#a16207"
            strokeWidth={0.9}
            opacity={0.7}
          />
        ))}
        <ellipse cx="28.5" cy="30" rx="1.6" ry="5" fill="#fff" opacity={0.55} />
      </>
    ),
  },
  butterfly: {
    palette: { from: '#ede9fe', to: '#8b5cf6', rim: '#5b21b6' },
    scene: ({ id }) => (
      <>
        <defs>
          <linearGradient id={`${id}-wing`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdba74" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        <g stroke="#1f2937" strokeWidth={1.4} strokeLinejoin="round">
          <path d="M31 31 C24 18 12 16 13 26 C14 34 23 35.5 31 34 Z" fill={`url(#${id}-wing)`} />
          <path d="M33 31 C40 18 52 16 51 26 C50 34 41 35.5 33 34 Z" fill={`url(#${id}-wing)`} />
          <path d="M31 35 C24 37 17 42 21 47.5 C25 52 30 45 31 39 Z" fill="#fb923c" />
          <path d="M33 35 C40 37 47 42 43 47.5 C39 52 34 45 33 39 Z" fill="#fb923c" />
        </g>
        <g stroke="#1f2937" strokeWidth={0.8} fill="none" opacity={0.8}>
          <path d="M30 32 Q22 26 16 25" />
          <path d="M34 32 Q42 26 48 25" />
        </g>
        {[
          [16, 28],
          [18.5, 31],
          [48, 28],
          [45.5, 31],
          [23, 46],
          [41, 46],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} fill="#fff" />
        ))}
        <ellipse cx="32" cy="34" rx="1.9" ry="10" fill="#1f2937" />
        <path d="M31.2 25 Q28 19 25.5 18" fill="none" stroke="#1f2937" strokeWidth={1} />
        <path d="M32.8 25 Q36 19 38.5 18" fill="none" stroke="#1f2937" strokeWidth={1} />
        <circle cx="25.5" cy="18" r="1.1" fill="#1f2937" />
        <circle cx="38.5" cy="18" r="1.1" fill="#1f2937" />
      </>
    ),
  },
  firefly: {
    palette: { from: '#312e81', to: '#0f172a', rim: '#4338ca' },
    scene: ({ id }) => (
      <>
        <defs>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0%" stopColor="#fef08a" stopOpacity={0.95} />
            <stop offset="45%" stopColor="#facc15" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
          </radialGradient>
        </defs>
        {[
          [18, 22, 0.8],
          [46, 19, 0.6],
          [48, 38, 0.7],
          [17, 42, 0.5],
          [25, 15, 0.5],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#fff" opacity={0.8} />
        ))}
        <circle cx="37" cy="40" r="14" fill={`url(#${id}-glow)`} />
        <ellipse
          cx="27"
          cy="27"
          rx="8"
          ry="3"
          fill="#e0e7ff"
          fillOpacity={0.55}
          stroke="#64748b"
          strokeWidth={0.5}
          transform="rotate(-35 27 27)"
        />
        <ellipse
          cx="33"
          cy="25"
          rx="8"
          ry="3"
          fill="#e0e7ff"
          fillOpacity={0.55}
          stroke="#64748b"
          strokeWidth={0.5}
          transform="rotate(-70 33 25)"
        />
        <ellipse
          cx="36.5"
          cy="38.5"
          rx="5.5"
          ry="4.5"
          fill="#fde047"
          transform="rotate(40 36.5 38.5)"
        />
        <ellipse
          cx="30.5"
          cy="32"
          rx="4.2"
          ry="3.6"
          fill="#b91c1c"
          transform="rotate(40 30.5 32)"
        />
        <circle cx="26.5" cy="28" r="2.8" fill="#111827" />
        <path d="M25 26 Q21 21 18 21" fill="none" stroke="#94a3b8" strokeWidth={0.9} />
        <path d="M26.5 25.5 Q25 20 22.5 18" fill="none" stroke="#94a3b8" strokeWidth={0.9} />
      </>
    ),
  },
  dragonfly: {
    palette: { from: '#e0f2fe', to: '#38bdf8', rim: '#0369a1' },
    scene: () => (
      <>
        <g fill="#fff" fillOpacity={0.65} stroke="#0e7490" strokeWidth={0.8}>
          <ellipse cx="21.5" cy="23" rx="10.5" ry="3.6" transform="rotate(-8 21.5 23)" />
          <ellipse cx="42.5" cy="23" rx="10.5" ry="3.6" transform="rotate(8 42.5 23)" />
          <ellipse cx="22.5" cy="29.5" rx="9.5" ry="3.2" transform="rotate(10 22.5 29.5)" />
          <ellipse cx="41.5" cy="29.5" rx="9.5" ry="3.2" transform="rotate(-10 41.5 29.5)" />
        </g>
        <rect x="30.8" y="27" width="2.4" height="23" rx="1.2" fill="#0891b2" />
        {[31, 35, 39, 43, 47].map((y) => (
          <line key={y} x1="30.8" x2="33.2" y1={y} y2={y} stroke="#164e63" strokeWidth={0.7} />
        ))}
        <ellipse cx="32" cy="24.5" rx="3.2" ry="4.2" fill="#0e7490" />
        <circle cx="32" cy="18.5" r="3" fill="#155e75" />
        <circle cx="30.3" cy="17.8" r="1.9" fill="#22d3ee" />
        <circle cx="33.7" cy="17.8" r="1.9" fill="#22d3ee" />
        <circle cx="29.9" cy="17.3" r="0.6" fill="#fff" />
        <circle cx="33.3" cy="17.3" r="0.6" fill="#fff" />
      </>
    ),
  },
  ladybug: {
    palette: { from: '#fef9c3', to: '#facc15', rim: '#a16207' },
    scene: ({ id }) => (
      <>
        <defs>
          <radialGradient id={`${id}-shell`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#b91c1c" />
          </radialGradient>
        </defs>
        <path d="M14 50 Q30 34 52 44 Q34 56 14 50 Z" fill="#22c55e" />
        <path d="M16 49.5 Q32 44 50 44.5" fill="none" stroke="#15803d" strokeWidth={0.9} />
        <circle cx="32" cy="23.5" r="6" fill="#111827" />
        <circle cx="29.6" cy="21.8" r="1.1" fill="#fff" />
        <circle cx="34.4" cy="21.8" r="1.1" fill="#fff" />
        <circle
          cx="32"
          cy="35"
          r="12"
          fill={`url(#${id}-shell)`}
          stroke="#7f1d1d"
          strokeWidth={1}
        />
        <line x1="32" y1="23.2" x2="32" y2="47" stroke="#111827" strokeWidth={1.4} />
        {[
          [26, 30, 2.3],
          [38, 30, 2.3],
          [25, 38.5, 2.1],
          [39, 38.5, 2.1],
          [28.5, 44, 1.6],
          [35.5, 44, 1.6],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#111827" />
        ))}
        <ellipse
          cx="27"
          cy="27.5"
          rx="3"
          ry="1.8"
          fill="#fff"
          opacity={0.4}
          transform="rotate(-30 27 27.5)"
        />
      </>
    ),
  },
  web_weaver: {
    palette: { from: '#64748b', to: '#1e293b', rim: '#475569' },
    scene: () => {
      const spokes = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);
      const ring = (radius: number) =>
        spokes
          .map((angle) => `${32 + Math.cos(angle) * radius},${30 + Math.sin(angle) * radius}`)
          .join(' ');
      return (
        <>
          <g stroke={LINE_COLOR} strokeOpacity={0.85} fill="none" strokeWidth={0.8}>
            {spokes.map((angle) => (
              <line
                key={angle}
                x1="32"
                y1="30"
                x2={32 + Math.cos(angle) * 20}
                y2={30 + Math.sin(angle) * 20}
              />
            ))}
            {[4.5, 8.5, 12.5, 16.5].map((radius) => (
              <polygon key={radius} points={ring(radius)} />
            ))}
          </g>
          <line x1="40" y1="30" x2="40" y2="40" stroke={LINE_COLOR} strokeWidth={0.7} />
          <g stroke="#111827" strokeWidth={0.9} strokeLinecap="round">
            {[-1, 1].map((side) =>
              [-2, 0, 2].map((offset) => (
                <path
                  key={`${side}-${offset}`}
                  d={`M40 ${43 + offset * 0.6} q ${side * 3} ${-2 + offset} ${side * 5} ${offset * 1.2 + 1}`}
                  fill="none"
                />
              ))
            )}
          </g>
          <circle cx="40" cy="44" r="3" fill="#a855f7" stroke="#111827" strokeWidth={0.8} />
          <circle cx="40" cy="40.5" r="1.8" fill="#111827" />
          <circle cx="39.2" cy="43" r="0.7" fill="#fff" opacity={0.7} />
        </>
      );
    },
  },
  amber: {
    palette: { from: '#ffedd5', to: '#fb923c', rim: '#9a3412' },
    scene: ({ id }) => (
      <>
        <defs>
          <radialGradient id={`${id}-amber`} cx="0.4" cy="0.45" r="0.7">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
        </defs>
        <path
          d="M32 13 C38.5 23 46.5 29.5 46.5 38.5 C46.5 46.5 40.5 52 32 52 C23.5 52 17.5 46.5 17.5 38.5 C17.5 29.5 25.5 23 32 13 Z"
          fill={`url(#${id}-amber)`}
          stroke="#92400e"
          strokeWidth={1.2}
        />
        <g opacity={0.75} stroke="#78350f" strokeWidth={0.9} strokeLinecap="round">
          <path d="M28.5 37 L25 35 M28.5 40.5 L24.5 41 M28.5 44 L25.5 46.5" />
          <path d="M35.5 37 L39 35 M35.5 40.5 L39.5 41 M35.5 44 L38.5 46.5" />
          <path d="M31 33 L29 29.5 M33 33 L35 29.5" />
        </g>
        <ellipse cx="32" cy="41" rx="4" ry="5.5" fill="#78350f" opacity={0.8} />
        <circle cx="32" cy="34.2" r="2.2" fill="#78350f" opacity={0.8} />
        <ellipse
          cx="25.5"
          cy="34"
          rx="2.2"
          ry="5"
          fill="#fff"
          opacity={0.5}
          transform="rotate(-20 25.5 34)"
        />
      </>
    ),
  },
};

const HEX = 'M32 3 L57 17.5 L57 46.5 L32 61 L7 46.5 L7 17.5 Z';
const INNER_HEX = 'M32 8 L52.5 19.8 L52.5 44.2 L32 56 L11.5 44.2 L11.5 19.8 Z';

/** Hexagonal medallion with a soft gradient, a rim and a glossy top edge */
function HexFrame({ badge, id }: { badge: BadgeDefinition; id: string }) {
  const { palette } = badge;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={INNER_HEX} />
        </clipPath>
      </defs>
      <path d={HEX} fill={palette.rim} />
      <path d={INNER_HEX} fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {badge.scene({ id })}
        <path d="M11 20 L32 8 L53 20 L53 26 Q32 18 11 26 Z" fill="#fff" opacity={0.18} />
      </g>
      <path d={INNER_HEX} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} />
    </>
  );
}

/** Illustrated hexagonal medallion for an achievement */
export function AchievementArt({
  achievement,
  label,
  className,
}: {
  achievement: AchievementId;
  /** Accessible name; omit when nearby text already names the achievement. */
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const definition = BADGES[achievement];
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <HexFrame badge={definition} id={id} />
    </svg>
  );
}
