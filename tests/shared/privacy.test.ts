import { describe, expect, it } from 'bun:test';
import { redactSensitiveText, stripUrlQueryAndFragment } from '../../src/shared/privacy';

describe('redactSensitiveText', () => {
  it('redacts email addresses', () => {
    expect(redactSensitiveText('Contact jane.doe@example.co.uk today')).toBe(
      'Contact [bugpin:redacted-email] today'
    );
  });

  it('redacts JWTs before generic token matching', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(redactSensitiveText(`Bearer ${jwt}`)).toBe('Bearer [bugpin:redacted-token]');
  });

  it('redacts UUIDs as identifiers', () => {
    expect(redactSensitiveText('order 7a53f8d2-1c9b-4e6a-9f0d-3b2a5c7e9d10 failed')).toBe(
      'order [bugpin:redacted-id] failed'
    );
  });

  it('redacts card numbers that pass the Luhn check and keeps others', () => {
    expect(redactSensitiveText('card 4111 1111 1111 1111 declined')).toBe(
      'card [bugpin:redacted-card] declined'
    );
    expect(redactSensitiveText('ref 1234 5678 declined')).toBe('ref 1234 5678 declined');
  });

  it('redacts formatted phone numbers', () => {
    expect(redactSensitiveText('call +44 7911 123456')).toBe('call [bugpin:redacted-phone]');
    expect(redactSensitiveText('call (555) 123-4567 now')).toBe('call [bugpin:redacted-phone] now');
    expect(redactSensitiveText('call 555-123-4567')).toBe('call [bugpin:redacted-phone]');
  });

  it('does not mistake plain digit runs for phone numbers', () => {
    expect(redactSensitiveText('order 123456789 shipped')).toBe('order 123456789 shipped');
    expect(redactSensitiveText('code 0042')).toBe('code 0042');
  });

  it('does not mistake dates or IP addresses for phone numbers', () => {
    expect(redactSensitiveText('created 2024-01-01 12:00:00 UTC')).not.toContain('[bugpin:');
    expect(redactSensitiveText('connect 127.0.0.1:8080 failed')).not.toContain('[bugpin:');
  });

  it('redacts labeled and bearer tokens', () => {
    const token = 'a'.repeat(40);
    expect(redactSensitiveText(`token=${token}`)).toBe('token=[bugpin:redacted-token]');
    expect(redactSensitiveText(`api_key: ${token}`)).toBe('api_key: [bugpin:redacted-token]');
    expect(redactSensitiveText(`Bearer ${token}`)).toBe('Bearer [bugpin:redacted-token]');
  });

  it('keeps unlabeled hashes and slugs intact', () => {
    const hash = 'a'.repeat(40);
    const slug = `release-${'candidate'.repeat(5)}`;
    expect(redactSensitiveText(`commit ${hash}`)).toBe(`commit ${hash}`);
    expect(redactSensitiveText(`route ${slug}`)).toBe(`route ${slug}`);
  });

  it('keeps normal diagnostic text untouched', () => {
    const message = 'TypeError: cannot read properties of undefined (reading "map")';
    expect(redactSensitiveText(message)).toBe(message);
  });
});

describe('stripUrlQueryAndFragment', () => {
  it('strips query strings and fragments', () => {
    expect(stripUrlQueryAndFragment('https://example.com/page?email=a@b.com#section')).toBe(
      'https://example.com/page'
    );
  });

  it('strips fragments without query strings', () => {
    expect(stripUrlQueryAndFragment('https://example.com/page#top')).toBe(
      'https://example.com/page'
    );
  });

  it('leaves plain URLs unchanged', () => {
    expect(stripUrlQueryAndFragment('https://example.com/page')).toBe('https://example.com/page');
  });
});
