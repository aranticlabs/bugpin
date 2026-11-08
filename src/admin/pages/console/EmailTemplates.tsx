import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { SettingsCard } from '../../components/ui/settings-card';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { TemplateEditor } from '../../components/email/TemplateEditor';
import { TemplatePreview } from '../../components/email/TemplatePreview';
import { VariablesReference } from '../../components/email/VariablesReference';
import { Eye, RotateCcw, Send } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import {
  SUPPORTED_LOCALES,
  type EmailTemplate,
  type EmailTemplateType,
  type LocaleCode,
} from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useConfirmUnsavedChanges } from '../../hooks/useConfirmUnsavedChanges';
import { useSettings } from '../../hooks/useSettings';

const TEMPLATE_TYPES: { value: EmailTemplateType; label: string; description: string }[] = [
  {
    value: 'newReport',
    label: 'New Report',
    description: 'Sent when a new bug report is created',
  },
  {
    value: 'statusChange',
    label: 'Status Change',
    description: 'Sent when a report status changes',
  },
  {
    value: 'priorityChange',
    label: 'Priority Change',
    description: 'Sent when a report priority changes',
  },
  {
    value: 'assignment',
    label: 'Assignment',
    description: 'Sent when a report is assigned to someone',
  },
  {
    value: 'invitation',
    label: 'Invitation',
    description: 'Sent when inviting a new user',
  },
  {
    value: 'passwordReset',
    label: 'Password Reset',
    description: 'Sent when an administrator sends a password reset link',
  },
  {
    value: 'reportDeleted',
    label: 'Report Deleted',
    description: 'Sent when a report is deleted',
  },
  {
    value: 'testEmail',
    label: 'Test Email',
    description: 'Sent when testing SMTP configuration',
  },
  {
    value: 'reporterConfirmation',
    label: 'Reporter Confirmation',
    description: 'Sent to the reporter when a bug report is submitted',
  },
  {
    value: 'reporterStatusChange',
    label: 'Reporter Status Change',
    description: 'Sent to the reporter when report status changes',
  },
  {
    value: 'reporterPriorityChange',
    label: 'Reporter Priority Change',
    description: 'Sent to the reporter when report priority changes',
  },
  {
    value: 'reporterMessage',
    label: 'Reporter Message',
    description: 'Sent to the reporter when an admin sends a direct message',
  },
  {
    value: 'reporterAssignment',
    label: 'Reporter Assignment',
    description: 'Sent to the reporter when their report is assigned or reassigned',
  },
];

const LOCALE_LABELS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  ja: '日本語 (JP)',
  zh: '中文 (简体) (CN)',
};

const TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  newReport: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.status',
    'report.statusFormatted',
    'report.priority',
    'report.priorityFormatted',
    'report.url',
    'report.pageUrl',
    'report.createdAt',
  ],
  statusChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'oldStatus',
    'oldStatusFormatted',
    'newStatus',
    'newStatusFormatted',
  ],
  priorityChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'oldPriority',
    'oldPriorityFormatted',
    'newPriority',
    'newPriorityFormatted',
  ],
  assignment: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.url',
    'assignee.name',
    'assignee.email',
  ],
  invitation: ['app.name', 'inviter.name', 'invite.url', 'invite.expiresInDays'],
  passwordReset: ['app.name', 'user.name', 'reset.url', 'reset.expiresInHours'],
  reportDeleted: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.status',
    'report.statusFormatted',
    'report.priority',
    'report.priorityFormatted',
  ],
  testEmail: ['app.name'],
  reporterConfirmation: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'report.status',
    'report.statusFormatted',
    'report.priority',
    'report.priorityFormatted',
    'report.createdAt',
  ],
  reporterStatusChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'oldStatus',
    'oldStatusFormatted',
    'newStatus',
    'newStatusFormatted',
    'reporterMessage',
    'reporterMessageDisplay',
  ],
  reporterPriorityChange: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.description',
    'oldPriority',
    'oldPriorityFormatted',
    'newPriority',
    'newPriorityFormatted',
  ],
  reporterMessage: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.status',
    'report.statusFormatted',
    'sender.name',
    'message',
  ],
  reporterAssignment: [
    'app.name',
    'app.url',
    'project.name',
    'report.title',
    'report.status',
    'report.statusFormatted',
    'report.url',
    'assignee.name',
    'previousAssigneeName',
    'previousAssigneeDisplay',
    'noPreviousAssigneeDisplay',
  ],
};

type LocaleDraft = Record<LocaleCode, EmailTemplate>;

