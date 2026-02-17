import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { TemplateEditor } from '../../components/email/TemplateEditor';
import { TemplatePreview } from '../../components/email/TemplatePreview';
import { VariablesReference } from '../../components/email/VariablesReference';
import { Eye, RotateCcw, Save, Send } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import type { AppSettings, EmailTemplateType, EmailTemplate } from '@shared/types';

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
    value: 'testEmail',
    label: 'Test Email',
    description: 'Sent when testing SMTP configuration',
  },
];

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
  testEmail: ['app.name'],
};

export function EmailTemplatesSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<EmailTemplateType>('newReport');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Check if email-templates feature is licensed
  const { data: featureStatus, isLoading: isLoadingLicense } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  const isLicensed = featureStatus?.features?.['email-templates'] ?? false;

  // Fetch current settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  // Fetch default template for reset
  const fetchDefaultTemplate = async (type: EmailTemplateType): Promise<EmailTemplate> => {
    const response = await api.get(`/settings/email-templates/defaults/${type}`);
    return response.data.template;
  };

  // Load template when type changes or settings load
  useEffect(() => {
    if (settings) {
      const customTemplate = settings.emailTemplates?.[selectedType];
      if (customTemplate) {
        setSubject(customTemplate.subject);
        setHtml(customTemplate.html);
      } else {
        // Load default template
        fetchDefaultTemplate(selectedType).then((template) => {
          setSubject(template.subject);
          setHtml(template.html);
        });
      }
      setHasChanges(false);
      setShowPreview(false);
      setPreviewData(null);
    }
  }, [settings, selectedType]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const currentTemplates = settings?.emailTemplates || {};
      const updatedTemplates = {
        ...currentTemplates,
        [selectedType]: { subject, html },
      };
      const response = await api.put('/settings', {
        emailTemplates: updatedTemplates,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Template saved successfully');
      setHasChanges(false);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save template');
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/settings/email-templates/preview', {
        type: selectedType,
        subject,
        html,
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

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) {
        throw new Error('User email not found');
      }
      const response = await api.post('/settings/email-templates/send-test', {
        type: selectedType,
        subject,
        html,
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

  // Reset to default
  const handleReset = async () => {
    try {
      const defaultTemplate = await fetchDefaultTemplate(selectedType);
      setSubject(defaultTemplate.subject);
      setHtml(defaultTemplate.html);
      setHasChanges(true);
      setShowPreview(false);
      setPreviewData(null);
      toast.success('Template reset to default');
    } catch {
      toast.error('Failed to fetch default template');
    }
  };

  const handleSubjectChange = (value: string) => {
    setSubject(value);
    setHasChanges(true);
  };

  const handleHtmlChange = (value: string) => {
    setHtml(value);
    setHasChanges(true);
  };

  const isLoading = isLoadingLicense || isLoadingSettings;

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
        feature="email-templates"
        title="Email Templates"
        description="Customize the email notification templates sent to users. Personalize subject lines, content, and styling to match your brand."
      />
    );
  }

  const selectedTemplateInfo = TEMPLATE_TYPES.find((t) => t.value === selectedType);
  const availableVariables = TEMPLATE_VARIABLES[selectedType];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Templates</CardTitle>
        <CardDescription>
          Customize the email templates sent to users for notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Selector */}
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_TYPES.map((template) => (
            <Button
              key={template.value}
              variant={selectedType === template.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedType(template.value)}
            >
              {template.label}
            </Button>
          ))}
        </div>

        {selectedTemplateInfo && (
          <p className="text-sm text-muted-foreground">{selectedTemplateInfo.description}</p>
        )}

        {/* Subject Input */}
        <div className="space-y-2">
          <Label htmlFor="subject">Subject Line</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            placeholder="Email subject..."
          />
          <p className="text-xs text-muted-foreground">
            You can use variables like {`{{app.name}}`} in the subject line
          </p>
        </div>

        {/* Variables Reference */}
        <VariablesReference variables={availableVariables} />

        {/* Template Editor */}
        <div className="space-y-2">
          <Label>Email Body</Label>
          <TemplateEditor
            value={html}
            onChange={handleHtmlChange}
            availableVariables={availableVariables}
            placeholder="Enter your email template HTML..."
          />
        </div>

        {/* Preview Section */}
        {showPreview && previewData && (
          <div className="space-y-2">
            <Label>Preview (with sample data)</Label>
            <TemplatePreview subject={previewData.subject} html={previewData.html} />
          </div>
        )}

        {/* Action Buttons */}
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
            disabled={sendTestMutation.isPending || !subject || !html || !settings?.smtpEnabled}
            title={!settings?.smtpEnabled ? 'SMTP must be configured first' : undefined}
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

          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </>
            )}
          </Button>
        </div>

        {user?.email && (
          <p className="text-xs text-muted-foreground">
            Test email will be sent to: <strong>{user.email}</strong>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
