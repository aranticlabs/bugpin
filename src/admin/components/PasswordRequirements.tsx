import { Check, X } from 'lucide-react';
import { checkPasswordRules, type PasswordPolicy } from '@shared/password-policy';
import { cn } from '../lib/utils';

export function PasswordRequirements({
  password,
  policy,
}: {
  password: string;
  policy: PasswordPolicy;
}) {
  const checks = checkPasswordRules(password, policy);
  return (
    <ul className="space-y-1 text-xs" aria-label="Password requirements">
      {checks.map((check) => (
        <li
          key={check.rule}
          className={cn(
            'flex items-center gap-1.5',
            check.met ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground'
          )}
        >
          {check.met ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{check.label}</span>
          <span className="sr-only">{check.met ? '(met)' : '(not met)'}</span>
        </li>
      ))}
    </ul>
  );
}

/** True when the password meets every rule of the policy */
export function passwordMeetsPolicy(password: string, policy: PasswordPolicy): boolean {
  return checkPasswordRules(password, policy).every((check) => check.met);
}
