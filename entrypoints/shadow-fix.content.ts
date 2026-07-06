import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['https://post.smzdm.com/*', 'https://zhiyou.smzdm.com/*', 'https://baijiahao.baidu.com/*', 'https://mp.toutiao.com/*', 'https://creator.douyin.com/*'],
  runAt: 'document_start',
  main() {
    const script = document.createElement('script');
    script.textContent = `(${function() {
      const orig = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(init) {
        if (init && init.mode === 'closed') init.mode = 'open';
        return orig.call(this, init);
      };
    }.toString()})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  },
});
