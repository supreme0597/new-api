import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import {
  Table,
  Tag,
  Spin,
  Empty,
  Select,
  Typography,
  Tooltip,
} from '@douyinfe/semi-ui';

const { Text } = Typography;

const ModelPerformance = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState('');
  const [lastSamplingTime, setLastSamplingTime] = useState('');
  const [tpsBenchmark, setTpsBenchmark] = useState(100);
  const [ttftBenchmark, setTtftBenchmark] = useState(1000);

  const fetchSources = async () => {
    try {
      const res = await API.get('/api/model-performance/sources');
      if (res.data.success) {
        setSources(res.data.data || []);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchList = async (p = page, ps = pageSize, source = selectedSource) => {
    setLoading(true);
    try {
      let url = `/api/model-performance/list?page=${p}&pageSize=${ps}`;
      if (source) {
        url += `&source=${source}`;
      }
      const res = await API.get(url);
      if (res.data.success) {
        const d = res.data.data;
        setData(d.list || []);
        setTotal(d.total || 0);
        setLastSamplingTime(d.lastSamplingTime || '');
        setTpsBenchmark(d.tpsBenchmark || 100);
        setTtftBenchmark(d.ttftBenchmark || 1000);
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
    fetchList();
  }, []);

  const handlePageChange = (p, ps) => {
    setPage(p);
    setPageSize(ps);
    fetchList(p, ps, selectedSource);
  };

  const handleSourceChange = (value) => {
    setSelectedSource(value);
    setPage(1);
    fetchList(1, pageSize, value);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'blue';
    if (score >= 40) return 'orange';
    return 'red';
  };

  const getTpsColor = (tps) => {
    if (tps >= tpsBenchmark) return 'green';
    if (tps >= tpsBenchmark * 0.7) return 'blue';
    if (tps >= tpsBenchmark * 0.4) return 'orange';
    return 'red';
  };

  const getTtftColor = (ttft) => {
    if (ttft <= ttftBenchmark) return 'green';
    if (ttft <= ttftBenchmark * 1.5) return 'blue';
    if (ttft <= ttftBenchmark * 3) return 'orange';
    return 'red';
  };

  const columns = [
    {
      title: t('排名'),
      dataIndex: 'rank',
      width: 70,
      render: (text) => {
        if (text === 1) return <Tag color='amber' size='large' shape='circle'>1</Tag>;
        if (text === 2) return <Tag color='light-blue' size='large' shape='circle'>2</Tag>;
        if (text === 3) return <Tag color='orange' size='large' shape='circle'>3</Tag>;
        return <Text type='secondary'>{text}</Text>;
      },
    },
    {
      title: t('模型'),
      dataIndex: 'model',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: t('供应商'),
      dataIndex: 'source',
      render: (text) => text || '-',
    },
    {
      title: t('渠道'),
      dataIndex: 'channel_name',
      render: (text) => <Text type='secondary'>{text || '-'}</Text>,
    },
    {
      title: 'TPS',
      dataIndex: 'tps',
      sorter: (a, b) => a.tps - b.tps,
      render: (text) => (
        <Tooltip content={t('每秒输出 Token 数')}>
          <Tag color={getTpsColor(text)} shape='circle'>
            {text.toFixed(1)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'TTFT',
      dataIndex: 'ttft',
      sorter: (a, b) => a.ttft - b.ttft,
      render: (text) => (
        <Tooltip content={t('首次响应时间（毫秒）')}>
          <Tag color={getTtftColor(text)} shape='circle'>
            {text}ms
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: t('评分'),
      dataIndex: 'score',
      sorter: (a, b) => a.score - b.score,
      render: (text) => (
        <Tag color={getScoreColor(text)} shape='circle' type='solid'>
          {text.toFixed(1)}
        </Tag>
      ),
    },
    {
      title: t('采样次数'),
      dataIndex: 'sample_size',
      width: 100,
      render: (text) => <Text type='secondary'>{text}</Text>,
    },
  ];

  return (
    <div className='p-4 md:p-6'>
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2'>
        <div>
          <h2 className='text-xl font-semibold'>{t('性能排行榜')}</h2>
          {lastSamplingTime && (
            <Text type='secondary' size='small'>
              {t('最后采样时间')}：{lastSamplingTime}
            </Text>
          )}
        </div>
        {sources.length > 0 && (
          <div className='flex items-center gap-2'>
            <Text>{t('供应商')}：</Text>
            <Select
              value={selectedSource}
              onChange={handleSourceChange}
              style={{ width: 180 }}
              showClear
              placeholder={t('全部供应商')}
            >
              {sources.map((s) => (
                <Select.Option key={s} value={s}>
                  {s}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <Spin spinning={loading}>
        {data.length === 0 && !loading ? (
          <Empty
            description={t('暂无性能数据，请先配置测试渠道并刷新采样')}
            style={{ marginTop: 60 }}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            pagination={{
              currentPage: page,
              pageSize: pageSize,
              total: total,
              onPageChange: handlePageChange,
              showSizeChanger: true,
              pageSizeOpts: [10, 20, 50],
            }}
            rowKey='rank'
            size='small'
          />
        )}
      </Spin>
    </div>
  );
};

export default ModelPerformance;
