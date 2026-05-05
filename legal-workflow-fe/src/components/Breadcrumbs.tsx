import { Link } from 'react-router-dom'
import { CaretRight } from '@phosphor-icons/react'

interface BreadcrumbItem {
  label: string
  to?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-sm text-gray-500">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <CaretRight size={12} weight="bold" className="text-gray-400" aria-hidden="true" />}
            {item.to ? (
              <Link to={item.to} className="text-navy-600 hover:text-navy-800 hover:underline transition-colors duration-150">
                {item.label}
              </Link>
            ) : (
              <span className="text-gray-800 font-medium" aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
