const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
// Requires a leading "+" or an internal separator so plain digit runs
// (IDs, timestamps, order numbers) are not mistaken for phone numbers.
const PHONE_PATTERN = /(?:\+\d[\d\s().-]{7,}\d|\(?\d{1,4}[)\s.-]+\d{3}[\d\s().-]{3,}\d)/g;
const BEARER_TOKEN_PATTERN = /\b(Bearer\s+)([A-Za-z0-9_-]{32,}={0,2})\b/gi;
const LABELED_TOKEN_PATTERN =
  /\b((?:access[_-]?token|authorization|api[_-]?key|password|secret|session(?:[_-]?(?:id|token))?|token)\s*[:=]\s*)([A-Za-z0-9_-]{32,}={0,2})\b/gi;

function passesLuhnCheck(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[bugpin:redacted-email]')
    .replace(JWT_PATTERN, '[bugpin:redacted-token]')
    .replace(UUID_PATTERN, '[bugpin:redacted-id]')
    .replace(CARD_PATTERN, (match) => (passesLuhnCheck(match) ? '[bugpin:redacted-card]' : match))
    .replace(PHONE_PATTERN, '[bugpin:redacted-phone]')
    .replace(BEARER_TOKEN_PATTERN, '$1[bugpin:redacted-token]')
    .replace(LABELED_TOKEN_PATTERN, '$1[bugpin:redacted-token]');
}

// Scheme and authority of an absolute URL, e.g. "http://192.168.0.10:3000".
const URL_ORIGIN_PATTERN = /^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i;

/**
 * Redact a captured URL field. The scheme and host are kept as they are: a host
 * is not personal data, and dotted-quad addresses such as 192.168.100.200 would
 * otherwise be taken for phone numbers and lose the report its page URL. The
 * path, query and fragment go through the same redaction as any other text.
 * A URL carrying user info (user@host) is redacted as a whole, as before.
 */
export function redactSensitiveUrl(value: string): string {
  const origin = URL_ORIGIN_PATTERN.exec(value)?.[0];
  if (!origin || origin.includes('@')) return redactSensitiveText(value);
  return origin + redactSensitiveText(value.slice(origin.length));
}

export function stripUrlQueryAndFragment(value: string): string {
  const queryIndex = value.indexOf('?');
  const fragmentIndex = value.indexOf('#');
  const candidates = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const boundary = candidates.length > 0 ? Math.min(...candidates) : value.length;
  return value.slice(0, boundary);
}
