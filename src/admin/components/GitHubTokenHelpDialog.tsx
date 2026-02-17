import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

interface GitHubTokenHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GitHubTokenHelpDialog({ open, onClose }: GitHubTokenHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How to Create a GitHub Token</DialogTitle>
          <DialogDescription>
            Follow these steps to create a personal access token for GitHub integration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <strong>Where to create tokens:</strong>
            <p className="mt-1">
              Tokens are always created from your <strong>personal GitHub account</strong>:
              <br />
              Settings → Developer settings → Personal access tokens
            </p>
            <p className="mt-2 text-xs">
              <strong>Token formats:</strong> Classic tokens start with{' '}
              <code className="px-1 bg-muted rounded">ghp_</code>, fine-grained tokens start with{' '}
              <code className="px-1 bg-muted rounded">github_pat_</code>
            </p>
            <p className="mt-2 text-xs">
              <strong>Note for organizations:</strong> If accessing org repos, your org admin may
              need to enable fine-grained token access under the org's Settings → Personal access
              tokens.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-base">Option 1: Classic Token (Recommended)</h3>
            <p className="text-sm text-muted-foreground">
              Classic tokens are simpler to set up and work well for most use cases.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Go to{' '}
                <a
                  href="https://github.com/settings/tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Tokens (classic)
                </a>{' '}
                and click "Generate new token (classic)"
              </li>
              <li>
                <strong>Note:</strong> Enter a descriptive name (e.g., "BugPin Integration")
              </li>
              <li>
                <strong>Expiration:</strong> Choose an expiration period (30, 60, 90 days) or "No
                expiration" for permanent access
              </li>
              <li>
                <strong>Select scopes:</strong> Check the{' '}
                <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">repo</code>{' '}
                checkbox. This grants:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-muted-foreground">
                  <li>Full control of private repositories</li>
                  <li>Access to commit status, deployments, and invitations</li>
                  <li>Read and write security events</li>
                </ul>
                <p className="mt-1 text-muted-foreground">
                  <strong>Tip:</strong> If you only need access to public repositories, you can
                  select just{' '}
                  <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                    public_repo
                  </code>{' '}
                  instead.
                </p>
              </li>
              <li>Click "Generate token" at the bottom of the page</li>
              <li>
                <strong>Important:</strong> Copy the token immediately - you won't be able to see it
                again!
              </li>
            </ol>
          </div>

          <hr />

          <div className="space-y-3">
            <h3 className="font-semibold text-base">Option 2: Fine-grained Token</h3>
            <p className="text-sm text-muted-foreground">
              Fine-grained tokens offer more precise control over permissions but require more
              setup.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                Go to{' '}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Fine-grained tokens
                </a>{' '}
                and click "Generate new token"
              </li>
              <li>Enter a token name (e.g., "BugPin Integration")</li>
              <li>Set an expiration date</li>
              <li>
                Under "Repository access", select <strong>"All repositories"</strong> to allow
                BugPin to list and access your repos
              </li>
              <li>
                Under "Permissions" → "Repository permissions", set these permissions:
                <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
                  <li>
                    <strong>Metadata:</strong> Read{' '}
                    <span className="text-muted-foreground">
                      (required to list repositories, load labels, and assignees)
                    </span>
                  </li>
                  <li>
                    <strong>Issues:</strong> Read and write{' '}
                    <span className="text-muted-foreground">
                      (required to create and update issues)
                    </span>
                    <br />
                    <span className="text-xs text-muted-foreground ml-4">
                      ⚠️ <strong>Read-only is NOT sufficient</strong> - BugPin needs write access to
                      create and sync issues
                    </span>
                  </li>
                </ul>
              </li>
              <li>Click "Generate token" at the bottom</li>
              <li>
                <strong>Important:</strong> Copy the token immediately - you won't be able to see it
                again!
              </li>
            </ol>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">Troubleshooting</p>
            <ul className="list-disc list-inside mt-2 space-y-2 text-amber-700 dark:text-amber-300">
              <li>
                <strong>"Resource not accessible by personal access token"</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  Classic token: Ensure{' '}
                  <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">repo</code>{' '}
                  scope is checked
                  <br />
                  Fine-grained token: Enable <strong>Issues: Read and write</strong> permission
                  (read-only is not sufficient)
                </span>
              </li>
              <li>
                <strong>Cannot create or update issues</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  BugPin requires <strong>Issues: Read and write</strong> permission to create and
                  sync issues.
                  <br />
                  Read-only permissions are not sufficient. Classic tokens with{' '}
                  <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">
                    repo
                  </code>{' '}
                  scope include write access automatically.
                </span>
              </li>
              <li>
                <strong>Not all repositories showing</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  Fine-grained tokens require <strong>Metadata: Read</strong> permission to list
                  repos. Classic tokens with{' '}
                  <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">repo</code>{' '}
                  scope include this automatically.
                </span>
              </li>
              <li>
                <strong>Cannot access organization repositories</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  1. Go to your token settings and click "Configure SSO" if available
                  <br />
                  2. Authorize the token for your organization
                  <br />
                  3. For fine-grained tokens, ensure "Resource owner" is set to the organization
                </span>
              </li>
              <li>
                <strong>Token expired</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  Generate a new token. Consider using "No expiration" for classic tokens if you
                  don't want to rotate tokens regularly.
                </span>
              </li>
              <li>
                <strong>Unable to load labels/assignees</strong>
                <br />
                <span className="text-xs ml-4 block mt-0.5">
                  Fine-grained tokens need <strong>Metadata: Read</strong> permission. Classic
                  tokens with{' '}
                  <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900 rounded">repo</code>{' '}
                  scope work automatically.
                </span>
              </li>
            </ul>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
            <strong>Quick Reference - Required Permissions</strong>
            <table className="w-full mt-2 text-left">
              <thead>
                <tr className="border-b border-muted-foreground/20">
                  <th className="py-1">Feature</th>
                  <th className="py-1">Classic Token</th>
                  <th className="py-1">Fine-grained Token</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-muted-foreground/10">
                  <td className="py-1">List repositories</td>
                  <td className="py-1">
                    <code className="px-1 bg-muted rounded">repo</code>
                  </td>
                  <td className="py-1">Metadata: Read</td>
                </tr>
                <tr className="border-b border-muted-foreground/10">
                  <td className="py-1">Create issues</td>
                  <td className="py-1">
                    <code className="px-1 bg-muted rounded">repo</code>
                  </td>
                  <td className="py-1">
                    Issues: Read and write <span className="text-destructive">*</span>
                  </td>
                </tr>
                <tr className="border-b border-muted-foreground/10">
                  <td className="py-1">Update issues (sync)</td>
                  <td className="py-1">
                    <code className="px-1 bg-muted rounded">repo</code>
                  </td>
                  <td className="py-1">
                    Issues: Read and write <span className="text-destructive">*</span>
                  </td>
                </tr>
                <tr className="border-b border-muted-foreground/10">
                  <td className="py-1">Load labels</td>
                  <td className="py-1">
                    <code className="px-1 bg-muted rounded">repo</code>
                  </td>
                  <td className="py-1">Metadata: Read</td>
                </tr>
                <tr>
                  <td className="py-1">Load assignees</td>
                  <td className="py-1">
                    <code className="px-1 bg-muted rounded">repo</code>
                  </td>
                  <td className="py-1">Metadata: Read</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Read-only permissions are{' '}
              <strong>not sufficient</strong>. BugPin requires write access to create and update
              issues.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
