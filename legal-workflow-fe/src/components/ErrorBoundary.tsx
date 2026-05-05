import { Component, type ReactNode } from 'react'
import { WarningCircle } from '@phosphor-icons/react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center" role="alert">
          <WarningCircle size={48} weight="light" className="text-red-400 mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold font-heading text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-4 max-w-md">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-navy-600 text-white rounded hover:bg-navy-700 text-sm font-medium transition-colors duration-150"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
