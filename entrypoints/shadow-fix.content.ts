export default defineContentScript({
  matches: ['<all_urls>'],
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
