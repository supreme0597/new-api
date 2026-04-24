import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';
import { showError } from '../../helpers/utils';
import {
  Card,
  Tag,
  Select,
  Spin,
  Empty,
  Tooltip,
  Typography,
  Space,
  Button,
} from '@douyinfe/semi-ui';
import { IconInfoCircle, IconHelpCircle, IconArrowUp } from '@douyinfe/semi-icons';
import { renderModelTag } from '../../helpers/render';

const { Text } = Typography;

// 评分颜色映射
function getScoreColor(score) {
  if (score >= 80) return '#28a745';
  if (score >= 60) return '#1664ff';
  if (score >= 40) return '#ff8a00';
  if (score >= 20) return '#ff4d4f';
  return '#c9c9c9';
}

// 根据基准值计算 TPS 颜色
function getTpsColor(tps, tpsBenchmark) {
  const excellent = tpsBenchmark * 0.8;
  const good = tpsBenchmark * 0.4;
  if (tps >= excellent) return '#28a745';
  if (tps >= good) return '#1664ff';
  return '#ff8a00';
}

// 根据基准值计算 TTFT 颜色
function getTtftColor(ttft, ttftBenchmark) {
  const excellent = ttftBenchmark * 0.3;
  const good = ttftBenchmark * 0.8;
  if (ttft <= excellent) return '#28a745';
  if (ttft <= good) return '#1664ff';
  return '#ff4d4f';
}

// 排名徽章
function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(255,215,0,0.4)',
        }}
      >
        {rank}
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #C0C0C0, #A8A8A8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(192,192,192,0.4)',
        }}
      >
        {rank}
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #CD7F32, #B87333)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          color: '#fff',
          boxShadow: '0 2px 8px rgba(205,127,50,0.4)',
        }}
      >
        {rank}
      </div>
    );
  }
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--semi-color-fill-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 13,
        color: 'var(--semi-color-text-2)',
      }}
    >
      {rank}
    </div>
  );
}

