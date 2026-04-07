/*
LDAP 认证配置组件
*/

import React, { useState, useRef } from 'react';
import {
  Button,
  Form,
  Row,
  Col,
  Typography,
  Banner,
  Card,
  Input,
  Switch,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess, toBoolean } from '../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const LDAPSetting = () => {
  const { t } = useTranslation();
  const formApiRef = useRef(null);

  const [inputs, setInputs] = useState({
    'ldap.enabled': false,
    'ldap.url': '',
    'ldap.user': '',
    'ldap.password': '',
    'ldap.type': '(employeeID=%s)',
    'ldap.sc': '',
    'ldap.ldaps': false,
    'ldap.skip_tls': false,
    'ldap.map': '{"real_name":"cn","email":"mail","department":"department"}',
    'ldap.test_user': '',
    'ldap.test_pass': '',
  });

  const [loading, setLoading] = useState(false);

  // 加载 LDAP 配置
  const loadLDAPConfig = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, data } = res.data;
      if (success) {
        const ldapInputs = {};
        data.forEach((item) => {
          if (item.key.startsWith('ldap.')) {
            if (item.key === 'ldap.enabled' || item.key === 'ldap.ldaps' || item.key === 'ldap.skip_tls') {
              ldapInputs[item.key] = toBoolean(item.value);
            } else {
              ldapInputs[item.key] = item.value || '';
            }
          }
        });
        setInputs(ldapInputs);
        if (formApiRef.current) {
          formApiRef.current.setValues(ldapInputs);
        }
      }
    } catch (error) {
      showError(t('加载 LDAP 配置失败'));
    }
    setLoading(false);
  };

  // 保存 LDAP 配置
  const saveLDAPConfig = async () => {
    setLoading(true);
    const options = [];
    const formValues = formApiRef.current?.getValues() || {};

    Object.keys(inputs).forEach((key) => {
      let value = formValues[key] !== undefined ? formValues[key] : inputs[key];
      if (typeof value === 'boolean') {
        value = value.toString();
      }
      options.push({ key, value });
    });

    try {
      for (const opt of options) {
        await API.put('/api/option/', opt);
      }
      showSuccess(t('LDAP 配置已保存'));
      setInputs(formValues);
    } catch (error) {
      showError(t('保存 LDAP 配置失败'));
    }
    setLoading(false);
  };

  // 测试 LDAP 连接
  const testLDAPConnection = async () => {
    setLoading(true);
    try {
      // 保存配置后再测试
      const formValues = formApiRef.current?.getValues() || {};
      const testUser = formValues['ldap.test_user'] || '';
      const testPass = formValues['ldap.test_pass'] || '';

      if (!testUser || !testPass) {
        showError(t('请填写测试用户和密码'));
        setLoading(false);
        return;
      }

      // 先保存配置
      const options = [];
      Object.keys(inputs).forEach((key) => {
        let value = formValues[key] !== undefined ? formValues[key] : inputs[key];
        if (typeof value === 'boolean') {
          value = value.toString();
        }
        options.push({ key, value });
      });

      for (const opt of options) {
        await API.put('/api/option/', opt);
      }

      // 提示用户手动测试
      showSuccess(t('配置已保存，请使用测试用户进行认证测试'));
    } catch (error) {
      showError(t('测试 LDAP 连接失败') + ': ' + error.message);
    }
    setLoading(false);
  };

  return (
    <Card>
      <Form.Section text={t('LDAP 认证配置')}>
        <Banner
          type='info'
          description={t(
            'LDAP 认证支持通过企业 LDAP/Active Directory 验证员工身份，自动创建用户和令牌。令牌值为员工工号。',
          )}
          style={{ marginBottom: 20, marginTop: 16 }}
        />

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={24} md={24} lg={24} xl={24}>
            <Form.Switch
              field="['ldap.enabled']"
              label={t('启用 LDAP 认证')}
              checked={inputs['ldap.enabled']}
              onChange={(checked) => setInputs({ ...inputs, 'ldap.enabled': checked })}
            />
          </Col>
        </Row>

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.url']"
              label={t('LDAP 服务器地址')}
              placeholder='ldap.example.com:389'
              extraText={t('格式：host:port，例如 ldap.example.com:389')}
            />
          </Col>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.sc']"
              label={t('Base DN')}
              placeholder='dc=example,dc=com'
              extraText={t('搜索基准 DN')}
            />
          </Col>
        </Row>

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.user']"
              label={t('管理员 DN')}
              placeholder='cn=admin,dc=example,dc=com'
              extraText={t('用于绑定 LDAP 的管理员账号')}
            />
          </Col>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.password']"
              label={t('管理员密码')}
              type='password'
              placeholder='••••••••'
              extraText={t('管理员账号密码')}
            />
          </Col>
        </Row>

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.type']"
              label={t('搜索过滤器')}
              placeholder='(employeeID=%s)'
              extraText={t('用户搜索过滤器，%s 会被替换为工号。AD 使用 (sAMAccountName=%s)')}
            />
          </Col>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.map']"
              label={t('属性映射')}
              placeholder='{"real_name":"cn","email":"mail","department":"department"}'
              extraText={t('JSON 格式，定义 LDAP 属性到系统字段的映射')}
            />
          </Col>
        </Row>

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Switch
              field="['ldap.ldaps']"
              label={t('启用 LDAPS')}
              checked={inputs['ldap.ldaps']}
              onChange={(checked) => setInputs({ ...inputs, 'ldap.ldaps': checked })}
            />
          </Col>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Switch
              field="['ldap.skip_tls']"
              label={t('跳过 TLS 验证')}
              checked={inputs['ldap.skip_tls']}
              onChange={(checked) => setInputs({ ...inputs, 'ldap.skip_tls': checked })}
            />
          </Col>
        </Row>

        <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.test_user']"
              label={t('测试用户')}
              placeholder='test'
              extraText={t('用于测试连接的测试用户工号')}
            />
          </Col>
          <Col xs={24} sm={12} md={12} lg={12} xl={12}>
            <Form.Input
              field="['ldap.test_pass']"
              label={t('测试密码')}
              type='password'
              placeholder='••••••••'
              extraText={t('测试用户密码')}
            />
          </Col>
        </Row>

        <Row style={{ marginTop: '15px' }}>
          <Col xs={24} sm={24} md={24} lg={24} xl={24}>
            <Button onClick={saveLDAPConfig} loading={loading} style={{ marginRight: '10px' }}>
              {t('保存 LDAP 配置')}
            </Button>
            <Button onClick={testLDAPConnection} loading={loading} theme='light'>
              {t('测试连接')}
            </Button>
          </Col>
        </Row>
      </Form.Section>
    </Card>
  );
};

export default LDAPSetting;
