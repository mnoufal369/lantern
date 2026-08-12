import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Last line of defence: a render crash shows a recovery screen instead of a white window. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('Renderer crashed', error)
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-deck-bg px-8 text-center">
        <div className="text-4xl">🛠️</div>
        <h1 className="text-lg font-semibold text-zinc-100">Something broke on our side</h1>
        <p className="max-w-md text-sm text-zinc-400">
          The interface hit an unexpected error. Your sessions and transcripts are safe. Reloading brings everything
          back.
        </p>
        <pre className="selectable max-h-32 max-w-lg overflow-auto rounded-lg bg-deck-panel p-3 text-left font-mono text-[11px] text-zinc-500">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-deck-accent px-4 py-2 text-sm font-medium text-deck-on-accent hover:opacity-90"
        >
          Reload Pilot
        </button>
      </div>
    )
  }
}
