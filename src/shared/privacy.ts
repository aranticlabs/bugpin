const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
// Requires a leading "+" or an internal separator so plain digit runs
// (IDs, timestamps, order numbers) are not mistaken for phone numbers.
const PHONE_PATTERN = /(?:\+\d[\d\s().-]{7,}\d|\(?\d{1,4}[)\s.-]+\d{3}[\d\s().-]{3,}\d)/g;
// Dotted quads such as 192.168.0.10 look like separator-delimited phone numbers.
// They are hosts, not personal data: a report loses its page URL without them.
const IPV4_PATTERN = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
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

function findIpv4Ranges(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of value.matchAll(IPV4_PATTERN)) {
    const isAddress = match[0].split('.').every((octet) => Number(octet) <= 255);
    if (isAddress) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function redactPhoneNumbers(value: string): string {
  // Redact each stretch between addresses on its own, so a phone number written
  // right after an address cannot hide inside one long match that spans both.
  let result = '';
  let cursor = 0;
  for (const [start, stop] of findIpv4Ranges(value)) {
    result += value.slice(cursor, start).replace(PHONE_PATTERN, '[bugpin:redacted-phone]');
    result += value.slice(start, stop);
    cursor = stop;
  }
  return result + value.slice(cursor).replace(PHONE_PATTERN, '[bugpin:redacted-phone]');
}

export function redactSensitiveText(value: string): string {
  const withoutPhones = redactPhoneNumbers(
    value
      .replace(EMAIL_PATTERN, '[bugpin:redacted-email]')
      .replace(JWT_PATTERN, '[bugpin:redacted-token]')
      .replace(UUID_PATTERN, '[bugpin:redacted-id]')
      .replace(CARD_PATTERN, (match) => (passesLuhnCheck(match) ? '[bugpin:redacted-card]' : match))
  );
  return withoutPhones
    .replace(BEARER_TOKEN_PATTERN, '$1[bugpin:redacted-token]')
    .replace(LABELED_TOKEN_PATTERN, '$1[bugpin:redacted-token]');
}

export function stripUrlQueryAndFragment(value: string): string {
  const queryIndex = value.indexOf('?');
  const fragmentIndex = value.indexOf('#');
  const candidates = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const boundary = candidates.length > 0 ? Math.min(...candidates) : value.length;
  return value.slice(0, boundary);
}
