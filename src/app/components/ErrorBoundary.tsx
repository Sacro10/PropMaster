/**
 * Error handling components
 */

import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorState
          error={this.state.error}
          retry={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorStateProps {
  error?: Error | null;
  retry?: () => void;
  message?: string;
}

/**
 * Generic error display component
 */
export function ErrorState({ error, retry, message }: ErrorStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-red-500/10 rounded-full">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
        </div>

        <h3
          className="text-2xl mb-2"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          SOMETHING WENT WRONG
        </h3>

        <p className="text-white/70 mb-6" style={{ fontFamily: 'Work Sans, sans-serif' }}>
          {message || error?.message || 'An unexpected error occurred. Please try again.'}
        </p>

        {retry && (
          <button
            onClick={retry}
            className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform inline-flex items-center gap-2"
            style={{ fontFamily: 'Work Sans, sans-serif' }}
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Inline error message component
 */
export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
      <p className="text-sm text-red-400" style={{ fontFamily: 'Work Sans, sans-serif' }}>
        {message}
      </p>
    </div>
  );
}
