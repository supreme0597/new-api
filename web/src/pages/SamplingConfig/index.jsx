import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from '../../helpers/api';
import { showError, showSuccess } from '../../helpers/utils';
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Typography,
  Space,
  Popconfirm,
} from '@douyinfe/semi-ui';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconRefresh,
} from '@douyinfe/semi-icons';

const { Text } = Typography;

const SamplingConfigPage = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formApi, setFormApi] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/sampling-config/');
      const { success, data } = res.data;
      if (success) {
        setData(data || []);
      }
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = () => {
    setEditingRecord(null);
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await API.delete(`/api/sampling-config/${id}`);
      if (res.data.success) {
        showSuccess(t('删除成功'));
        fetchData();
      }
    } catch (e) {
      showError(e);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await API.post(`/api/sampling-config/${id}/toggle`);
      if (res.data.success) {
        showSuccess(t('状态已更新'));
        fetchData();
      }
    } catch (e) {
      showError(e);
    }
  };

  const handleSubmit = async (values) => {
    try {
      const payload = {
        name: values.name,
        prompt: values.prompt,
        max_tokens: values.max_tokens,
      };

      let res;
      if (editingRecord) {
        res = await API.put(`/api/sampling-config/${editingRecord.id}`, payload);
      } else {
        res = await API.post('/api/sampling-config/', payload);
      }

      if (res.data.success) {
        showSuccess(editingRecord ? t('更新成功') : t('创建成功'));
        setModalVisible(false);
        fetchData();
      }
    } catch (e) {
      showError(e);
    }
  };

  const columns = [
    {
      title: t('ID'),
      dataIndex: 'id',
      width: 80,
    },
    {
      title: t('配置名称'),
      dataIndex: 'name',
    },
    {
      title: t('Prompt'),
      dataIndex: 'prompt',
      render: (text) => (
        <Text
          ellipsis={{ showTooltip: true }}
          style={{ maxWidth: 300, display: 'inline-block' }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: t('Max Tokens'),
      dataIndex: 'max_tokens',
      width: 120,
    },
    {
      title: t('状态'),
      dataIndex: 'is_active',
      width: 100,
      render: (isActive, record) => (
        <Switch
          checked={isActive === 1}
          onChange={() => handleToggle(record.id)}
        />
      ),
    },
    {
      title: t('操作'),
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            icon={<IconEdit />}
            theme='light'
            type='tertiary'
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title={t('确认删除')}
            content={t('确定要删除此采样配置吗？')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              icon={<IconDelete />}
              theme='light'
              type='danger'
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <Card
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{t('采样配置管理')}</span>
            <Space>
              <Button
                icon={<IconRefresh />}
                theme='light'
                onClick={fetchData}
              >
                {t('刷新')}
              </Button>
              <Button
                icon={<IconPlus />}
                theme='solid'
                type='primary'
                onClick={handleAdd}
              >
                {t('新增配置')}
              </Button>
            </Space>
          </div>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          rowKey='id'
        />
      </Card>

      <Modal
        title={editingRecord ? t('编辑采样配置') : t('新增采样配置')}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
        afterClose={() => {
          setEditingRecord(null);
          if (formApi) formApi.reset();
        }}
      >
        <Form
          initValues={
            editingRecord
              ? {
                  name: editingRecord.name,
                  prompt: editingRecord.prompt,
                  max_tokens: editingRecord.max_tokens,
                }
              : {
                  name: '',
                  prompt: '',
                  max_tokens: 2048,
                }
          }
          onSubmit={handleSubmit}
          getFormApi={setFormApi}
        >
          <Form.Input
            field='name'
            label={t('配置名称')}
            rules={[{ required: true, message: t('请输入配置名称') }]}
            placeholder={t('如：默认采样配置')}
          />
          <Form.TextArea
            field='prompt'
            label={t('采样 Prompt')}
            rules={[{ required: true, message: t('请输入采样 Prompt') }]}
            placeholder={t('请输入用于模型性能采样的 Prompt')}
            rows={6}
          />
          <Form.InputNumber
            field='max_tokens'
            label={t('Max Tokens')}
            rules={[{ required: true, message: t('请输入 Max Tokens') }]}
            min={1}
            max={8192}
            style={{ width: '100%' }}
          />
          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button
                theme='light'
                type='tertiary'
                onClick={() => setModalVisible(false)}
              >
                {t('取消')}
              </Button>
              <Button theme='solid' type='primary' htmlType='submit'>
                {editingRecord ? t('保存') : t('创建')}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default SamplingConfigPage;
