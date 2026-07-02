import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Little Finger',
    description: 'AI-driven browser automation with platform adapters',
    version: '0.1.0',
    icons: {
      16: 'icon.svg',
      48: 'icon.svg',
      128: 'icon.svg',
    },
    action: {
      default_title: 'Little Finger',
      default_icon: 'icon.svg',
    },
    permissions: [
      'activeTab',
      'storage',
      'scripting',
      'sidePanel',
      'nativeMessaging',
      'tabs',
    ],
    host_permissions: [
      'https://*.zhihu.com/*',
      'https://mp.weixin.qq.com/*',
      'https://*.toutiao.com/*',
      'https://mp.toutiao.com/*',
      'https://baijiahao.baidu.com/*',
      'https://om.qq.com/*',
      'https://post.smzdm.com/*',
      'https://zhiyou.smzdm.com/*',
      'https://creator.xiaohongshu.com/*',
      'https://juejin.cn/*',
    ],
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
  },
});
