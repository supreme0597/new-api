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
} from '@douyinfe/semi-ui';
import {
  PieChart,
  TrendingUp,
  Users,
  Layers,
  Activity,
} from 'lucide-react';
import { VChart } from '@visactor/react-vchart';
import { renderNumber, renderQuota } from '../../helpers/render';
import { CARD_PROPS, CHART_CONFIG } from '../../constants/dashboard.constants';

const { Title, Text } = Typography;

// 颜色列表（与数据看板 baseColors 完全一致）
const SOURCE_COLORS = [
  '#1664FF', '#1AC6FF', '#FF8A00', '#3CC780', '#7442D4',
  '#FFC400', '#304D77', '#B48DEB', '#009488', '#FF7DDA',
];

// 格式化大数字
function formatLargeNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 统计卡片组件（与数据看板 StatsCards 完全一致的样式）
function StatCard({ title, value, avatarColor, icon }) {
  return (
    <Card
      {...CARD_PROPS}
      className='!rounded-2xl w-full'
      title={
        <div className='flex items-center gap-2'>
          <Avatar size='small' color={avatarColor}>
            {icon}
          </Avatar>
          <span className='text-xs text-gray-500'>{title}</span>
        </div>
      }
    >
      <div className='text-2xl font-semibold'>{value}</div>
    </Card>
  );
}

// VChart 饼图组件
function SourcePieChart({ data, title, colorKey = 'call_count' }) {
  const { t } = useTranslation();

  // 格式化数值：与表格列保持一致
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
      <Card {...CARD_PROPS} className='!rounded-2xl'>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)' }}>
          {t('暂无数据')}
        </div>
      </Card>
    );
  }

  return (
    <Card {...CARD_PROPS} className='!rounded-2xl' bodyStyle={{ padding: 0 }}>
      <div className='h-80 p-2'>
        <VChart spec={spec} option={CHART_CONFIG} />
      </div>
    </Card>
  );
}

// VChart 折线图组件
function SourceTrendChart({ data, sources, range, granularity }) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    // 时间格式化：去掉年份，day/week 只显示 MM-DD，hour 显示 MM-DD HH:mm
    // 兼容两种格式：MySQL '2026-04-25 15:00' 和 ISO '2026-04-25T15:00:00Z'
    const formatTime = (time) => {
      if (!time) return time;
      // 统一替换 T 为空格，去掉 Z 和尾部秒数
      const normalized = time.replace('T', ' ').replace('Z', '');
      const parts = normalized.split(' ');
      const datePart = parts[0]; // YYYY-MM-DD
      const dateWithoutYear = datePart.slice(5); // MM-DD
      if (parts[1] && (granularity === 'hour')) {
        return `${dateWithoutYear} ${parts[1].slice(0, 5)}`; // MM-DD HH:mm
      }
      return dateWithoutYear; // MM-DD
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
      title: {
        visible: true,
        text: t('各来源使用次数趋势'),
        subtext: `${t('范围')}：${range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天')} · ${t('粒度')}：${granularity === 'hour' ? t('小时') : granularity === 'week' ? t('周') : t('天')}`,
      },
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
      color: { specified: colorMap },
    };
  }, [chartData, sources, range, granularity, t]);

  if (!data || data.length === 0) {
    return (
      <Card {...CARD_PROPS} className='!rounded-2xl'>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)' }}>
          {t('暂无数据')}
        </div>
      </Card>
    );
  }

  return (
    <Card {...CARD_PROPS} className='!rounded-2xl' bodyStyle={{ padding: 0 }}>
      <div className='h-80 p-2'>
        <VChart spec={spec} option={CHART_CONFIG} />
      </div>
    </Card>
  );
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

  // 时间范围转换
  const getTimestamps = useCallback((r) => {
    const now = Math.floor(Date.now() / 1000);
    let start = 0;
    switch (r) {
      case '1d': start = now - 86400; break;
      case '7d': start = now - 7 * 86400; break;
      case '30d': start = now - 30 * 86400; break;
      default: start = now - 30 * 86400;
    }
    return { startTimestamp: start, endTimestamp: now };
  }, []);

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
    else setGranularity('day');
  }, [range]);

  // 来源名称列表（用于图表）
  const sourceNames = sources.map(s => s.source);

  // 排序后的来源
  const sortedSources = [...sources].sort((a, b) => b.call_count - a.call_count);

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
          onClick={() => navigate(`/console/channel-analytics/${encodeURIComponent(record.source)}`)}
        >
          {t('查看详情')} →
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 16px' }}>
      <Spin spinning={loading}>
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title heading={4} style={{ margin: 0 }}>{t('用量统计')}</Title>
            <Text type="tertiary" size="small">
              {t('统计时间')}：{range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天')} · {granularity === 'hour' ? t('按小时') : granularity === 'week' ? t('按周') : t('按天')}
            </Text>
          </div>
          <Space>
            <Select value={range} onChange={setRange} style={{ minWidth: 120 }}>
              <Select.Option value="1d">{t('近 1 天')}</Select.Option>
              <Select.Option value="7d">{t('近 7 天')}</Select.Option>
              <Select.Option value="30d">{t('近 30 天')}</Select.Option>
            </Select>
            <Select value={granularity} onChange={setGranularity} style={{ minWidth: 80 }}>
              <Select.Option value="hour">{t('小时')}</Select.Option>
              <Select.Option value="day">{t('天')}</Select.Option>
              <Select.Option value="week">{t('周')}</Select.Option>
            </Select>
          </Space>
        </div>

        {/* 概览卡片 - 与数据看板 StatsCards 完全一致的风格 */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5'>
          <StatCard
            title={t('来源总数')}
            value={overview?.source_count || 0}
            avatarColor='blue'
            icon={<Layers size={16} />}
          />
          <StatCard
            title={t('总调用次数')}
            value={formatLargeNumber(overview?.total_calls || 0)}
            avatarColor='indigo'
            icon={<Activity size={16} />}
          />
          <StatCard
            title={t('总 Token 消耗')}
            value={formatLargeNumber(overview?.total_tokens || 0)}
            avatarColor='green'
            icon={<TrendingUp size={16} />}
          />
          <StatCard
            title={t('活跃用户数')}
            value={renderNumber(overview?.active_users || 0)}
            avatarColor='orange'
            icon={<Users size={16} />}
          />
        </div>

        {/* 来源对比表格 */}
        <Card {...CARD_PROPS} className='!rounded-2xl mb-4'>
          <Table
            columns={columns}
            dataSource={sortedSources}
            rowKey="source"
            pagination={false}
            size="small"
            empty={t('暂无数据')}
          />
        </Card>

        {/* 饼图 */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4'>
          <SourcePieChart
            data={sortedSources.slice(0, 8)}
            title={t('各来源调用量占比')}
            colorKey="call_count"
          />
          <SourcePieChart
            data={sortedSources.slice(0, 8)}
            title={t('各来源 Token 消耗占比')}
            colorKey="token_count"
          />
        </div>

        {/* 趋势图 */}
        <SourceTrendChart
          data={trendData}
          sources={sourceNames}
          range={range}
          granularity={granularity}
        />

      </Spin>
    </div>
  );
};

export default ChannelAnalytics;
