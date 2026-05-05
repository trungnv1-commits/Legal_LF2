import { MagnifyingGlass, ClipboardText, FileText, Plus } from '@phosphor-icons/react'

interface EmptyStateProps {
  icon?: 'search' | 'tasks' | 'documents' | 'default'
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const ICONS = {
  search: MagnifyingGlass,
  tasks: ClipboardText,
  documents: FileText,
  default: Plus,
}

export function EmptyState({ icon = 'default', title, description, actionLabel, onAction }: EmptyStateProps) {
  const Icon = ICONS[icon]
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mb-4">
        <Icon size={32} weight="light" className="text-navy-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold font-heading text-gray-800 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-sm mb-4">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-amber-cta-600 text-white rounded hover:bg-amber-cta-700 text-sm font-medium transition-colors duration-150"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
