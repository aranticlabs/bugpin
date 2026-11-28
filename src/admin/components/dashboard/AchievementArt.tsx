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
  stag_beetle: {
    palette: { from: '#ffe4e6', to: '#f43f5e', rim: '#9f1239' },
    scene: ({ id }) => (
      <>
        <defs>
          <radialGradient id={`${id}-carapace`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="60%" stopColor="#451a03" />
            <stop offset="100%" stopColor="#1c0a00" />
          </radialGradient>
        </defs>
        <ellipse cx="32" cy="52" rx="12" ry="2.4" fill="#881337" opacity={0.25} />
        <g
          stroke="#270e04"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M24 30 L17 25 L14.5 28.5" />
          <path d="M40 30 L47 25 L49.5 28.5" />
          <path d="M23 36.5 L15.5 36.5 L14 41.5" />
          <path d="M41 36.5 L48.5 36.5 L50 41.5" />
          <path d="M24.5 43.5 L18 47.5 L17 51" />
          <path d="M39.5 43.5 L46 47.5 L47 51" />
        </g>
        <g
          fill="none"
          stroke="#451a03"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M28.5 23 C22.5 18.5 22 12.5 27.5 11" />
          <path d="M35.5 23 C41.5 18.5 42 12.5 36.5 11" />
        </g>
        <g fill="none" stroke="#78350f" strokeWidth={1.1} strokeLinecap="round">
          <path d="M24.2 16.5 L27.2 16" />
          <path d="M39.8 16.5 L36.8 16" />
          <path d="M25.5 13.5 L28 14" />
          <path d="M38.5 13.5 L36 14" />
        </g>
        <ellipse
          cx="32"
          cy="25"
          rx="5.4"
          ry="3.6"
          fill="#270e04"
          stroke="#1c0a00"
          strokeWidth={0.9}
        />
        <circle cx="27.2" cy="24.2" r="1.2" fill="#f59e0b" />
        <circle cx="36.8" cy="24.2" r="1.2" fill="#f59e0b" />
        <ellipse
          cx="32"
          cy="30.5"
          rx="8.2"
          ry="4.5"
          fill={`url(#${id}-carapace)`}
          stroke="#1c0a00"
          strokeWidth={1.1}
        />
        <ellipse
          cx="32"
          cy="41.5"
          rx="9.5"
          ry="10.2"
          fill={`url(#${id}-carapace)`}
          stroke="#1c0a00"
          strokeWidth={1.1}
        />
        <line x1="32" y1="31.5" x2="32" y2="51.5" stroke="#1c0a00" strokeWidth={1.2} />
        <ellipse
          cx="27.2"
          cy="38.5"
          rx="2"
          ry="4.5"
          fill="#fde68a"
          opacity={0.32}
          transform="rotate(-14 27.2 38.5)"
        />
        <ellipse cx="28" cy="29.5" rx="2.4" ry="1.1" fill="#fde68a" opacity={0.28} />
      </>
    ),
  },
  honeybee: {
    palette: { from: '#fef3c7', to: '#f59e0b', rim: '#b45309' },
    scene: ({ id }) => (
      <>
        <defs>
          <radialGradient id={`${id}-bee`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#eab308" />
          </radialGradient>
        </defs>
        <g stroke="#b45309" strokeOpacity={0.22} fill="none" strokeWidth={0.9}>
          {[
            [20, 17],
            [44, 17],
            [15, 29],
            [49, 29],
            [20, 44],
            [44, 44],
          ].map(([cx, cy]) => (
            <polygon
              key={`${cx}-${cy}`}
              points={`${cx},${cy - 5} ${cx + 4.3},${cy - 2.5} ${cx + 4.3},${cy + 2.5} ${cx},${cy + 5} ${cx - 4.3},${cy + 2.5} ${cx - 4.3},${cy - 2.5}`}
            />
          ))}
        </g>
        <g fill="#fff" fillOpacity={0.78} stroke="#92400e" strokeWidth={0.9}>
          <ellipse cx="21" cy="26.5" rx="9" ry="4.4" transform="rotate(-22 21 26.5)" />
          <ellipse cx="43" cy="26.5" rx="9" ry="4.4" transform="rotate(22 43 26.5)" />
          <ellipse cx="23.5" cy="33" rx="6.5" ry="3.2" transform="rotate(14 23.5 33)" />
          <ellipse cx="40.5" cy="33" rx="6.5" ry="3.2" transform="rotate(-14 40.5 33)" />
        </g>
        <path d="M32 49 L32 52.5" stroke="#1c1917" strokeWidth={1.6} strokeLinecap="round" />
        <ellipse
          cx="32"
          cy="39"
          rx="8.2"
          ry="10.2"
          fill={`url(#${id}-bee)`}
          stroke="#78350f"
          strokeWidth={1.1}
        />
        <path d="M24.2 35.5 Q32 38.5 39.8 35.5" fill="none" stroke="#1c1917" strokeWidth={2.6} />
        <path d="M24.4 41 Q32 44 39.6 41" fill="none" stroke="#1c1917" strokeWidth={2.6} />
        <path d="M26.5 46 Q32 48.2 37.5 46" fill="none" stroke="#1c1917" strokeWidth={2.2} />
        <ellipse
          cx="28.2"
          cy="33"
          rx="1.6"
          ry="3"
          fill="#fff"
          opacity={0.45}
          transform="rotate(-15 28.2 33)"
        />
        <ellipse
          cx="32"
          cy="27.5"
          rx="6.2"
          ry="5"
          fill="#292524"
          stroke="#1c1917"
          strokeWidth={0.9}
        />
        <circle cx="32" cy="19.5" r="4.4" fill="#1c1917" />
        <circle cx="30.2" cy="18.8" r="1.1" fill="#fff" />
        <circle cx="33.8" cy="18.8" r="1.1" fill="#fff" />
        <path
          d="M30 16 Q26.5 11.5 23.5 12.5"
          fill="none"
          stroke="#1c1917"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <path
          d="M34 16 Q37.5 11.5 40.5 12.5"
          fill="none"
          stroke="#1c1917"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <circle cx="23.5" cy="12.5" r="1.1" fill="#1c1917" />
        <circle cx="40.5" cy="12.5" r="1.1" fill="#1c1917" />
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
  cricket: {
    palette: { from: '#ffedd5', to: '#fb923c', rim: '#9a3412' },
    scene: ({ id }) => (
      <>
        <defs>
          <linearGradient id={`${id}-cricket`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#65a30d" />
            <stop offset="100%" stopColor="#365314" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="#fff" strokeLinecap="round" opacity={0.85}>
          <path d="M38 19 A5 5 0 0 1 43 24" strokeWidth={1.3} />
          <path d="M40.5 15.5 A8.5 8.5 0 0 1 47.5 23" strokeWidth={1.2} opacity={0.7} />
          <path d="M43 12.5 A12 12 0 0 1 51.5 22" strokeWidth={1.1} opacity={0.5} />
        </g>
        <path
          d="M14 48 Q32 43.5 50 48"
          fill="none"
          stroke="#9a3412"
          strokeWidth={1.8}
          opacity={0.4}
          strokeLinecap="round"
        />
        <g
          stroke="#1a2e05"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M24 38 L20 45.5 L17.5 46" />
          <path d="M30 39 L28 45.5 L25.5 46" />
        </g>
        <path
          d="M18.5 31 Q15 19.5 28 14.5"
          fill="none"
          stroke="#1a2e05"
          strokeWidth={1}
          strokeLinecap="round"
        />
        <path
          d="M19.5 30 Q18.5 22.5 31 19"
          fill="none"
          stroke="#1a2e05"
          strokeWidth={0.9}
          strokeLinecap="round"
        />
        <ellipse
          cx="32.5"
          cy="37"
          rx="10.5"
          ry="4.8"
          fill={`url(#${id}-cricket)`}
          stroke="#1a2e05"
          strokeWidth={1.1}
          transform="rotate(-8 32.5 37)"
        />
        <path
          d="M42.5 36.5 L47.5 35.5 M42 38.5 L47 39"
          stroke="#1a2e05"
          strokeWidth={1}
          strokeLinecap="round"
        />
        <ellipse
          cx="29.5"
          cy="35"
          rx="4.5"
          ry="1.6"
          fill="#bef264"
          opacity={0.45}
          transform="rotate(-10 29.5 35)"
        />
        <circle cx="21.5" cy="34.5" r="4.3" fill="#4d7c0f" stroke="#1a2e05" strokeWidth={1.1} />
        <circle cx="20" cy="33.5" r="1.4" fill="#1a2e05" />
        <circle cx="19.6" cy="33" r="0.5" fill="#fff" />
        <path
          d="M32 37.5 L40 26.5 L47.5 45.5 L50 45.5"
          fill="none"
          stroke="#1a2e05"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse
          cx="36.2"
          cy="32"
          rx="6.2"
          ry="2.5"
          fill="#65a30d"
          stroke="#1a2e05"
          strokeWidth={1.1}
          transform="rotate(-54 36.2 32)"
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
