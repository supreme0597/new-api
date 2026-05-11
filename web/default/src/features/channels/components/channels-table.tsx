import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  getCoreRowModel,
  useReactTable,
  getExpandedRowModel,
  type OnChangeFn,
  type SortingState,
  type VisibilityState,
  type ExpandedState,
  type Row,
} from '@tanstack/react-table'
import { useDebounce, useMediaQuery } from '@/hooks'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { getLobeIcon } from '@/lib/lobe-icon'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'
import {
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
  DataTablePage,
} from '@/components/data-table'
import { getChannels, searchChannels, getGroups, getChannelOwners } from '../api'
import {
  DEFAULT_PAGE_SIZE,
  CHANNEL_STATUS,
  CHANNEL_STATUS_OPTIONS,
} from '../constants'
import {
  channelsQueryKeys,
  aggregateChannelsByTag,
  isTagAggregateRow,
  getChannelTypeIcon,
  getChannelTypeLabel,
} from '../lib'
import type { Channel, ChannelSortBy } from '../types'
import { useChannelsColumns } from './channels-columns'
import { useChannels } from './channels-provider'
import { DataTableBulkActions } from './data-table-bulk-actions'


const CHANNEL_SORTABLE_COLUMNS = new Set<ChannelSortBy>([
  'id',
  'name',
  'priority',
  'balance',
  'response_time',
  'test_time',
])

function isDisabledChannelRow(channel: Channel) {
  return (
    !isTagAggregateRow(channel) && channel.status !== CHANNEL_STATUS.ENABLED
  )
}

