import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Without this, any render error anywhere unmounts the entire app and leaves
 * staff staring at a white page with nothing to click and nothing to report.
 * That is what a PDF worker race in the form viewer used to do.
 *
 * A boundary keeps the failure local: the rest of the app is still there, and
 * the person sees something they can act on instead of a blank screen.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Deliberately console-only. Client records pass through these screens, so
    // error text must not be shipped anywhere it could be retained.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">
              {this.props.label ?? 'Something went wrong on this screen'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Nothing you entered was sent. Try again, and if it keeps happening,
              tell your administrator what you were doing when it broke.
            </p>
          </div>

          <div className="flex justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </div>

          <details className="text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Technical details
            </summary>
            <p className="mt-2 break-words rounded bg-muted p-2 text-xs">
              {error.message || String(error)}
            </p>
          </details>
        </div>
      </div>
    );
  }
}
