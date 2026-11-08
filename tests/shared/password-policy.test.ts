import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_PASSWORD_POLICY,
  checkPasswordRules,
  describePasswordPolicyViolation,
  normalizePasswordPolicy,
} from '../../src/shared/password-policy';

const strict = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

describe('password policy', () => {
  it('only checks length by default', () => {
    expect(checkPasswordRules('abcdefgh', DEFAULT_PASSWORD_POLICY)).toEqual([
      { rule: 'minLength', label: 'At least 8 characters', met: true },
    ]);
    expect(describePasswordPolicyViolation('short', DEFAULT_PASSWORD_POLICY)).toBe(
      'Password must contain: at least 8 characters'
    );
  });

  it('reports every unmet rule of a strict policy', () => {
    expect(describePasswordPolicyViolation('abc', strict)).toBe(
      'Password must contain: at least 12 characters, an uppercase letter, a number, a special character'
    );
    expect(describePasswordPolicyViolation('Correct-Horse-9', strict)).toBeNull();
  });

  it('counts non-ASCII letters and symbols', () => {
    expect(describePasswordPolicyViolation('Überprüfung-2026', strict)).toBeNull();
    expect(checkPasswordRules('pässwort 123', strict).find((c) => c.rule === 'symbol')?.met).toBe(
      false
    );
  });

  it('fills defaults and clamps the minimum length', () => {
    expect(normalizePasswordPolicy(undefined)).toEqual(DEFAULT_PASSWORD_POLICY);
    expect(normalizePasswordPolicy({ minLength: 4 }).minLength).toBe(8);
    expect(normalizePasswordPolicy({ minLength: 500 }).minLength).toBe(128);
  });
});
