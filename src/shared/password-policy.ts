export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const PASSWORD_MIN_LENGTH_FLOOR = 8;
export const PASSWORD_MIN_LENGTH_CEILING = 128;

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: PASSWORD_MIN_LENGTH_FLOOR,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
};

export type PasswordRule = 'minLength' | 'uppercase' | 'lowercase' | 'number' | 'symbol';

export interface PasswordRuleCheck {
  rule: PasswordRule;
  label: string;
  met: boolean;
}

/**
 * Every rule the policy enables, with whether the password meets it. The Admin
 * Console shows this list while typing; the server rejects any unmet rule.
 */
export function checkPasswordRules(password: string, policy: PasswordPolicy): PasswordRuleCheck[] {
  const checks: PasswordRuleCheck[] = [
    {
      rule: 'minLength',
      label: `At least ${policy.minLength} characters`,
      met: [...password].length >= policy.minLength,
    },
  ];
  if (policy.requireUppercase) {
    checks.push({ rule: 'uppercase', label: 'An uppercase letter', met: /\p{Lu}/u.test(password) });
  }
  if (policy.requireLowercase) {
    checks.push({ rule: 'lowercase', label: 'A lowercase letter', met: /\p{Ll}/u.test(password) });
  }
  if (policy.requireNumber) {
    checks.push({ rule: 'number', label: 'A number', met: /\p{Nd}/u.test(password) });
  }
  if (policy.requireSymbol) {
    checks.push({
      rule: 'symbol',
      label: 'A special character',
      met: /[^\p{L}\p{Nd}\s]/u.test(password),
    });
  }
  return checks;
}

/** A single sentence describing the unmet rules, or null when the password complies */
export function describePasswordPolicyViolation(
  password: string,
  policy: PasswordPolicy
): string | null {
  const unmet = checkPasswordRules(password, policy).filter((check) => !check.met);
  if (unmet.length === 0) return null;
  return `Password must contain: ${unmet.map((check) => check.label.toLowerCase()).join(', ')}`;
}

/** Fill in defaults and clamp the minimum length to the supported range */
export function normalizePasswordPolicy(
  policy: Partial<PasswordPolicy> | undefined
): PasswordPolicy {
  const merged = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  return {
    ...merged,
    minLength: Math.min(
      PASSWORD_MIN_LENGTH_CEILING,
      Math.max(PASSWORD_MIN_LENGTH_FLOOR, Math.round(merged.minLength))
    ),
  };
}
