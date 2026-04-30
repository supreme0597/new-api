import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API } from '../../helpers/api';
import { showError } from '../../helpers/utils';
import {
  Card,
  Table,
  Spin,
  Tag,
  Button,
  Select,
  Space,
  Typography,
  Avatar,
  DatePicker,
} from '@douyinfe/semi-ui';
import {
  PieChart,
  TrendingUp,
  Users,
  Layers,
  Activity,
  Wallet,
  Zap,
} from 'lucide-react';
import { VChart } from '@visactor/react-vchart';
import { renderNumber } from '../../helpers/render';
import { CARD_PROPS, CHART_CONFIG } from '../../constants/dashboard.constants';

const { Title, Text } = Typography;

// 颜色列表（与数据看板 baseColors 完全一致）
const SOURCE_COLORS = [
  '#1664FF', '#1AC6FF', '#FF8A00', '#3CC780', '#7442D4',
  '#FFC400', '#304D77', '#B48DEB', '#009488', '#FF7DDA',
];

// 分组卡片颜色（与数据看板 StatsCards 一致）
const STAT_CARD_COLORS = ['bg-blue-50', 'bg-green-50'];

// 格式化大数字
function formatLargeNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 创建分组标题（与数据看板 createSectionTitle 一致）
function createSectionTitle(Icon, text) {
  return (
    <div className='flex items-center gap-2'>
      <Icon size={16} />
      {text}
    </div>
  );
}

// VChart 饼图组件
function SourcePieChart({ data, title, colorKey = 'call_count' }) {
  const { t } = useTranslation();

  const formatValue = useCallback((val) => {
    return colorKey === 'token_count' ? formatLargeNumber(val) : renderNumber(val);
  }, [colorKey]);

  const chartData = useMemo(() => {
    return (data || []).map((d, i) => ({
      type: d.source,
      value: d[colorKey] || 0,
      color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }));
  }, [data, colorKey]);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  const spec = useMemo(() => ({
    type: 'pie',
    data: [{ id: 'id0', values: chartData }],
    outerRadius: 0.75,
    innerRadius: 0.5,
    padAngle: 0.6,
    valueField: 'value',
    categoryField: 'type',
    pie: {
      style: { cornerRadius: 8 },
      state: {
        hover: { outerRadius: 0.8, stroke: '#000', lineWidth: 1 },
        selected: { outerRadius: 0.8, stroke: '#000', lineWidth: 1 },
      },
    },
    title: {
      visible: true,
      text: title,
      subtext: `${t('总计')}：${formatValue(total)}`,
    },
    legends: {
      visible: true,
      orient: 'left',
      item: {
        label: {
          formatMethod: (text) => {
            const item = chartData.find(d => d.type === text);
            if (item) {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
              return `${text}  ${pct}%`;
            }
            return text;
          },
        },
      },
    },
    label: {
      visible: true,
      style: { fontSize: 11, lineHeight: 16 },
      content: (datum) => {
        const pct = total > 0 ? ((datum.value / total) * 100).toFixed(1) : '0.0';
        return `${datum.type}\n${pct}%`;
      },
    },
    tooltip: {
      mark: {
        content: [
          { key: (datum) => datum['type'], value: (datum) => `${formatValue(datum['value'])} (${total > 0 ? ((datum.value / total) * 100).toFixed(1) : '0.0'}%)` },
        ],
      },
    },
    color: {
      specified: chartData.reduce((map, d) => {
        map[d.type] = d.color;
        return map;
      }, {}),
    },
  }), [chartData, title, total, t]);

  if (!data || data.length === 0) {
    return (
      <div className='flex items-center justify-center h-64 text-gray-400'>
        {t('暂无数据')}
      </div>
    );
  }

  return <VChart spec={spec} option={CHART_CONFIG} />;
}

