import React from 'react';
import { Empty } from '@douyinfe/semi-ui';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';

const ChannelAnalyticsDetail = () => {
  const { t } = useTranslation();

  return (
    <div className='flex justify-center items-center' style={{ minHeight: '80vh' }}>
      <Empty
        image={<IllustrationConstruction style={{ width: 150, height: 150 }} />}
        darkModeImage={<IllustrationConstructionDark style={{ width: 150, height: 150 }} />}
        description={t('功能开发中，敬请期待...')}
      />
    </div>
  );
};

export default ChannelAnalyticsDetail;
