/*
Copyright (C) 2025 QuantumNous

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

import React, { useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Col,
  Form,
  InputNumber,
  Progress,
  Row,
  Select,
  Spin,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const defaultInputs = {
  TpsBenchmark: 100,
  TtftBenchmark: 1000,
  SamplingPrompt: '',
  SamplingMaxTokens: 2048,
  SamplingIntervalMinutes: 30,
  SamplingStartTime: '00:00',
  SamplingEndTime: '23:59',
};

export default function SettingModelSampling(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState(defaultInputs);
  const [inputsRow, setInputsRow] = useState(defaultInputs);
  const refForm = useRef();

  // 采样任务状态
  const [samplingStatus, setSamplingStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollingRef = useRef(null);

  const fetchSamplingStatus = async () => {
    try {
      const res = await API.get('/api/model-performance/sampling-status');
      const { success, data } = res.data;
      if (success) {
        setSamplingStatus(data);
        return data;
      }
    } catch (e) {
      // ignore
    }
    return null;
  };

  const handleRefreshSampling = async () => {
    setRefreshing(true);
    try {
      const res = await API.post('/api/model-performance/refresh');
      const { success, message } = res.data;
      if (success) {
        showSuccess(t(message || '采样任务已触发'));
        const status = await fetchSamplingStatus();
        if (status?.is_running) {
          setSamplingStatus(status);
        }
      }
    } catch (e) {
      showError(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (samplingStatus?.is_running) {
      pollingRef.current = setInterval(() => {
        fetchSamplingStatus().then((status) => {
          if (!status?.is_running) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        });
      }, 2000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [samplingStatus?.is_running]);

  useEffect(() => {
    fetchSamplingStatus();
  }, []);

  useEffect(() => {
    const currentInputs = {};
    for (const key of Object.keys(defaultInputs)) {
      if (props.options[key] !== undefined) {
        if (typeof defaultInputs[key] === 'number') {
          currentInputs[key] = parseInt(props.options[key]) || defaultInputs[key];
        } else {
          currentInputs[key] = props.options[key];
        }
      } else {
        currentInputs[key] = defaultInputs[key];
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    if (refForm.current) {
      refForm.current.setValues(currentInputs);
    }
  }, [props.options]);

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = String(inputs[item.key]);
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <Spin spinning={loading}>
      <Form
        values={inputs}
        getFormApi={(formAPI) => (refForm.current = formAPI)}
        style={{ marginBottom: 15 }}
      >
        <Form.Section text={t('采样基准设置')}>
          <Banner
            type='info'
            description={t(
              '调整 TPS 和 TTFT 的评分基准值。基准值越高，获得高分的难度越大。修改后立即影响所有历史数据的排名显示。',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6} lg={6} xl={6}>
              <Form.InputNumber
                field={'TpsBenchmark'}
                label={t('TPS 基准 (tokens/s)')}
                extraText={t('TPS 评分达到满分的标准值')}
                min={1}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, TpsBenchmark: value }))
                }
              />
            </Col>
            <Col xs={24} sm={12} md={6} lg={6} xl={6}>
              <Form.InputNumber
                field={'TtftBenchmark'}
                label={t('TTFT 基准 (ms)')}
                extraText={t('TTFT 评分达到满分的标准值')}
                min={1}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, TtftBenchmark: value }))
                }
              />
            </Col>
          </Row>
        </Form.Section>

        <Form.Section text={t('采样配置')}>
          <Banner
            type='info'
            description={t(
              '配置模型性能采样时使用的 Prompt 和 Max Tokens。系统将使用此配置对测试渠道下的所有模型执行采样。',
            )}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={16}>
            <Col xs={24} sm={24} md={16} lg={16} xl={16}>
              <Form.TextArea
                field={'SamplingPrompt'}
                label={t('采样 Prompt')}
                extraText={t('用于模型性能采样的 Prompt 内容')}
                rows={4}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, SamplingPrompt: value }))
                }
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.InputNumber
                field={'SamplingMaxTokens'}
                label={t('Max Tokens')}
                extraText={t('采样请求的最大输出 Token 数')}
                min={1}
                max={8192}
                onChange={(value) =>
                  setInputs((prev) => ({ ...prev, SamplingMaxTokens: value }))
                }
              />
            </Col>
          </Row>
        </Form.Section>

        <Form.Section text={t('定时采样')}>
          <Banner
            type='info'
            description={t(
              '设置定时自动采样的时间段和间隔。间隔设为 0 表示关闭定时采样。管理员也可以点击「立即执行采样」手动触发。',
            )}
            style={{ marginBottom: 16 }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px 12px',
              marginBottom: 16,
              padding: '12px 16px',
              background: 'var(--semi-color-fill-0)',
              borderRadius: 8,
            }}
          >
            <Text>{t('每天')}</Text>
            <Select
              value={inputs.SamplingStartTime}
              onChange={(value) => {
                setInputs((prev) => ({
                  ...prev,
                  SamplingStartTime: value,
                }));
              }}
              style={{ width: 90 }}
              size='small'
            >
              {Array.from({ length: 24 }, (_, h) =>
                [0, 30].map((m) => {
                  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  return (
                    <Select.Option key={time} value={time}>
                      {time}
                    </Select.Option>
                  );
                }),
              ).flat()}
            </Select>
            <Text>{t('到')}</Text>
            <Select
              value={inputs.SamplingEndTime}
              onChange={(value) => {
                setInputs((prev) => ({
                  ...prev,
                  SamplingEndTime: value,
                }));
              }}
              style={{ width: 90 }}
              size='small'
            >
              {Array.from({ length: 24 }, (_, h) =>
                [0, 30].map((m) => {
                  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  return (
                    <Select.Option key={time} value={time}>
                      {time}
                    </Select.Option>
                  );
                }),
              ).flat()}
            </Select>
            <Text>{t('，每隔')}</Text>
            <InputNumber
              value={inputs.SamplingIntervalMinutes}
              onChange={(value) => {
                setInputs((prev) => ({
                  ...prev,
                  SamplingIntervalMinutes: value,
                }));
              }}
              min={0}
              max={1440}
              style={{ width: 80 }}
              size='small'
            />
            <Text>{t('分钟执行一次')}</Text>
            {inputs.SamplingIntervalMinutes === 0 && (
              <Tag color='red' size='small'>
                {t('已关闭')}
              </Tag>
            )}
            {inputs.SamplingIntervalMinutes > 0 && (
              <Tag color='green' size='small'>
                {inputs.SamplingStartTime} - {inputs.SamplingEndTime} /{' '}
                {inputs.SamplingIntervalMinutes}
                {t('分钟')}
              </Tag>
            )}
          </div>
          <Row style={{ marginBottom: 12 }}>
            <Button
              theme='solid'
              loading={refreshing}
              onClick={handleRefreshSampling}
            >
              {t('立即执行采样')}
            </Button>
          </Row>

          {samplingStatus?.is_running && (
            <Card
              style={{
                marginTop: 12,
                background: 'var(--semi-color-warning-light-default)',
                border: '1px solid var(--semi-color-warning-light-hover)',
              }}
              bodyStyle={{ padding: '12px 16px' }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Spin size='small' />
                  <Text strong size='small'>
                    {t('正在采样')}… {samplingStatus.done_tasks || 0} /{' '}
                    {samplingStatus.total_tasks || 0}
                  </Text>
                  <Text type='tertiary' size='small'>
                    ({t('成功')} {samplingStatus.success_tasks || 0} /{' '}
                    {t('失败')} {samplingStatus.failed_tasks || 0})
                  </Text>
                </div>
                {samplingStatus.total_tasks > 0 && (
                  <Progress
                    percent={Math.round(
                      ((samplingStatus.done_tasks || 0) /
                        samplingStatus.total_tasks) *
                        100,
                    )}
                    showInfo
                    size='small'
                    stroke='var(--semi-color-warning)'
                  />
                )}
                {samplingStatus.message && (
                  <Text type='tertiary' size='small'>
                    {samplingStatus.message}
                  </Text>
                )}
                {samplingStatus.current_channel &&
                  samplingStatus.current_model && (
                    <Text type='tertiary' size='small'>
                      {t('当前')}：{samplingStatus.current_channel} /{' '}
                      {samplingStatus.current_model}
                    </Text>
                  )}
              </div>
            </Card>
          )}
        </Form.Section>

        <Row>
          <Button size='default' onClick={onSubmit}>
            {t('保存采样设置')}
          </Button>
        </Row>
      </Form>
    </Spin>
  );
}