function emptyDraft(): LocaleDraft {
  return SUPPORTED_LOCALES.reduce((acc, code) => {
    acc[code] = { subject: '', html: '' };
    return acc;
  }, {} as LocaleDraft);
}

interface CustomTemplatesResponse {
  success: boolean;
  templates: Partial<Record<EmailTemplateType, Partial<Record<LocaleCode, EmailTemplate>>>>;
}

export function EmailTemplates() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<EmailTemplateType>('newReport');
  const [activeLocale, setActiveLocale] = useState<LocaleCode>('en');
  const [draft, setDraft] = useState<LocaleDraft>(() => emptyDraft());
  const baseline = useRef<LocaleDraft>(emptyDraft());
  const initializedType = useRef<EmailTemplateType | null>(null);
  const [resetLocales, setResetLocales] = useState<Set<LocaleCode>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: featureStatus, isLoading: isLoadingLicense } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  const isLicensed = featureStatus?.features?.['custom-templates'] ?? false;

  const { data: customTemplates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['custom-email-templates'],
    queryFn: async () => {
      const response = await api.get<CustomTemplatesResponse>('/templates');
      return response.data.templates;
    },
    enabled: isLicensed,
  });

  const { data: settings } = useSettings();
  const smtpEnabled = Boolean(settings?.smtpEnabled);

  const { data: defaults } = useQuery({
    queryKey: ['email-template-defaults', selectedType],
    queryFn: async () =>
      (await api.get(`/templates/${selectedType}/defaults`)).data.templates as Partial<
        Record<LocaleCode, EmailTemplate>
      >,
    enabled: isLicensed,
  });

  useEffect(() => {
    if (!isLicensed || !defaults) return;
    const typeChanged = initializedType.current !== selectedType;
    if (!typeChanged && hasChanges) return;
    const next = emptyDraft();
    for (const code of SUPPORTED_LOCALES) {
      const entry = customTemplates?.[selectedType]?.[code] ?? defaults[code] ?? defaults.en;
      if (entry) next[code] = { ...entry };
    }
    baseline.current = next;
    initializedType.current = selectedType;
    setDraft(next);
    setHasChanges(false);
    setResetLocales(new Set());
    setShowPreview(false);
    setPreviewData(null);
    if (typeChanged) setActiveLocale('en');
  }, [customTemplates, selectedType, isLicensed, defaults, hasChanges]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: Partial<Record<LocaleCode, EmailTemplate | null>> = {};
      for (const code of SUPPORTED_LOCALES) {
        const entry = draft[code];
        if (resetLocales.has(code)) {
          updates[code] = null;
          continue;
        }
        const initial = baseline.current[code];
        if (entry.subject === initial.subject && entry.html === initial.html) continue;
        if (!entry.subject.trim() || !entry.html.trim())
          throw new Error(`Subject and content are required for ${code}`);
        updates[code] = entry;
      }
      await api.put(`/templates/${selectedType}/locales`, { templates: updates });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['custom-email-templates'] });
      baseline.current = draft;
      setResetLocales(new Set());
      toast.success('Template saved successfully');
      setHasChanges(false);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to save template');
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const entry = draft[activeLocale];
      const response = await api.post('/templates/preview', {
        type: selectedType,
        subject: entry.subject,
        html: entry.html,
      });
      return response.data.preview as { subject: string; html: string };
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to generate preview');
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) {
        throw new Error('User email not found');
      }
      const entry = draft[activeLocale];
      const response = await api.post('/templates/send-test', {
        type: selectedType,
        subject: entry.subject,
        html: entry.html,
        recipientEmail: user.email,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(`Test email sent to ${user?.email}`);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to send test email');
    },
  });

  const typeSwitch = useConfirmUnsavedChanges({
    isDirty: hasChanges,
    onSave: () => saveMutation.mutateAsync(),
  });

  const handleResetLocale = () => {
    const template = defaults?.[activeLocale] ?? defaults?.en;
    if (!template) return;
    setDraft((current) => ({ ...current, [activeLocale]: { ...template } }));
    setResetLocales((current) => new Set([...current, activeLocale]));
    setHasChanges(true);
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleSubjectChange = (value: string) => {
    setResetLocales((current) => {
      const next = new Set(current);
      next.delete(activeLocale);
      return next;
    });
    setDraft((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], subject: value },
    }));
    setHasChanges(true);
  };

  const handleHtmlChange = (value: string) => {
    setResetLocales((current) => {
      const next = new Set(current);
      next.delete(activeLocale);
      return next;
    });
    setDraft((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], html: value },
    }));
    setHasChanges(true);
  };

  const isLoading = isLoadingLicense || (isLicensed && isLoadingTemplates);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!isLicensed) {
    return (
      <UpgradePrompt
        feature="custom-templates"
        title="Email Templates"
        description="Customize the email notification templates sent to users. Personalize subject lines, content, and styling to match your brand."
      />
    );
  }

  const selectedTemplateInfo = TEMPLATE_TYPES.find((t) => t.value === selectedType);
  const availableVariables = TEMPLATE_VARIABLES[selectedType];
  const activeEntry = draft[activeLocale];
  const subject = activeEntry.subject;
  const html = activeEntry.html;
  const isLocaleEmpty = subject.trim() === '' && html.trim() === '';

  return (
    <SettingsCard
      title="Email Templates"
      description="Customize the email templates sent to users for notifications"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map((template) => (
            <Button
              key={template.value}
              variant={selectedType === template.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                if (template.value !== selectedType) {
                  typeSwitch.confirm(() => setSelectedType(template.value));
                }
              }}
            >
              {template.label}
            </Button>
          ))}
        </div>

        {selectedTemplateInfo && (
          <p className="text-sm text-muted-foreground">{selectedTemplateInfo.description}</p>
        )}

        <Tabs
          value={activeLocale}
          onValueChange={(v) => {
            setActiveLocale(v as LocaleCode);
            setShowPreview(false);
            setPreviewData(null);
          }}
          className="w-full"
        >
          <TabsList
            role="tablist"
            aria-label="Locale"
            className="flex flex-wrap h-auto justify-start gap-1"
          >
            {SUPPORTED_LOCALES.map((code) => {
              const hasDraftContent =
                draft[code].subject.trim() !== '' || draft[code].html.trim() !== '';
              return (
                <TabsTrigger key={code} value={code} className="text-xs">
                  {LOCALE_LABELS[code]}
                  {hasDraftContent ? <span className="ml-1 text-primary">•</span> : null}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {SUPPORTED_LOCALES.map((code) => (
            <TabsContent key={code} value={code} className="mt-4 space-y-4">
              {code === activeLocale ? (
                <>
                  {activeLocale !== 'en' && isLocaleEmpty ? (
                    <p className="text-sm text-muted-foreground">
                      No override for {LOCALE_LABELS[activeLocale]}. Using the English override (or
                      the built-in default if English is also empty). Start typing to add a{' '}
                      {LOCALE_LABELS[activeLocale]} variant.
                    </p>
                  ) : null}
                  {activeLocale === 'en' ? (
                    <p className="text-xs text-muted-foreground">
                      If left blank, English recipients will see the default template.
                    </p>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor={`subject-${code}`}>Subject Line</Label>
                    <Input
                      id={`subject-${code}`}
                      value={subject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      placeholder="Email subject..."
                    />
                    <p className="text-xs text-muted-foreground">
                      You can use variables like {`{{app.name}}`} in the subject line
                    </p>
                  </div>

                  <VariablesReference variables={availableVariables} />

                  <div className="space-y-2">
                    <Label>Email Body</Label>
                    <TemplateEditor
                      value={html}
                      onChange={handleHtmlChange}
                      availableVariables={availableVariables}
                      placeholder="Enter your email template HTML..."
                    />
                  </div>
                </>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>

        {showPreview && previewData && (
          <div className="space-y-2">
            <Label>Preview (with sample data)</Label>
            <TemplatePreview subject={previewData.subject} html={previewData.html} />
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              if (showPreview) {
                setShowPreview(false);
              } else {
                previewMutation.mutate();
              }
            }}
            disabled={previewMutation.isPending || !subject || !html}
          >
            {previewMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Loading...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Hide Preview' : 'Preview'}
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => sendTestMutation.mutate()}
            disabled={sendTestMutation.isPending || !subject || !html || !smtpEnabled}
            title={!smtpEnabled ? 'SMTP must be configured first' : undefined}
          >
            {sendTestMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </>
            )}
          </Button>

          <Button variant="outline" onClick={handleResetLocale}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset {LOCALE_LABELS[activeLocale]} to Default
          </Button>

          <UnsavedChangesGuard
            isDirty={hasChanges}
            onSave={() => saveMutation.mutateAsync()}
            onDiscard={() => {
              setDraft(baseline.current);
              setResetLocales(new Set());
              setHasChanges(false);
            }}
          />
          {typeSwitch.dialog}
        </div>

        {user?.email && (
          <p className="text-xs text-muted-foreground">
            Test email will be sent to: <strong>{user.email}</strong>
          </p>
        )}
      </div>
    </SettingsCard>
  );
}
