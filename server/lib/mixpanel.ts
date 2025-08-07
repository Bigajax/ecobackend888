import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });


import mixpanel from 'mixpanel';

const mixpanelInstance = mixpanel.init(process.env.MIXPANEL_SERVER_TOKEN as string, {
  protocol: 'https',
});

export default mixpanelInstance;