// 分数进度条
function ScoreBar({ score, color }) {
  return (
    <div
      style={{
        width: '100%',
        height: 6,
        borderRadius: 3,
        background: 'var(--semi-color-fill-0)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(score, 100)}%`,
          height: '100%',
          borderRadius: 3,
          background: color,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  );
}

// 指标显示组件
function MetricItem({ label, value, unit, color, tooltip }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text type='tertiary' size='small'>
          {label}
        </Text>
        {tooltip && (
          <Tooltip content={tooltip}>
            <IconHelpCircle
              size='small'
              style={{
                color: 'var(--semi-color-text-3)',
                cursor: 'help',
              }}
            />
          </Tooltip>
        )}
      </div>
      <Text strong style={{ color, fontSize: 15 }}>
        {value}
        <Text size='small' type='tertiary' style={{ marginLeft: 2 }}>
          {unit}
        </Text>
      </Text>
    </div>
  );
}

const ModelPerformance = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [lastSamplingTime, setLastSamplingTime] = useState('');
  const [benchmarks, setBenchmarks] = useState({ tps: 100, ttft: 1000 });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pageSize = 20;
  const sentinelRef = useRef(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await API.get('/api/model-performance/sources');
      const { success, data } = res.data;
      if (success) {
        setSources(data || []);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchData = useCallback(
    async (p = 1, source = selectedSource, append = false) => {
      const isLoadMore = append && p > 1;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        let url = `/api/model-performance/list?page=${p}&pageSize=${pageSize}`;
        if (source) {
          url += `&source=${encodeURIComponent(source)}`;
        }
        const res = await API.get(url);
        const { success, data } = res.data;
        if (success) {
          const newList = data?.list || [];
          const newTotal = data?.total || 0;
          if (isLoadMore) {
            setList((prev) => [...prev, ...newList]);
          } else {
            setList(newList);
          }
          setTotal(newTotal);
          setPage(p);
          setHasMore(newList.length === pageSize && p * pageSize < newTotal);
          if (data?.lastSamplingTime) {
            setLastSamplingTime(data.lastSamplingTime);
          }
          if (data?.tpsBenchmark && data?.ttftBenchmark) {
            setBenchmarks({
              tps: data.tpsBenchmark,
              ttft: data.ttftBenchmark,
            });
          }
        }
      } catch (e) {
        showError(e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [pageSize, selectedSource],
  );

  // 初始加载
  useEffect(() => {
    fetchSources();
    fetchData(1, '', false);
  }, [fetchSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver 监听底部 sentinel 自动加载更多
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchData(page + 1, selectedSource, true);
        }
      },
      { root: null, rootMargin: '0px 0px 100px 0px', threshold: 0 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, selectedSource, fetchData]);

  // 监听窗口滚动显示回到顶部按钮
  const handleScroll = useCallback(() => {
    setShowBackToTop(window.scrollY > 400);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleSourceChange = (value) => {
    setSelectedSource(value);
    setList([]);
    setPage(1);
    setHasMore(true);
    fetchData(1, value, false);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 格式化时间戳
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
      {/* 页面头部 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {t('模型响应速度排行榜')}
          </h2>
          {lastSamplingTime && (
            <Text type='tertiary' size='small'>
              {t('上次采样')}：{lastSamplingTime}
            </Text>
          )}
        </div>
        <Select
          placeholder={t('全部来源')}
          value={selectedSource || undefined}
          onChange={handleSourceChange}
          style={{ width: 150 }}
          showClear
          filter
          optionList={[
            { value: '', label: t('全部来源') },
            ...sources.map((s) => ({ value: s, label: s })),
          ]}
        />
      </div>

      {/* 评分标准与颜色说明 */}
      <Card
        style={{
          marginBottom: 16,
          background: 'var(--semi-color-primary-light-default)',
          border: '1px solid var(--semi-color-primary-light-hover)',
        }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 评分公式 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <IconInfoCircle
              size='small'
              style={{ color: 'var(--semi-color-primary)' }}
            />
            <Text type='secondary' size='small'>
              {t('评分标准')}：
            </Text>
            <Text type='secondary' size='small'>
              {t('综合评分 = TPS评分 × 60% + TTFT评分 × 40%')}
            </Text>
          </div>

          {/* 颜色含义 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type='secondary' size='small'>
              {t('颜色含义')}：
            </Text>
            <Tag size='small' color='green'>{t('优秀')}</Tag>
            <Tag size='small' color='blue'>{t('良好')}</Tag>
            <Tag size='small' color='orange'>{t('一般')}</Tag>
            <Tag size='small' color='red'>{t('较差')}</Tag>
            <Tag size='small' color='grey'>{t('很差')}</Tag>
          </div>

          {/* TPS 阈值 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tooltip content={`${t('输出速度 (Tokens Per Second)')}，${t('越高越好')}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                <Text type='secondary' size='small'>
                  TPS
                </Text>
                <IconHelpCircle size='small' style={{ color: 'var(--semi-color-text-3)' }} />
                <Text type='secondary' size='small'>：</Text>
              </div>
            </Tooltip>
            <Tag size='small' color='green'>{t('优秀')} ≥{(benchmarks.tps * 0.8).toFixed(0)} t/s</Tag>
            <Tag size='small' color='blue'>{t('良好')} ≥{(benchmarks.tps * 0.4).toFixed(0)} t/s</Tag>
            <Tag size='small' color='orange'>{t('一般')} &lt;{(benchmarks.tps * 0.4).toFixed(0)} t/s</Tag>
          </div>

          {/* TTFT 阈值 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tooltip content={`${t('首字延迟 (Time To First Token)')}，${t('越低越好')}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
                <Text type='secondary' size='small'>
                  TTFT
                </Text>
                <IconHelpCircle size='small' style={{ color: 'var(--semi-color-text-3)' }} />
                <Text type='secondary' size='small'>：</Text>
              </div>
            </Tooltip>
            <Tag size='small' color='green'>{t('优秀')} ≤{(benchmarks.ttft * 0.3).toFixed(0)} ms</Tag>
            <Tag size='small' color='blue'>{t('良好')} ≤{(benchmarks.ttft * 0.8).toFixed(0)} ms</Tag>
            <Tag size='small' color='red'>{t('较差')} &gt;{(benchmarks.ttft * 0.8).toFixed(0)} ms</Tag>
          </div>

        </div>
      </Card>

      {/* 排行榜列表 */}
      <Spin spinning={loading && list.length === 0}>
        {list.length === 0 && !loading ? (
          <Empty
            description={t('暂无性能数据，请前往系统设置配置测试渠道')}
            style={{ marginTop: 60 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((item) => {
              const score = item.score || 0;
              const scoreColor = getScoreColor(score);
              return (
                <Card
                  key={`${item.model}-${item.channel_id}`}
                  style={{
                    border: '1px solid var(--semi-color-border)',
                    transition: 'box-shadow 0.2s',
                  }}
                  bodyStyle={{ padding: '16px 20px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* 排名 */}
                    <RankBadge rank={item.rank} />

                    {/* 模型名 + 来源 */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 120,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {renderModelTag(item.model)}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {item.source && (
                          <Tag size='small' color='cyan'>
                            {item.source}
                          </Tag>
                        )}
                        <Text type='tertiary' size='small'>
                          {t('采样')} {item.sample_size || 0} {t('次')}
                        </Text>
                      </div>
                    </div>

                    {/* 综合评分 */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        minWidth: 100,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 2,
                        }}
                      >
                        <Text
                          strong
                          style={{
                            fontSize: 28,
                            color: scoreColor,
                            lineHeight: 1,
                          }}
                        >
                          {score.toFixed(1)}
                        </Text>
                        <Text type='tertiary' size='small'>
                          {t('分')}
                        </Text>
                      </div>
                      <ScoreBar score={score} color={scoreColor} />
                      <Text type='tertiary' size='small'>
                        {t('综合评分')}
                      </Text>
                    </div>

                    {/* TPS */}
                    <MetricItem
                      label='TPS'
                      value={item.tps?.toFixed(1) || '0'}
                      unit='t/s'
                      color={getTpsColor(item.tps, benchmarks.tps)}
                    />

                    {/* TTFT */}
                    <MetricItem
                      label='TTFT'
                      value={item.ttft || 0}
                      unit='ms'
                      color={getTtftColor(item.ttft, benchmarks.ttft)}
                    />
                  </div>
                </Card>
              );
            })}

            {/* 底部 sentinel 与加载状态 */}
            <div
              ref={sentinelRef}
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px 0',
                minHeight: 50,
              }}
            >
              {loadingMore ? (
                <Spin size='small' />
              ) : hasMore ? (
                <Text type='tertiary' size='small'>
                  {t('下拉加载更多')}
                </Text>
              ) : list.length > 0 ? (
                <Text type='tertiary' size='small'>
                  {t('已加载全部')}
                </Text>
              ) : null}
            </div>
          </div>
        )}
      </Spin>

      {/* 回到顶部按钮 */}
      {showBackToTop && (
        <Button
          icon={<IconArrowUp />}
          theme='solid'
          type='primary'
          style={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 100,
            borderRadius: '50%',
            width: 44,
            height: 44,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
          onClick={scrollToTop}
        />
      )}
    </div>
  );
};

export default ModelPerformance;
