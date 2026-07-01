// Fallback communication for pages that intercept chrome.runtime (smzdm probev3.js)
// Works alongside chrome.tabs.sendMessage — if it fails, falls back to window.__lf_cmd
export function sendToContent(tabId: number, msg: Record<string, unknown>, cb: (r: any) => void) {
  chrome.tabs.sendMessage(tabId, msg, (r) => {
    if (!chrome.runtime.lastError && r) return cb(r);
    const t0 = Date.now();
    chrome.scripting.executeScript({ target:{tabId}, world:'ISOLATED',
      func: (s: string) => { (window as any).__lf_cmd = JSON.parse(s); },
      args: [JSON.stringify(msg)],
    }, () => {
      const fn = () => { chrome.scripting.executeScript({ target:{tabId}, world:'ISOLATED',
        func: () => { const r = (window as any).__lf_result; (window as any).__lf_result = undefined; return r; },
      }, ([res]) => { if (res?.result) cb(res.result); else if (Date.now()-t0<30000) setTimeout(fn,500); else cb(null); }); };
      fn();
    });
  });
}