// VChart 折线图组件
function SourceTrendChart({ data, sources, range, granularity }) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const formatTime = (time) => {
      if (!time) return time;
      const normalized = time.replace('T', ' ').replace('Z', '');
      const parts = normalized.split(' ');
      const datePart = parts[0];
      const dateWithoutYear = datePart.slice(5);
      if (parts[1] && granularity === 'hour') {
        return `${dateWithoutYear} ${parts[1].slice(0, 5)}`;
      }
      return dateWithoutYear;
    };
    const result = [];
    data.forEach((d) => {
      result.push({
        Time: formatTime(d.time),
        Source: d.source,
        Count: d.call_count || 0,
      });
    });
    result.sort((a, b) => a.Time.localeCompare(b.Time));
    return result;
  }, [data, granularity]);

  const spec = useMemo(() => {
    const colorMap = {};
    sources.forEach((s, i) => {
      colorMap[s] = SOURCE_COLORS[i % SOURCE_COLORS.length];
    });

    return {
      type: 'line',
      data: [{ id: 'lineData', values: chartData }],
      xField: 'Time',
      yField: 'Count',
      axes: [
        { orient: 'bottom', type: 'band', label: { autoHide: true, autoRotate: true, formatMethod: (val) => val } },
        { orient: 'left', label: { autoHide: true } },
      ],
      seriesField: 'Source',
      legends: { visible: true, selectMode: 'single' },
      title: { visible: false },
      tooltip: {
        mark: {
          content: [{ key: (datum) => datum['Source'], value: (datum) => renderNumber(datum['Count']) }],
        },
        dimension: {
          content: [{ key: (datum) => datum['Source'], value: (datum) => datum['Count'] || 0 }],
          updateContent: (array) => {
            array.sort((a, b) => b.value - a.value);
            let sum = 0;
            array.forEach((item) => {
              const value = parseFloat(item.value) || 0;
              sum += value;
              item.value = renderNumber(value);
            });
            array.unshift({ key: t('总计'), value: renderNumber(sum) });
            return array;
          },
        },
      },
      crosshair: { visible: true, line: { type: 'line', style: { stroke: '#999', lineDash: [4, 4] } } },
      color: { specified: colorMap },
    };
  }, [chartData, sources, t]);

  if (!data || data.length === 0) {
    return (
      <div className='flex items-center justify-center h-64 text-gray-400'>
        {t('暂无数据')}
      </div>
    );
  }

  return <VChart spec={spec} option={CHART_CONFIG} />;
}

