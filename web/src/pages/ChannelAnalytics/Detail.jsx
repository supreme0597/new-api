import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { API } from '../../helpers/api';
import { showError } from '../../helpers/utils';
import {
  Card,
  Table,
  Spin,
  Select,
  Button,
  Space,
  Typography,
  Tag,
  Tooltip,
  Breadcrumb,
} from '@douyinfe/semi-ui';
import { renderNumber } from '../../helpers/render';

const { Title, Text } = Typography;

// 颜色列表
const BAR_COLORS = ['#1664ff', '#69b1ff', '#91caff', '#bae0ff', '#e6f4ff'];

function formatLargeNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

// 用量趋势图（柱状图）
function UsageTrendChart({ data, metric, granularity }) {
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

  const values = data.map(d => metric === 'call_count' ? d.call_count : d.token_count);
  const maxVal = Math.max(...values, 1);

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '8px 4px', height: 140, overflow: 'hidden' }}>
        {data.map((d, i) => {
          const val = metric === 'call_count' ? d.call_count : d.token_count;
          const height = (val / maxVal) * 120;
          return (
            <Tooltip key={i} content={`${d.time}: ${formatLargeNumber(val)}`}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                <div style={{
                  width: '100%', maxWidth: 24,
                  height: Math.max(height, 2),
                  background: BAR_COLORS[i % BAR_COLORS.length],
                  borderRadius: '3px 3px 0 0',
                  opacity: 0.85,
                }} />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--semi-color-text-2)', marginTop: 4, padding: '0 4px' }}>
        {data.length > 0 && <span>{data[0].time?.slice(5)}</span>}
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)].time?.slice(5)}</span>}
        {data.length > 1 && <span>{data[data.length - 1].time?.slice(5)}</span>}
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
  const [trendData, setTrendData] = useState([]);
  const [users, setUsers] = useState([]);
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [metric, setMetric] = useState('call_count'); // call_count | token_count
  const [topN, setTopN] = useState(10);

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
      const [detailRes, trendRes, usersRes] = await Promise.all([
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp },
        }),
        API.get('/api/channel-analytics/trend', {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp, granularity, source: decodedSource },
        }),
        API.get(`/api/channel-analytics/source/${encodeURIComponent(decodedSource)}/users`, {
          params: { start_timestamp: startTimestamp, end_timestamp: endTimestamp, limit: topN },
        }),
      ]);

      if (detailRes.data.success) setDetail(detailRes.data.data);
      if (trendRes.data.success) setTrendData(trendRes.data.data || []);
      if (usersRes.data.success) setUsers(usersRes.data.data || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [decodedSource, range, granularity, topN, getTimestamps]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (range === '1d') setGranularity('hour');
    else if (range === '7d') setGranularity('day');
    else setGranularity('day');
  }, [range]);

  const rangeLabel = range === '1d' ? t('近 1 天') : range === '7d' ? t('近 7 天') : t('近 30 天');

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
            <a onClick={() => navigate('/console/channel-analytics')}>{t('渠道分析')}</a>
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
                {detail ? `${detail.channel_count} ${t('个渠道')} · ${renderNumber(detail.call_count)} ${t('次调用')} · ${formatLargeNumber(detail.token_count)} Token · ${renderNumber(detail.active_users)} ${t('个活跃用户')}（${rangeLabel}）` : ''}
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
            <Button theme="solid" onClick={loadData}>{t('刷新数据')}</Button>
          </Space>
        </div>

        {/* 用量趋势 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t('用量趋势')}</div>
              <div style={{
                display: 'inline-flex', background: 'var(--semi-color-fill-0)',
                borderRadius: 6, padding: 2, gap: 2, marginTop: 6,
              }}>
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
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="tertiary" size="small">{t('粒度')}</Text>
              <Select size="small" value={granularity} onChange={setGranularity} style={{ minWidth: 80 }}>
                <Select.Option value="hour">{t('小时')}</Select.Option>
                <Select.Option value="day">{t('天')}</Select.Option>
                <Select.Option value="week">{t('周')}</Select.Option>
              </Select>
            </div>
          </div>
          <UsageTrendChart data={trendData} metric={metric} granularity={granularity} />
        </div>

        {/* 活跃用户排行 */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--semi-color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('活跃用户排行')}（{t('点击可查看该用户使用日志')}）</div>
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
          <Card bodyStyle={{ padding: 0 }}>
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
                  navigate(`/console?username=${encodeURIComponent(record.username)}`);
                },
              })}
            />
          </Card>
        </div>

        {/* 说明 */}
        <div style={{
          fontSize: 12, color: 'var(--semi-color-text-2)', marginTop: 16,
          padding: '8px 12px', background: 'var(--semi-color-fill-0)',
          borderRadius: 4, borderLeft: '3px solid var(--semi-color-text-2)',
        }}>
          🔗 {t('来源详情 → 点击用户 → 使用日志（带用户+来源过滤）')}
          <br />
          🔗 {t('模型性能排行请前往「模型响应速度排行榜」页面查看。')}
        </div>
      </Spin>
    </div>
  );
};

export default ChannelAnalyticsDetail;
