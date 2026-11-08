export type ApiError = Error & {
  response?: { status?: number; data?: { message?: string; error?: string } };
};

export function apiErrorMessage(error: unknown, fallback: string): string {
  return (error as ApiError | undefined)?.response?.data?.message || fallback;
}

export function apiErrorCode(error: unknown): string | undefined {
  return (error as ApiError | undefined)?.response?.data?.error;
}
