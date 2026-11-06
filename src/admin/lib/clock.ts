const TWELVE_HOUR_TIME_ZONE_PREFIXES = [
  'US/',
  'Canada/',
  'America/Indiana/',
  'America/Kentucky/',
  'America/North_Dakota/',
];

const TWELVE_HOUR_TIME_ZONES = new Set([
  // United States
  'America/New_York',
  'America/Detroit',
  'America/Chicago',
  'America/Menominee',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'America/Puerto_Rico',
  'Pacific/Honolulu',
  'Pacific/Guam',
  // Canada
  'America/St_Johns',
  'America/Halifax',
  'America/Glace_Bay',
  'America/Moncton',
  'America/Goose_Bay',
  'America/Toronto',
  'America/Montreal',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Iqaluit',
  'America/Pangnirtung',
  'America/Atikokan',
  'America/Blanc-Sablon',
  'America/Winnipeg',
  'America/Rainy_River',
  'America/Rankin_Inlet',
  'America/Resolute',
  'America/Regina',
  'America/Swift_Current',
  'America/Edmonton',
  'America/Cambridge_Bay',
  'America/Yellowknife',
  'America/Inuvik',
  'America/Creston',
  'America/Dawson_Creek',
  'America/Fort_Nelson',
  'America/Whitehorse',
  'America/Dawson',
  'America/Vancouver',
]);

function isUsOrCanadaTimeZone(timeZone: string | undefined): boolean {
  if (!timeZone) return false;
  return (
    TWELVE_HOUR_TIME_ZONES.has(timeZone) ||
    TWELVE_HOUR_TIME_ZONE_PREFIXES.some((prefix) => timeZone.startsWith(prefix))
  );
}

interface ClockContext {
  timeZone?: string;
  /** Primary browser language, e.g. "fr-CA". */
  language?: string;
}

function currentClockContext(): ClockContext {
  try {
    return {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: typeof navigator !== 'undefined' ? navigator.language : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * 12 h clock for US and Canadian time zones, except French-language browsers (Quebec uses 24 h).
 * Derived from the time zone rather than the browser language, because many people elsewhere
 * run their browser in US English while following the clock convention of where they are.
 */
export function usesTwelveHourClock(context: ClockContext = currentClockContext()): boolean {
  if (!isUsOrCanadaTimeZone(context.timeZone)) return false;
  return !(context.language ?? '').toLowerCase().startsWith('fr');
}

/** Hours and minutes in the user's clock style, e.g. "11:14 PM" or "23:14". */
export function formatClockTime(date: Date, twelveHour: boolean = usesTwelveHourClock()): string {
  return twelveHour
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}
