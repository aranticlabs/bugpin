import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/admin';
  };

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    });
  };

  handleCopyError = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    const errorText = [
      'Error:',
      error?.message,
      '',
      'Stack:',
      error?.stack,
      '',
      'Component Stack:',
      errorInfo?.componentStack,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard not available
      console.error('Failed to copy to clipboard');
    }
  };

  toggleDetails = (): void => {
    this.setState((state) => ({ showDetails: !state.showDetails }));
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, showDetails, copied } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) {
      return children;
    }

    // If a custom fallback is provided, use it
    if (fallback) {
      return fallback;
    }

    // Default error dialog using shadcn components
    return (
      <AlertDialog open={true}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl">Something went wrong</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  An unexpected error occurred in the application.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="space-y-4 overflow-hidden">
            {/* Error message */}
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive break-words">
                {error?.message || 'Unknown error'}
              </p>
            </div>

            {/* Expandable details */}
            <div className="min-w-0">
              <Button
                variant="link"
                size="sm"
                onClick={this.toggleDetails}
                className="h-auto p-0 text-foreground underline-offset-4 hover:underline"
              >
                {showDetails ? 'Hide' : 'Show'} technical details
              </Button>

              {showDetails && (
                <div className="mt-2 space-y-2 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {error?.stack ? 'Stack Trace:' : 'Error Details:'}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={this.handleCopyError}
                      title="Copy error details"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {error?.stack && (
                    <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                      <code className="text-muted-foreground">{error.stack}</code>
                    </pre>
                  )}

                  {errorInfo?.componentStack && (
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Component Stack:
                      </p>
                      <pre className="max-h-32 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                        <code className="text-muted-foreground">{errorInfo.componentStack}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={this.handleGoHome} className="gap-2">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </AlertDialogCancel>
            <AlertDialogAction onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
}

// Hook for functional components that want error boundary behavior
export function useErrorHandler(): (error: Error) => void {
  return (error: Error) => {
    // Re-throw to be caught by nearest ErrorBoundary
    throw error;
  };
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode,
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithErrorBoundary;
}
