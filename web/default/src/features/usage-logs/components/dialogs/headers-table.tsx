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
import { cn } from '@/lib/utils'

interface HeadersTableProps {
  headers: Record<string, string>
  className?: string
}

function maskValue(key: string, value: string): string {
  if (key.toLowerCase() === 'authorization') {
    return value.replace(/^(Bearer\s+).+/, '$1sk-****')
  }
  return value
}

export function HeadersTable({ headers, className }: HeadersTableProps) {
  const entries = Object.entries(headers)
  if (entries.length === 0) {
    return <p className='text-muted-foreground text-xs'>No headers</p>
  }
  return (
    <div className={cn('space-y-1', className)}>
      {entries.map(([key, value]) => (
        <div key={key} className='flex gap-2 text-xs font-mono'>
          <span className='text-muted-foreground shrink-0'>{key}:</span>
          <span className='break-all'>{maskValue(key, value)}</span>
        </div>
      ))}
    </div>
  )
}
