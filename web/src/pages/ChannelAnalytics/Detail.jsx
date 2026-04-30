import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { API } from '../../helpers/api';
import { showError } from '../../helpers/utils';
import {
  Card,
  Table,
  Spin,
  Select,
  Typography,
  Breadcrumb,
  IconButton,
  DatePicker,
  Avatar,
  Tabs,
  TabPane,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import {
  RefreshCw,
  PieChart,
  TrendingUp,
  Users,
  Activity,
  Zap,
} from 'lucide-react';
import { renderNumber } from '../../helpers/render';
import { CARD_PROPS, CHART_CONFIG } from '../../constants/dashboard.constants';

const { Title, Text } = Typography;

function formatLargeNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 颜色列表（与数据看板 baseColors 一致）
const MODEL_COLORS = [
  '#1664FF', '#1AC6FF', '#FF8A00', '#3CC780', '#7442D4',
  '#FFC400', '#304D77', '#B48DEB', '#009488', '#FF7DDA',
];


// VChart 饼图组件（模型占比）
function ModelPieChart({ data, title, colorKey = 'call_count' }) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    return (data || []).map((d, i) => ({
      type: d.model_name,
      value: d[colorKey] || 0,
      color: MODEL_COLORS[i % MODEL_COLORS.length],
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
      subtext: `${t('总计')}：${formatLargeNumber(total)}`,
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
          { key: (datum) => datum['type'], value: (datum) => `${renderNumber(datum['value'])} (${total > 0 ? ((datum.value / total) * 100).toFixed(1) : '0.0'}%)` },
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

// VChart 多模型折线图组件
function ModelTrendChart({ data, models, metric, granularity }) {
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
        Model: d.model_name,
        Count: metric === 'call_count' ? d.call_count : d.token_count,
      });
    });
    result.sort((a, b) => a.Time.localeCompare(b.Time));
    return result;
  }, [data, metric, granularity]);

  const spec = useMemo(() => {
    const colorMap = {};
    models.forEach((m, i) => {
      colorMap[m] = MODEL_COLORS[i % MODEL_COLORS.length];
    });

    return {
      type: 'line',
      data: [{ id: 'lineData', values: chartData }],
      xField: 'Time',
      yField: 'Count',
      axes: [
        { orient: 'bottom', type: 'band', label: { autoHide: true, autoRotate: true, formatMethod: (val) => val } },
        { orient: 'left', label: { autoHide: true, formatMethod: (val) => formatLargeNumber(val) }, nice: true },
      ],
      seriesField: 'Model',
      legends: { visible: true, selectMode: 'single' },
      title: { visible: false },
      tooltip: {
        mark: {
          content: [{ key: (datum) => datum['Model'], value: (datum) => renderNumber(datum['Count']) }],
        },
        dimension: {
          content: [{ key: (datum) => datum['Model'], value: (datum) => datum['Count'] || 0 }],
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
  }, [chartData, models, t]);

  if (!data || data.length === 0) {
    return (
      <div className='flex items-center justify-center h-64 text-gray-400'>
        {t('暂无数据')}
      </div>
    );
  }

  return <VChart spec={spec} option={CHART_CONFIG} />;
}

const ChannelAnalyticsDetail = () => {
  const { t } = useTranslation();
  const { source } = useParams();
  const navigate = useNavigate();
  const decodedSource = decodeURIComponent(source || '');

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [modelStats, setModelStats] = useState([]);
  const [modelTrendData, setModelTrendData] = useState([]);
  const [users, setUsers] = useState([]);
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [customRange, setCustomRange] = useState([
    new Date(Date.now() - 7 * 86400000),
    new Date(),
  ]);
  const [metric, setMetric] = useState('token_count');
  const [topN, setTopN] = useState(10);
  const [selectedModels, setSelectedModels] = useState([]);
  const [allModels, setAllModels] = useState([]);

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
    if (!decodedSource) return;
    setLoading(true);
    try {
      const { startTimestamp, endTimestamp } = getTimestamps(range);
      const [detailRes, modelsRes, modelTrendRes, usersRes] = await Promise.all([
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
        }),
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}/models`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
        }),
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}/model-trend`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp, granularity },
        }),
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}/users`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp, limit: topN },
        }),
      ]);

      if (detailRes.data.success) setDetail(detailRes.data.data);
      if (modelsRes.data.success) {
        const stats = modelsRes.data.data || [];
        setModelStats(stats);
        const modelNames = stats.map(s => s.model_name);
        setAllModels(modelNames);
        if (selectedModels.length === 0) {
          setSelectedModels(modelNames);
        }
      }
      if (modelTrendRes.data.success) setModelTrendData(modelTrendRes.data.data || []);
      if (usersRes.data.success) setUsers(usersRes.data.data || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [decodedSource, range, granularity, topN, getTimestamps]);

  const loadUsers = useCallback(async () => {
    if (!decodedSource) return;
    try {
      const { startTimestamp, endTimestamp } = getTimestamps(range);
      const params = { start_timestamp: startTimestamp, end_timestamp: endTimestamp, limit: topN };
      if (selectedModels.length === 1) {
        params.model_name = selectedModels[0];
      }
      const usersRes = await API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}/users`, { params });
      if (usersRes.data.success) setUsers(usersRes.data.data || []);
    } catch (e) {
      showError(e.message);
    }
  }, [decodedSource, range, topN, selectedModels, getTimestamps]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (range === '1d') setGranularity('hour');
    else if (range === '7d') setGranularity('day');
    else if (range === '30d') setGranularity('day');
  }, [range]);

  const rangeLabel = range === 'custom'
    ? `${customRange[0]?.toLocaleString()} ~ ${customRange[1]?.toLocaleString()}`
    : range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天');

  // 过滤趋势数据
  const filteredTrendData = useMemo(() => {
    if (!modelTrendData || modelTrendData.length === 0) return [];
    if (selectedModels.length === 0) return modelTrendData;
    return modelTrendData.filter(d => selectedModels.includes(d.model_name));
  }, [modelTrendData, selectedModels]);

  // 统计卡片数据（每个指标独立卡片）
  const statsCards = useMemo(() => [
    {
      title: t('调用次数'),
      value: detail ? renderNumber(detail.call_count) : 0,
      icon: <Activity size={16} />,
      avatarColor: 'blue',
      bgColor: 'bg-blue-50',
    },
    {
      title: t('模型数'),
      value: detail?.model_count || 0,
      icon: <Zap size={16} />,
      avatarColor: 'purple',
      bgColor: 'bg-purple-50',
    },
    {
      title: t('Token 消耗'),
      value: detail ? formatLargeNumber(detail.token_count) : 0,
      icon: <TrendingUp size={16} />,
      avatarColor: 'green',
      bgColor: 'bg-green-50',
    },
    {
      title: t('活跃用户'),
      value: detail ? renderNumber(detail.active_users) : 0,
      icon: <Users size={16} />,
      avatarColor: 'orange',
      bgColor: 'bg-orange-50',
    },
  ], [detail, t]);

  const userColumns = [
    {
      title: t('排名'),
      key: 'rank',
      width: 50,
      render: (_, __, index) => (
        <span style={{ fontWeight: index < 3 ? 700 : 400, color: index < 3 ? '#ff8a00' : 'var(--semi-color-text-2)' }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: t('用户'),
      dataIndex: 'username',
      key: 'username',
      render: (text) => (
        <div className='flex items-center gap-2'>
          <div className='w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold'
            style={{ background: 'var(--semi-color-primary-light-default)', color: 'var(--semi-color-primary)' }}>
            {text?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span className='font-medium'>{text}</span>
        </div>
      ),
    },
    {
      title: t('调用次数'),
      dataIndex: 'call_count',
      key: 'call_count',
      render: (text) => <span className='font-semibold'>{renderNumber(text)}</span>,
    },
    {
      title: t('Token'),
      dataIndex: 'token_count',
      key: 'token_count',
      render: (text) => formatLargeNumber(text),
    },
  ];

  return (
    <div className='h-full px-12'>
      <Spin spinning={loading}>
        {/* 面包屑 */}
        <Breadcrumb className='mb-4'>
          <Breadcrumb.Item>
            <a onClick={() => navigate('/channel-analytics')}>{t('用量统计')}</a>
          </Breadcrumb.Item>
          <Breadcrumb.Item>{decodedSource}</Breadcrumb.Item>
        </Breadcrumb>

        {/* 头部 - 与数据看板 DashboardHeader 风格一致 */}
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-4'>
            <div className='w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white'
              style={{ background: 'linear-gradient(135deg, #1664ff, #69b1ff)' }}>
              {decodedSource?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className='text-2xl font-semibold text-gray-800'>{decodedSource}</h2>
              <Text type="tertiary" size="small">
                {detail ? `${detail.model_count} ${t('个模型')} · ${renderNumber(detail.call_count)} ${t('次调用')} · ${formatLargeNumber(detail.token_count)} Token · ${renderNumber(detail.active_users)} ${t('个活跃用户')}（${rangeLabel}）` : ''}
              </Text>
            </div>
          </div>
          <div className='flex items-center gap-3'>
            {/* 选择模型下拉框 - 时间范围左侧 */}
            {allModels.length > 0 && (
              <Select
                multiple
                filter
                value={selectedModels}
                onChange={setSelectedModels}
                style={{ minWidth: 240 }}
                maxTagCount={2}
                maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                placeholder={t('选择模型')}
              >
                {allModels.map((modelName, i) => (
                  <Select.Option key={modelName} value={modelName}>
                    <span className='flex items-center gap-1.5'>
                      <span
                        className='inline-block w-2 h-2 rounded-full flex-shrink-0'
                        style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                      />
                      <span>{modelName}</span>
                    </span>
                  </Select.Option>
                ))}
              </Select>
            )}
            <div className='flex items-center gap-1'>
              <Text type="tertiary" size="small">{t('时间范围')}</Text>
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
            </div>
            <div className='flex items-center gap-1'>
              <Text type="tertiary" size="small">{t('粒度')}</Text>
              <Select size="small" value={granularity} onChange={setGranularity} style={{ minWidth: 80 }}>
                <Select.Option value="hour">{t('小时')}</Select.Option>
                <Select.Option value="day">{t('天')}</Select.Option>
                <Select.Option value="week">{t('周')}</Select.Option>
              </Select>
            </div>
            <IconButton icon={<RefreshCw size={16} />} onClick={loadData} title={t('刷新数据')} />
          </div>
        </div>

        {/* 统计卡片 - 每个指标独立展示 */}
        <div className='mb-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            {statsCards.map((card, idx) => (
              <Card
                key={idx}
                {...CARD_PROPS}
                className={`${card.bgColor} border-0 !rounded-2xl w-full`}
              >
                <div className='flex items-center'>
                  <Avatar className='mr-3' size='small' color={card.avatarColor}>
                    {card.icon}
                  </Avatar>
                  <div>
                    <div className='text-xs text-gray-500'>{card.title}</div>
                    <div className='text-lg font-semibold'>{card.value}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* 调用分布 + Token 分布 - 一行2列 */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <Card
            {...CARD_PROPS}
            className='!rounded-2xl'
            title={
              <div className='flex items-center gap-2'>
                <PieChart size={16} />
                {t('调用分布')}
              </div>
            }
          >
            <div className='h-80 p-2'>
              <ModelPieChart
                data={modelStats}
                title={t('各模型调用次数占比')}
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
                {t('Token 分布')}
              </div>
            }
          >
            <div className='h-80 p-2'>
              <ModelPieChart
                data={modelStats}
                title={t('各模型 Token 消耗占比')}
                colorKey="token_count"
              />
            </div>
          </Card>
        </div>

        {/* 使用趋势 - 独立卡片，标题右侧 Tabs slash 切换指标 */}
        <Card
          {...CARD_PROPS}
          className='!rounded-2xl !mb-4'
          title={
            <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between w-full gap-3'>
              <div className='flex items-center gap-2'>
                <TrendingUp size={16} />
                {t('使用趋势')}
              </div>
              <Tabs
                type='slash'
                activeKey={metric}
                onChange={setMetric}
              >
                <TabPane tab={<span>{t('Token 消耗')}</span>} itemKey='token_count' />
                <TabPane tab={<span>{t('调用次数')}</span>} itemKey='call_count' />
              </Tabs>
            </div>
          }
        >
          <div className='h-72 p-2'>
            <ModelTrendChart
              data={filteredTrendData}
              models={selectedModels}
              metric={metric}
              granularity={granularity}
            />
          </div>
        </Card>

        {/* 活跃用户排行 - 独立卡片 */}
        <Card
          {...CARD_PROPS}
          className='!rounded-2xl'
          title={
            <div className='flex items-center justify-between w-full'>
              <div className='flex items-center gap-2'>
                <Users size={16} />
                {t('活跃用户排行')}
                {selectedModels.length === 1 && (
                  <span className='text-xs' style={{ color: 'var(--semi-color-text-2)' }}>
                    ({selectedModels[0]})
                  </span>
                )}
              </div>
              <div className='flex items-center gap-1'>
                <Text type="tertiary" size="small">{t('显示')}</Text>
                <Select size="small" value={topN} onChange={setTopN} style={{ minWidth: 80 }}>
                  <Select.Option value={5}>Top 5</Select.Option>
                  <Select.Option value={10}>Top 10</Select.Option>
                  <Select.Option value={20}>Top 20</Select.Option>
                  <Select.Option value={50}>Top 50</Select.Option>
                </Select>
              </div>
            </div>
          }
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={userColumns}
            dataSource={users}
            rowKey="user_id"
            pagination={false}
            size="small"
            empty={t('暂无数据')}
            onRow={(record) => ({
              style: { cursor: 'pointer' },
              onClick: () => {
                const { startTimestamp, endTimestamp } = getTimestamps(range);
                navigate(`/console?username=${encodeURIComponent(record.username)}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`);
              },
            })}
          />
        </Card>
      </Spin>
    </div>
  );
};

export default ChannelAnalyticsDetail;
