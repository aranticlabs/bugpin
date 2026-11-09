import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { dashboardKeys } from './useDashboard';
import { gamificationKeys } from './useGamification';
import type { ReporterMessage } from '@shared/types';

export interface SendReporterMessageInput {
  message: string;
  ccSender?: boolean;
  files?: File[];
}

export function useReporterMessages(reportId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['reporterMessages', reportId],
    queryFn: async () => {
      const response = await api.get(`/reports/${reportId}/reporter-messages`);
      return response.data.messages as ReporterMessage[];
    },
    enabled: !!reportId,
  });

  const sendMutation = useSendReporterMessage(reportId);

  const moderation = useMutation({
    mutationKey: ['moderateReporterMessage', reportId],
    mutationFn: async ({ messageId, hidden }: { messageId: string; hidden: boolean }) => {
      const response = await api.post(
        `/reports/${reportId}/reporter-messages/${messageId}/${hidden ? 'hide' : 'unhide'}`
      );
      return response.data.message as ReporterMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporterMessages', reportId] });
      queryClient.invalidateQueries({ queryKey: ['report-history', reportId] });
    },
  });

  const { reset } = moderation;
  useEffect(() => reset(), [reportId, reset]);

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    sendMessageAsync: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    sendError: sendMutation.error,
    setHidden: moderation.mutateAsync,
    isModerating: moderation.isPending,
    moderationError: moderation.error,
    moderatingMessageId: moderation.isPending ? moderation.variables?.messageId : undefined,
  };
}

export function useSendReporterMessage(reportId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ['sendReporterMessage', reportId],
    mutationFn: async (data: SendReporterMessageInput) => {
      let body: FormData | { message: string; ccSender?: boolean } = {
        message: data.message,
        ccSender: data.ccSender,
      };
      if (data.files?.length) {
        body = new FormData();
        body.set('message', data.message);
        body.set('ccSender', String(data.ccSender ?? false));
        for (const file of data.files) body.append('files[]', file);
      }
      const response = await api.post(
        `/reports/${reportId}/reporter-messages`,
        body,
        body instanceof FormData
          ? { headers: { 'Content-Type': 'multipart/form-data' } }
          : undefined
      );
      return response.data.reporterMessage as ReporterMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reporterMessages', reportId] });
      queryClient.invalidateQueries({ queryKey: ['report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: gamificationKeys.self() });
      toast.success('Message sent to reporter');
    },
  });

  const { reset } = mutation;
  useEffect(() => reset(), [reportId, reset]);
  return mutation;
}
