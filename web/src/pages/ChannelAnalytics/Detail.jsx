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
  Space,
  Typography,
  Tag,
  Breadcrumb,
  IconButton,
  Checkbox,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { RefreshCw } from 'lucide-react';
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
  const [metric, setMetric] = useState('token_count'); // call_count | token_count
  const [topN, setTopN] = useState(10);
  const [selectedModels, setSelectedModels] = useState([]);
  const [allModels, setAllModels] = useState([]);

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
        // 默认全选
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

  // 当选择模型变化时，重新加载用户排行
  const loadUsers = useCallback(async () => {
    if (!decodedSource) return;
    try {
      const { startTimestamp, endTimestamp } = getTimestamps(range);
      const params = { start_timestamp: startTimestamp, end_timestamp: endTimestamp, limit: topN };
      // 如果只选了一个模型，传给后端过滤
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
    else setGranularity('day');
  }, [range]);

  const rangeLabel = range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天');

  // 过滤趋势数据（只显示选中的模型）
  const filteredTrendData = useMemo(() => {
    if (!modelTrendData || modelTrendData.length === 0) return [];
    if (selectedModels.length === 0) return modelTrendData;
    return modelTrendData.filter(d => selectedModels.includes(d.model_name));
  }, [modelTrendData, selectedModels]);

  const handleModelToggle = (modelName) => {
    setSelectedModels(prev => {
      if (prev.includes(modelName)) {
        return prev.filter(m => m !== modelName);
      }
      return [...prev, modelName];
    });
  };

  const handleSelectAllModels = () => {
    setSelectedModels([...allModels]);
  };

  const handleDeselectAllModels = () => {
    setSelectedModels([]);
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--semi-color-primary-light-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--semi-color-primary)', fontSize: 14, fontWeight: 600,
          }}>
            {text?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span style={{ fontWeight: 500 }}>{text}</span>
        </div>
      ),
    },
    {
      title: t('调用次数'),
      dataIndex: 'call_count',
      key: 'call_count',
      render: (text) => <span style={{ fontWeight: 600 }}>{renderNumber(text)}</span>,
    },
    {
      title: t('Token'),
      dataIndex: 'token_count',
      key: 'token_count',
      render: (text) => formatLargeNumber(text),
    },
  ];

  return (
    <div style={{ padding: '20px 16px' }}>
      <Spin spinning={loading}>
        {/* 面包屑 */}
        <Breadcrumb style={{ marginBottom: 16 }}>
          <Breadcrumb.Item>
            <a onClick={() => navigate('/channel-analytics')}>{t('用量统计')}</a>
          </Breadcrumb.Item>
          <Breadcrumb.Item>{decodedSource}</Breadcrumb.Item>
        </Breadcrumb>

        {/* 头部 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--semi-color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #1664ff, #69b1ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, fontWeight: 700,
            }}>
              {decodedSource?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <Title heading={4} style={{ margin: 0 }}>{decodedSource}</Title>
              <Text type="tertiary" size="small">
                {detail ? `${detail.model_count} ${t('个模型')} · ${renderNumber(detail.call_count)} ${t('次调用')} · ${formatLargeNumber(detail.token_count)} Token · ${renderNumber(detail.active_users)} ${t('个活跃用户')}（${rangeLabel}）` : ''}
              </Text>
            </div>
          </div>
          <Space>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="tertiary" size="small">{t('时间范围')}</Text>
              <Select value={range} onChange={setRange} style={{ minWidth: 120 }}>
                <Select.Option value="1d">{t('近 1 天')}</Select.Option>
                <Select.Option value="7d">{t('近 7 天')}</Select.Option>
                <Select.Option value="30d">{t('近 30 天')}</Select.Option>
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="tertiary" size="small">{t('粒度')}</Text>
              <Select size="small" value={granularity} onChange={setGranularity} style={{ minWidth: 80 }}>
                <Select.Option value="hour">{t('小时')}</Select.Option>
                <Select.Option value="day">{t('天')}</Select.Option>
                <Select.Option value="week">{t('周')}</Select.Option>
              </Select>
            </div>
            <IconButton icon={<RefreshCw size={16} />} onClick={loadData} title={t('刷新数据')} />
          </Space>
        </div>

        {/* 模型占比饼图 */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4'>
          <ModelPieChart
            data={modelStats}
            title={t('各模型调用次数占比')}
            colorKey="call_count"
          />
          <ModelPieChart
            data={modelStats}
            title={t('各模型 Token 消耗占比')}
            colorKey="token_count"
          />
        </div>

        {/* 模型趋势折线图 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('模型使用趋势')}</div>
              <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 4 }}>
                {t('默认显示全部模型')} · {t('点击图例可聚焦单个模型')}
              </div>
            </div>
            <div className='toggle-group'>
              <button
                onClick={() => setMetric('token_count')}
                style={{
                  padding: '4px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  border: 'none', lineHeight: '20px',
                  background: metric === 'token_count' ? 'var(--semi-color-bg-0)' : 'transparent',
                  color: metric === 'token_count' ? 'var(--semi-color-primary)' : 'var(--semi-color-text-2)',
                  fontWeight: metric === 'token_count' ? 600 : 400,
                  boxShadow: metric === 'token_count' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t('Token 消耗')}
              </button>
              <button
                onClick={() => setMetric('call_count')}
                style={{
                  padding: '4px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  border: 'none', lineHeight: '20px',
                  background: metric === 'call_count' ? 'var(--semi-color-bg-0)' : 'transparent',
                  color: metric === 'call_count' ? 'var(--semi-color-primary)' : 'var(--semi-color-text-2)',
                  fontWeight: metric === 'call_count' ? 600 : 400,
                  boxShadow: metric === 'call_count' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t('调用次数')}
              </button>
            </div>
          </div>
          <ModelTrendChart
            data={filteredTrendData}
            models={selectedModels}
            metric={metric}
            granularity={granularity}
          />
          {/* 模型选择器 */}
          <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--semi-color-fill-0)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>{t('选择模型')}：</span>
              <Space>
                <span
                  style={{ fontSize: 11, color: 'var(--semi-color-primary)', cursor: 'pointer' }}
                  onClick={handleSelectAllModels}
                >
                  {t('全选')}
                </span>
                <span
                  style={{ fontSize: 11, color: 'var(--semi-color-primary)', cursor: 'pointer' }}
                  onClick={handleDeselectAllModels}
                >
                  {t('清空')}
                </span>
              </Space>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allModels.map((modelName, i) => (
                <Checkbox
                  key={modelName}
                  checked={selectedModels.includes(modelName)}
                  onChange={() => handleModelToggle(modelName)}
                  style={{ marginRight: 0 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: MODEL_COLORS[i % MODEL_COLORS.length],
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontSize: 12 }}>{modelName}</span>
                  </span>
                </Checkbox>
              ))}
            </div>
          </div>
        </div>

        {/* 活跃用户排行 */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--semi-color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {t('活跃用户排行')}
              {selectedModels.length === 1 && (
                <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginLeft: 8 }}>
                  ({selectedModels[0]})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="tertiary" size="small">{t('显示')}</Text>
              <Select size="small" value={topN} onChange={setTopN} style={{ minWidth: 80 }}>
                <Select.Option value={5}>Top 5</Select.Option>
                <Select.Option value={10}>Top 10</Select.Option>
                <Select.Option value={20}>Top 20</Select.Option>
                <Select.Option value={50}>Top 50</Select.Option>
              </Select>
            </div>
          </div>
          <Card {...CARD_PROPS} className='!rounded-2xl' bodyStyle={{ padding: 0 }}>
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
        </div>

      </Spin>
    </div>
  );
};

export default ChannelAnalyticsDetail;
