/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState, useMemo, useCallback } from 'react'
import { Copy, Check, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'

interface JsonTreeViewProps {
  data: string
  maxHeight?: number
  className?: string
}

function getValueColor(value: unknown): string {
  if (value === null || value === undefined) return 'text-muted-foreground'
  if (typeof value === 'string') return 'text-emerald-600'
  if (typeof value === 'number') return 'text-blue-600'
  if (typeof value === 'boolean') return 'text-orange-600'
  return 'text-foreground'
}

function getValueDisplay(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') {
    const truncated = value.length > 200 ? value.slice(0, 200) + '...' : value
    return `"${truncated}"`
  }
  return String(value)
}

function isExpandable(value: unknown): boolean {
  return value !== null && typeof value === 'object'
}

function JsonNode({
  nodeKey,
  value,
  path,
  depth,
  collapsedPaths,
  onToggle,
}: {
  nodeKey: string | number
  value: unknown
  path: string
  depth: number
  collapsedPaths: Set<string>
  onToggle: (path: string) => void
}) {
  const isCollapsed = collapsedPaths.has(path)
  const expandable = isExpandable(value)

  if (!expandable) {
    return (
      <div
        className='flex items-start gap-1 py-0.5'
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <span className='text-muted-foreground shrink-0 font-mono text-xs'>
          {typeof nodeKey === 'string' ? `${nodeKey}: ` : ''}
        </span>
        <span
          className={cn('font-mono text-xs break-all', getValueColor(value))}
        >
          {getValueDisplay(value)}
        </span>
      </div>
    )
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value as Record<string, unknown>)
  const count = entries.length
  const isArray = Array.isArray(value)
  const bracket = isArray ? ['[', ']'] : ['{', '}']

  // Preview for collapsed state
  const preview = isArray
    ? `Array(${count})`
    : count <= 3
      ? `{ ${entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v.slice(0, 30)}${v.length > 30 ? '...' : ''}"` : String(v)}`).join(', ')} }`
      : `{ ${entries
          .slice(0, 3)
          .map(
            ([k, v]) =>
              `${k}: ${typeof v === 'string' ? `"${v.slice(0, 30)}${v.length > 30 ? '...' : ''}"` : String(v)}`
          )
          .join(', ')}, ... }`

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <button
        type='button'
        className='flex items-center gap-1 py-0.5 text-left hover:bg-muted/50 rounded-sm w-full'
        onClick={() => onToggle(path)}
      >
        {isCollapsed ? (
          <ChevronRight className='size-3 shrink-0 text-muted-foreground' />
        ) : (
          <ChevronDown className='size-3 shrink-0 text-muted-foreground' />
        )}
        <span className='text-muted-foreground font-mono text-xs'>
          {typeof nodeKey === 'string' ? `${nodeKey}: ` : ''}
        </span>
        <span className='font-mono text-xs text-muted-foreground'>
          {bracket[0]}
        </span>
        {isCollapsed && (
          <span className='font-mono text-xs text-muted-foreground truncate'>
            {' '}
            {preview}{' '}
          </span>
        )}
        {isCollapsed && (
          <span className='font-mono text-xs text-muted-foreground'>
            {bracket[1]}
          </span>
        )}
      </button>
      {!isCollapsed && (
        <div>
          {entries.map(([key, val]) => (
            <JsonNode
              key={`${path}.${key}`}
              nodeKey={key}
              value={val}
              path={`${path}.${key}`}
              depth={depth + 1}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
            />
          ))}
          <div
            className='py-0.5 font-mono text-xs text-muted-foreground'
            style={{ paddingLeft: `${depth * 16}px` }}
          >
            {bracket[1]}
          </div>
        </div>
      )}
    </div>
  )
}

export function JsonTreeView({
  data,
  maxHeight = 400,
  className,
}: JsonTreeViewProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    () => new Set()
  )
  const { copyToClipboard, copiedText } = useCopyToClipboard()

  const parsed = useMemo(() => {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }, [data])

  const handleToggle = useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  if (parsed === null) {
    return (
      <div className={cn('font-mono text-xs text-muted-foreground', className)}>
        {data || 'Empty'}
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        variant='ghost'
        size='sm'
        className='absolute top-0 right-0 h-5 w-5 p-0 z-10'
        onClick={() => copyToClipboard(data)}
        title='Copy JSON'
        aria-label='Copy JSON'
      >
        {copiedText === data ? (
          <Check className='size-3 text-green-600' />
        ) : (
          <Copy className='size-3' />
        )}
      </Button>
      <div
        className='overflow-y-auto pr-6'
        style={{ maxHeight: `${maxHeight}px` }}
      >
        <JsonNode
          nodeKey=''
          value={parsed}
          path='$'
          depth={0}
          collapsedPaths={collapsedPaths}
          onToggle={handleToggle}
        />
      </div>
    </div>
  )
}
