import React, { useState, useEffect, useCallback } from 'react';
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
  Tooltip,
} from '@douyinfe/semi-ui';
import { IconDownload } from '@douyinfe/semi-icons';
import { renderNumber, renderQuota } from '../../helpers/render';

const { Title, Text } = Typography;

// 颜色列表
const SOURCE_COLORS = [
  '#1664ff', '#69b1ff', '#91caff', '#bae0ff', '#e6f4ff',
  '#ff8a00', '#52c41a', '#722ed1', '#eb2f96', '#13c2c2',
];

// 格式化大数字
function formatLargeNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 环形图组件
function DonutChart({ data, total, title, colorKey = 'call_count' }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <Card style={{ height: '100%' }}>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)' }}>
          {t('暂无数据')}
        </div>
      </Card>
    );
  }

  const totalValue = total || data.reduce((sum, d) => sum + (d[colorKey] || 0), 0);
  const circumference = 2 * Math.PI * 50;
  let offset = 0;

  return (
    <Card style={{ height: '100%' }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '8px 0' }}>
        <div style={{ position: 'relative', width: 120, height: 120 }}>
          <svg viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--semi-color-fill-0)" strokeWidth="12" />
            {data.map((d, i) => {
              const value = d[colorKey] || 0;
              const ratio = totalValue > 0 ? value / totalValue : 0;
              const dashLength = ratio * circumference;
              const dashOffset = -offset;
              offset += dashLength;
              return (
                <circle
                  key={i}
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={SOURCE_COLORS[i % SOURCE_COLORS.length]}
                  strokeWidth="12"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'all 0.3s' }}
                />
              );
            })}
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)' }}>{t('总计')}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
              {formatLargeNumber(totalValue)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          {data.map((d, i) => {
            const value = d[colorKey] || 0;
            const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(0) : 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: SOURCE_COLORS[i % SOURCE_COLORS.length],
                }} />
                <span>{d.source}</span>
                <span style={{ color: 'var(--semi-color-text-2)', marginLeft: 'auto', paddingLeft: 12 }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// 趋势图（简化版：柱状图）
function TrendChart({ data, sources, range, granularity }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--semi-color-text-2)' }}>
          {t('暂无数据')}
        </div>
      </Card>
    );
  }

  // 按时间分组
  const timeMap = {};
  data.forEach((d) => {
    if (!timeMap[d.time]) timeMap[d.time] = {};
    timeMap[d.time][d.source] = d.call_count;
  });
  const times = Object.keys(timeMap).sort();

  // 找到最大值
  let maxVal = 0;
  times.forEach((t) => {
    sources.forEach((s) => {
      const v = timeMap[t]?.[s] || 0;
      if (v > maxVal) maxVal = v;
    });
  });

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>
          📈 {t('各来源使用次数趋势图')}
        </div>
        <Space spacing={8}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="tertiary" size="small">{t('范围')}</Text>
            <Select size="small" value={range} style={{ minWidth: 100 }}
              onChange={() => {}} disabled
            >
              <Select.Option value="1d">{t('近 1 天')}</Select.Option>
              <Select.Option value="7d">{t('近 7 天')}</Select.Option>
              <Select.Option value="30d">{t('近 30 天')}</Select.Option>
            </Select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text type="tertiary" size="small">{t('粒度')}</Text>
            <Select size="small" value={granularity} style={{ minWidth: 80 }}
              onChange={() => {}} disabled
            >
              <Select.Option value="hour">{t('小时')}</Select.Option>
              <Select.Option value="day">{t('天')}</Select.Option>
              <Select.Option value="week">{t('周')}</Select.Option>
            </Select>
          </div>
        </Space>
      </div>

      {/* 简易柱状图 */}
      <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 4px', overflow: 'hidden' }}>
        {times.map((time, i) => (
          <Tooltip key={i} content={`${time}: ${sources.map(s => `${s}: ${timeMap[time]?.[s] || 0}`).join(', ')}`}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', minWidth: 0 }}>
              {sources.map((source, si) => {
                const val = timeMap[time]?.[source] || 0;
                const height = maxVal > 0 ? (val / maxVal) * 140 : 0;
                return (
                  <div key={si} style={{
                    width: '100%', maxWidth: 16,
                    height: Math.max(height, 1),
                    background: SOURCE_COLORS[si % SOURCE_COLORS.length],
                    borderRadius: '2px 2px 0 0',
                    opacity: 0.85,
                  }} />
                );
              })}
            </div>
          </Tooltip>
        ))}
      </div>

      {/* 时间轴标签 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--semi-color-text-2)', marginTop: 4, padding: '0 4px' }}>
        {times.length > 0 && <span>{times[0]?.slice(5)}</span>}
        {times.length > 2 && <span>{times[Math.floor(times.length / 2)]?.slice(5)}</span>}
        {times.length > 1 && <span>{times[times.length - 1]?.slice(5)}</span>}
      </div>

      {/* 图例 */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 12 }}>
        {sources.map((source, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 3, borderRadius: 2, background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
            {source}
          </div>
        ))}
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
      title: t('渠道数'),
      dataIndex: 'channel_count',
      key: 'channel_count',
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
            <Title heading={4} style={{ margin: 0 }}>{t('渠道来源分析')}</Title>
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

        {/* 概览卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Card bodyStyle={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 6 }}>{t('来源总数')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1664ff' }}>{overview?.source_count || 0}</div>
          </Card>
          <Card bodyStyle={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 6 }}>{t('总调用次数')}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{formatLargeNumber(overview?.total_calls || 0)}</div>
          </Card>
          <Card bodyStyle={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 6 }}>{t('总 Token 消耗')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#28a745' }}>{formatLargeNumber(overview?.total_tokens || 0)}</div>
          </Card>
          <Card bodyStyle={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--semi-color-text-2)', marginBottom: 6 }}>{t('活跃用户数')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ff8a00' }}>{renderNumber(overview?.active_users || 0)}</div>
          </Card>
        </div>

        {/* 来源对比表格 */}
        <Card style={{ marginBottom: 16 }}>
          <Table
            columns={columns}
            dataSource={sortedSources}
            rowKey="source"
            pagination={false}
            size="small"
            empty={t('暂无数据')}
          />
        </Card>

        {/* 环形图 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <DonutChart
            data={sortedSources.slice(0, 8)}
            total={overview?.total_calls}
            title={`📊 ${t('各来源调用量占比')}`}
            colorKey="call_count"
          />
          <DonutChart
            data={sortedSources.slice(0, 8)}
            total={overview?.total_tokens}
            title={`🔥 ${t('各来源 Token 消耗占比')}`}
            colorKey="token_count"
          />
        </div>

        {/* 趋势图 */}
        <TrendChart
          data={trendData}
          sources={sourceNames}
          range={range}
          granularity={granularity}
        />

        {/* 说明 */}
        <div style={{
          fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 16,
          padding: '8px 12px', background: 'var(--semi-color-fill-0)',
          borderRadius: 4, borderLeft: '3px solid var(--semi-color-text-2)',
        }}>
          💡 {t('渠道来源是通用属性，所有渠道均可设置。点击「查看详情」可下钻到单个来源的用量统计和用户分析。')}
        </div>
      </Spin>
    </div>
  );
};

export default ChannelAnalytics;