const ChannelAnalytics = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [sources, setSources] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [customRange, setCustomRange] = useState([
    new Date(Date.now() - 7 * 86400000),
    new Date(),
  ]);

  // 时间范围转换
  const getTimestamps = useCallback((r) => {
    if (r === 'custom' && customRange && customRange[0] && customRange[1]) {
      return {
        startTimestamp: Math.floor(customRange[0].getTime() / 1000),
        endTimestamp: Math.floor(customRange[1].getTime() / 1000),
      };
    }
    const now = Math.floor(Date.now() / 1000);
    let start = 0;
    switch (r) {
      case '1d': start = now - 86400; break;
      case '7d': start = now - 7 * 86400; break;
      case '30d': start = now - 30 * 86400; break;
      default: start = now - 30 * 86400;
    }
    return { startTimestamp: start, endTimestamp: now };
  }, [customRange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startTimestamp, endTimestamp } = getTimestamps(range);
      const [overviewRes, sourcesRes, trendRes] = await Promise.all([
        API.get('/api/channel-analytics/overview', { params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp } }),
        API.get('/api/channel-analytics/sources', { params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp } }),
        API.get('/api/channel-analytics/trend', { params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp, granularity } }),
      ]);

      if (overviewRes.data.success) setOverview(overviewRes.data.data);
      if (sourcesRes.data.success) setSources(sourcesRes.data.data || []);
      if (trendRes.data.success) setTrendData(trendRes.data.data || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, granularity, getTimestamps]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 自动设置粒度
  useEffect(() => {
    if (range === '1d') setGranularity('hour');
    else if (range === '7d') setGranularity('day');
    else if (range === '30d') setGranularity('day');
  }, [range]);

  // 来源名称列表（用于图表）
  const sourceNames = sources.map(s => s.source);
  const sortedSources = [...sources].sort((a, b) => b.call_count - a.call_count);

  // 分组统计数据（与数据看板 StatsCards 一致的结构）
  const groupedStatsData = useMemo(() => [
    {
      title: createSectionTitle(Wallet, t('来源概况')),
      color: STAT_CARD_COLORS[0],
      items: [
        {
          title: t('来源总数'),
          value: overview?.source_count || 0,
          icon: <Layers size={16} />,
          avatarColor: 'blue',
        },
        {
          title: t('总调用次数'),
          value: formatLargeNumber(overview?.total_calls || 0),
          icon: <Activity size={16} />,
          avatarColor: 'purple',
        },
      ],
    },
    {
      title: createSectionTitle(Zap, t('资源消耗')),
      color: STAT_CARD_COLORS[1],
      items: [
        {
          title: t('总 Token 消耗'),
          value: formatLargeNumber(overview?.total_tokens || 0),
          icon: <TrendingUp size={16} />,
          avatarColor: 'green',
          subtitle: overview?.all_tokens
            ? `${t('全部渠道')}: ${formatLargeNumber(overview.all_tokens)}${overview?.untagged_tokens ? ` · ${t('无来源')}: ${formatLargeNumber(overview.untagged_tokens)}` : ''}${overview?.test_channel_tokens ? ` · ${t('测试')}: ${formatLargeNumber(overview.test_channel_tokens)}` : ''}`
            : undefined,
        },
        {
          title: t('活跃用户数'),
          value: renderNumber(overview?.active_users || 0),
          icon: <Users size={16} />,
          avatarColor: 'orange',
        },
      ],
    },
  ], [overview, t]);

  const columns = [
    {
      title: t('排名'),
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (text, record, index) => {
        if (index < 3) {
          return <span style={{ fontWeight: 700, color: '#ff8a00' }}>{index + 1}</span>;
        }
        return <span style={{ color: 'var(--semi-color-text-2)' }}>{index + 1}</span>;
      },
    },
    {
      title: t('来源'),
      dataIndex: 'source',
      key: 'source',
      render: (text) => <Tag color="cyan">{text}</Tag>,
    },
    {
      title: t('模型数'),
      dataIndex: 'model_count',
      key: 'model_count',
      render: (text) => renderNumber(text),
    },
    {
      title: t('活跃用户'),
      dataIndex: 'active_users',
      key: 'active_users',
      render: (text) => <span style={{ fontWeight: 600, color: '#1664ff' }}>{renderNumber(text)}</span>,
    },
    {
      title: t('调用次数'),
      dataIndex: 'call_count',
      key: 'call_count',
      sorter: (a, b) => a.call_count - b.call_count,
      render: (text) => renderNumber(text),
    },
    {
      title: t('Token 消耗'),
      dataIndex: 'token_count',
      key: 'token_count',
      sorter: (a, b) => a.token_count - b.token_count,
      render: (text) => formatLargeNumber(text),
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <Button
          theme="borderless"
          type="primary"
          size="small"
          onClick={() => navigate(`/channel-analytics/${encodeURIComponent(record.source)}`)}
        >
          {t('查看详情')} →
        </Button>
      ),
    },
  ];

  return (
    <div className='h-full px-12'>
      <Spin spinning={loading}>
        {/* 头部 - 与数据看板 DashboardHeader 风格一致 */}
        <div className='flex items-center justify-between mb-4'>
          <div>
            <h2 className='text-2xl font-semibold text-gray-800'>{t('用量统计')}</h2>
            <Text type="tertiary" size="small">
              {range === 'custom'
                ? `${t('统计时间')}：${customRange[0]?.toLocaleString()} ~ ${customRange[1]?.toLocaleString()} · ${granularity === 'hour' ? t('按小时') : granularity === 'week' ? t('按周') : t('按天')}`
                : `${t('统计时间')}：${range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天')} · ${granularity === 'hour' ? t('按小时') : granularity === 'week' ? t('按周') : t('按天')}`}
            </Text>
          </div>
          <div className='flex items-center gap-3'>
            <Select value={range} onChange={setRange} style={{ minWidth: 120 }}>
              <Select.Option value="1d">{t('近 1 天')}</Select.Option>
              <Select.Option value="7d">{t('近 7 天')}</Select.Option>
              <Select.Option value="30d">{t('近 30 天')}</Select.Option>
              <Select.Option value="custom">{t('自定义')}</Select.Option>
            </Select>
            {range === 'custom' && (
              <DatePicker
                type="dateTimeRange"
                value={customRange}
                onChange={(dates) => setCustomRange(dates)}
                style={{ width: 280 }}
              />
            )}
            <Select value={granularity} onChange={setGranularity} style={{ minWidth: 80 }}>
              <Select.Option value="hour">{t('小时')}</Select.Option>
              <Select.Option value="day">{t('天')}</Select.Option>
              <Select.Option value="week">{t('周')}</Select.Option>
            </Select>
          </div>
        </div>

        {/* 分组统计卡片 - 与数据看板 StatsCards 完全一致的风格 */}
        <div className='mb-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {groupedStatsData.map((group, idx) => (
              <Card
                key={idx}
                {...CARD_PROPS}
                className={`${group.color} border-0 !rounded-2xl w-full`}
                title={group.title}
              >
                <div className='space-y-4'>
                  {group.items.map((item, itemIdx) => (
                    <div key={itemIdx} className='flex items-center justify-between'>
                      <div className='flex items-center'>
                        <Avatar className='mr-3' size='small' color={item.avatarColor}>
                          {item.icon}
                        </Avatar>
                        <div>
                          <div className='text-xs text-gray-500'>{item.title}</div>
                          <div className='text-lg font-semibold'>{item.value}</div>
                        </div>
                      </div>
                      {item.subtitle && (
                        <div className='text-xs text-gray-400 max-w-[200px] text-right'>{item.subtitle}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* 来源对比 - 独立卡片 */}
        <Card
          {...CARD_PROPS}
          className='!rounded-2xl !mb-4'
          title={
            <div className='flex items-center gap-2'>
              <PieChart size={16} />
              {t('来源对比')}
            </div>
          }
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={columns}
            dataSource={sortedSources}
            rowKey="source"
            pagination={false}
            size="small"
            empty={t('暂无数据')}
          />
        </Card>

        {/* 调用量占比 + Token 占比 - 一行2列 */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <Card
            {...CARD_PROPS}
            className='!rounded-2xl'
            title={
              <div className='flex items-center gap-2'>
                <PieChart size={16} />
                {t('调用量占比')}
              </div>
            }
          >
            <div className='h-80 p-2'>
              <SourcePieChart
                data={sortedSources.slice(0, 8)}
                title={t('各来源调用量占比')}
                colorKey="call_count"
              />
            </div>
          </Card>
          <Card
            {...CARD_PROPS}
            className='!rounded-2xl'
            title={
              <div className='flex items-center gap-2'>
                <PieChart size={16} />
                {t('Token 占比')}
              </div>
            }
          >
            <div className='h-80 p-2'>
              <SourcePieChart
                data={sortedSources.slice(0, 8)}
                title={t('各来源 Token 消耗占比')}
                colorKey="token_count"
              />
            </div>
          </Card>
        </div>

        {/* 使用趋势 - 独立卡片 */}
        <Card
          {...CARD_PROPS}
          className='!rounded-2xl !mb-4'
          title={
            <div className='flex items-center gap-2'>
              <TrendingUp size={16} />
              {t('使用趋势')}
            </div>
          }
        >
          <div className='h-72 p-2'>
            <SourceTrendChart
              data={trendData}
              sources={sourceNames}
              range={range}
              granularity={granularity}
            />
          </div>
        </Card>
      </Spin>
    </div>
  );
};

export default ChannelAnalytics;