export function ChannelsTable({ myChannelsOnly, routeId }: { myChannelsOnly?: boolean; routeId: string } = {}) {
  const { t } = useTranslation()
  const { enableTagMode, idSort } = useChannels()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const currentUser = useAuthStore((s) => s.auth.user)

  // 使用当前路由的 search 和 navigate
  const route = getRouteApi(routeId)
  const search = route.useSearch()
  const navigate = route.useNavigate()

  // Table state
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    models: false,
    tag: false,
  })
  const [rowSelection, setRowSelection] = useState({})
  const [expanded, setExpanded] = useState<ExpandedState>({})

  // URL state management
  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: {
      defaultPage: 1,
      defaultPageSize: isMobile ? 10 : DEFAULT_PAGE_SIZE,
    },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'type', searchKey: 'type', type: 'array' },
      { columnId: 'group', searchKey: 'group', type: 'array' },
      { columnId: 'model', searchKey: 'model', type: 'string' },
      { columnId: 'scope', searchKey: 'scope', type: 'array' },
      { columnId: 'owner_username', searchKey: 'owner', type: 'array' },
    ],
  })

  // Extract filters from column filters
  const statusFilter =
    (columnFilters.find((f) => f.id === 'status')?.value as string[]) || []
  const typeFilter =
    (columnFilters.find((f) => f.id === 'type')?.value as string[]) || []
  const groupFilter =
    (columnFilters.find((f) => f.id === 'group')?.value as string[]) || []
  const modelFilterFromUrl =
    (columnFilters.find((f) => f.id === 'model')?.value as string) || ''
  const scopeFilter =
    (columnFilters.find((f) => f.id === 'scope')?.value as string[]) || []
  const ownerFilter =
    (columnFilters.find((f) => f.id === 'owner_username')?.value as string[]) || []

  // Local state for immediate input feedback
  const [modelFilterInput, setModelFilterInput] = useState(modelFilterFromUrl)
  const debouncedModelFilter = useDebounce(modelFilterInput, 500)

  // Sync local input with URL when URL changes (e.g., from back/forward navigation)
  useEffect(() => {
    setModelFilterInput(modelFilterFromUrl)
  }, [modelFilterFromUrl])

  // Update URL when debounced value changes
  useEffect(() => {
    if (debouncedModelFilter !== modelFilterFromUrl) {
      onColumnFiltersChange((prev) => {
        const filtered = prev.filter((f) => f.id !== 'model')
        return debouncedModelFilter
          ? [...filtered, { id: 'model', value: debouncedModelFilter }]
          : filtered
      })
    }
  }, [debouncedModelFilter, modelFilterFromUrl, onColumnFiltersChange])

  const modelFilter = modelFilterFromUrl

  // Determine whether to use search or regular list API
  const shouldSearch = Boolean(globalFilter?.trim() || modelFilter.trim())

  const sortParams = useMemo(() => {
    const activeSort = sorting[0]
    if (
      !activeSort ||
      !CHANNEL_SORTABLE_COLUMNS.has(activeSort.id as ChannelSortBy)
    ) {
      return {}
    }

    return {
      sort_by: activeSort.id as ChannelSortBy,
      sort_order: activeSort.desc ? 'desc' : 'asc',
    } as const
  }, [sorting])

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater
      if (pagination.pageIndex > 0) {
        onPaginationChange({ ...pagination, pageIndex: 0 })
      }
      return next
    })
  }

  // Fetch groups for filter
  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })

  // Fetch channel owners for filter
  const { data: ownersData } = useQuery({
    queryKey: ['channel-owners'],
    queryFn: getChannelOwners,
  })

  const groupOptions = useMemo(
    () =>
      (groupsData?.data || []).map((g) => ({
        label: g,
        value: g,
      })),
    [groupsData]
  )

  // Fetch channels data
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data, isLoading, isFetching } = useQuery({
    queryKey: channelsQueryKeys.list({
      keyword: globalFilter,
      model: modelFilter,
      group:
        groupFilter.length > 0 && !groupFilter.includes('all')
          ? groupFilter[0]
          : undefined,
      status:
        statusFilter.length > 0 && !statusFilter.includes('all')
          ? statusFilter[0]
          : undefined,
      type:
        typeFilter.length > 0 && !typeFilter.includes('all')
          ? Number(typeFilter[0])
          : undefined,
      scope:
        scopeFilter.length > 0 && !scopeFilter.includes('all')
          ? scopeFilter[0]
          : undefined,
      owner:
        ownerFilter.length > 0 && !ownerFilter.includes('all')
          ? Number(ownerFilter[0])
          : undefined,
      tag_mode: enableTagMode,
      id_sort: idSort,
      ...sortParams,
      p: pagination.pageIndex + 1,
      page_size: pagination.pageSize,
    }),
    queryFn: async () => {
      const commonParams = {
        group:
          groupFilter.length > 0 && !groupFilter.includes('all')
            ? groupFilter[0]
            : undefined,
        status:
          statusFilter.length > 0 && !statusFilter.includes('all')
            ? statusFilter[0]
            : undefined,
        type:
          typeFilter.length > 0 && !typeFilter.includes('all')
            ? Number(typeFilter[0])
            : undefined,
        scope:
          scopeFilter.length > 0 && !scopeFilter.includes('all')
            ? scopeFilter[0]
            : undefined,
        owner:
          ownerFilter.length > 0 && !ownerFilter.includes('all')
            ? Number(ownerFilter[0])
            : undefined,
        tag_mode: enableTagMode,
        id_sort: idSort,
        ...sortParams,
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
      }
      if (shouldSearch) {
        return searchChannels({
          keyword: globalFilter,
          model: modelFilter,
          ...commonParams,
        })
      } else {
        return getChannels(commonParams)
      }
    },
    placeholderData: (previousData) => previousData,
  })

  // Apply tag aggregation if tag mode is enabled
  const channels = useMemo(() => {
    const rawChannels = data?.data?.items || []

    if (enableTagMode && rawChannels.length > 0) {
      return aggregateChannelsByTag(rawChannels)
    }

    return rawChannels
  }, [data, enableTagMode])

  const totalCount = data?.data?.total || 0
  const typeCounts = data?.data?.type_counts

  // Columns configuration
  const columns = useChannelsColumns()

  // React Table instance
  const table = useReactTable({
    data: channels,
    columns,
    pageCount: Math.ceil(totalCount / pagination.pageSize),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
      expanded,
      globalFilter,
    },
    enableRowSelection: (row: Row<Channel>) => !isTagAggregateRow(row.original),
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange,
    onExpandedChange: setExpanded,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row: Channel & { children?: Channel[] }) => row.children,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  })

  // Ensure page is in range when total count changes
  const pageCount = table.getPageCount()
  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  // Prepare filter options from existing channel types only.
  const typeFilterOptions = useMemo(() => {
    const counts = typeCounts || {}
    const typeIds = Object.entries(counts)
      .map(([type, count]) => ({
        type: Number(type),
        count: Number(count) || 0,
      }))
      .filter((item) => item.type > 0 && item.count > 0)
      .sort((a, b) => {
        const labelA = t(getChannelTypeLabel(a.type))
        const labelB = t(getChannelTypeLabel(b.type))
        return labelA.localeCompare(labelB)
      })

    const selectedType = typeFilter.find((value) => value !== 'all')
    if (selectedType) {
      const selectedTypeId = Number(selectedType)
      const alreadyIncluded = typeIds.some(
        (item) => item.type === selectedTypeId
      )
      if (selectedTypeId > 0 && !alreadyIncluded) {
        typeIds.push({
          type: selectedTypeId,
          count: Number(counts[selectedType]) || 0,
        })
      }
    }

    const totalTypes = Object.values(counts).reduce(
      (sum, count) => sum + (Number(count) || 0),
      0
    )

    return [
      {
        label: 'All Types',
        value: 'all',
        count: totalTypes,
      },
      ...typeIds.map((item) => {
        const iconName = getChannelTypeIcon(item.type)
        return {
          label: getChannelTypeLabel(item.type),
          value: String(item.type),
          count: item.count,
          iconNode: getLobeIcon(`${iconName}.Color`, 16),
        }
      }),
    ]
  }, [t, typeCounts, typeFilter])

  const groupFilterOptions = [
    { label: t('All Groups'), value: 'all' },
    ...groupOptions,
  ]

  const isSuperAdmin = (currentUser?.role ?? 0) >= 100

  const scopeFilterOptions = useMemo(() => {
    const options = [
      { label: t('All'), value: 'all' },
      { label: t('Public'), value: 'public' },
      { label: t('Private'), value: 'private' },
    ]
    if (isSuperAdmin) {
      options.push({ label: t('Test'), value: 'test' })
    }
    return options
  }, [isSuperAdmin, t])

  const ownerFilterOptions = useMemo(() => {
    const options = [
      { label: t('All Owners'), value: 'all' },
    ]
    const owners = ownersData?.data
    if (owners) {
      for (const o of owners) {
        options.push({ label: o.username, value: String(o.id) })
      }
    }
    return options
  }, [ownersData, t])

  // Build filters list based on myChannelsOnly mode
  const filters = myChannelsOnly
    ? [
        {
          columnId: 'status',
          title: t('Status'),
          options: [...CHANNEL_STATUS_OPTIONS],
          singleSelect: true,
        },
        {
          columnId: 'type',
          title: t('Type'),
          options: typeFilterOptions,
          singleSelect: true,
        },
        {
          columnId: 'group',
          title: t('Group'),
          options: groupFilterOptions,
          singleSelect: true,
        },
        {
          columnId: 'scope',
          title: t('Channel Type'),
          options: [
            { label: t('All'), value: 'all' },
            { label: t('Public'), value: 'public' },
            { label: t('Private'), value: 'private' },
          ],
          singleSelect: true,
        },
      ]
    : [
        {
          columnId: 'status',
          title: t('Status'),
          options: [...CHANNEL_STATUS_OPTIONS],
          singleSelect: true,
        },
        {
          columnId: 'type',
          title: t('Type'),
          options: typeFilterOptions,
          singleSelect: true,
        },
        {
          columnId: 'group',
          title: t('Group'),
          options: groupFilterOptions,
          singleSelect: true,
        },
        {
          columnId: 'scope',
          title: t('Channel Type'),
          options: scopeFilterOptions,
          singleSelect: true,
        },
        {
          columnId: 'owner_username',
          title: t('Owner'),
          options: ownerFilterOptions,
          singleSelect: true,
        },
      ]

  return (
    <>
      {myChannelsOnly && (
        <div className='flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'>
          <Info className='h-4 w-4 shrink-0' />
          <span>{t('This view shows public channels and your private channels.')}</span>
        </div>
      )}
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No Channels Found')}
        emptyDescription={t(
          'No channels available. Create your first channel to get started.'
        )}
        skeletonKeyPrefix='channel-skeleton'
        applyHeaderSize
        toolbarProps={{
          searchPlaceholder: t('Filter by name, ID, or key...'),
          additionalSearch: (
            <Input
              placeholder={t('Filter by model...')}
              value={modelFilterInput}
              onChange={(e) => setModelFilterInput(e.target.value)}
              className='w-full sm:w-[150px] lg:w-[180px]'
            />
          ),
          filters,
        }}
        getRowClassName={(row, { isMobile }) =>
          isDisabledChannelRow(row.original)
            ? isMobile
              ? DISABLED_ROW_MOBILE
              : DISABLED_ROW_DESKTOP
            : undefined
        }
        bulkActions={!myChannelsOnly && <DataTableBulkActions table={table} />}
      />
    </>
  )
}
