import mixpanel from 'mixpanel-browser';

mixpanel.init(import.meta.env.VITE_MIXPANEL_TOKEN || '', {
  debug: true, // opcional para ver no console
  api_host: 'https://api-eu.mixpanel.com'
});

console.log('MIXPANEL TOKEN:', import.meta.env.VITE_MIXPANEL_TOKEN); // ✅ Adicione aqui

export default mixpanel;
