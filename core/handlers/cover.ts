/**
 * Cover image upload — reactClick + Pexels search + upload + confirm.
 */

// ─── JPEG Conversion ───

async function convertToJpeg(blob: Blob): Promise<File> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const jpegBlob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));
  return new File([jpegBlob], 'cover.jpg', { type: 'image/jpeg' });
}

// ─── React-aware click ───

function reactClick(el: Element | null): boolean {
  if (!el) return false;

  // Approach 1: Find React fiber and invoke onClick directly
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (fiberKey) {
    let fiber: any = (el as any)[fiberKey];
    for (let i = 0; fiber && i < 10; i++) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props?.onClick) {
        if (props.onMouseDown) props.onMouseDown({ nativeEvent: {}, target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
        props.onClick({ nativeEvent: {}, target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
        return true;
      }
      fiber = fiber.return;
    }
  }

  // Approach 2: Try __reactProps (React 18+)
  const reactKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
  if (reactKey) {
    const props = (el as any)[reactKey];
    if (props?.onClick) {
      props.onClick({ target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
      return true;
    }
  }

  // Approach 3: native event fallback
  const rect = el.getBoundingClientRect();
  ['pointerdown', 'pointerup', 'click'].forEach(type => {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0, pointerId: 1,
    }));
  });
  return false;
}

// ─── Pexels Cover Upload ───

async function uploadCoverImage(query: string, coverInputSelector: string = '') {
  try {
    // 1. Search Pexels via Background SW (no CORS restrictions)
    const searchResp = await chrome.runtime.sendMessage({
      type: 'SEARCH_PEXELS', id: 'cover_search', text: query,
    });
    if (!searchResp?.success) return { success: false, error: searchResp?.error || 'Pexels搜索失败' };
    const imageUrl = searchResp.imageUrl;
    if (!imageUrl) return { success: false, error: '未找到图片' };

    // 2. Fetch & convert to JPEG
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    let file: File;
    if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
      file = new File([blob], 'cover.jpg', { type: blob.type });
    } else {
      file = await convertToJpeg(blob);
    }

    // 3. Click cover button — platform-aware selector
    let clickable: Element | null = null;
    const host = location.hostname;
    
    if (host.includes('baijiahao.baidu.com')) {
      clickable = document.evaluate(
        '//*[@id="bjhNewsCover"]/div/div/div[2]/div/div/div[2]/div/div/div/div/div/div[2]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue as Element;
    } else if (host.includes('toutiao.com')) {
      clickable = document.querySelector('.article-cover-add');
    }
    
    if (!clickable) return { success: false, error: '找不到封面按钮（平台: ' + host + '）' };

    // PointerEvent for cover button
    const beforeEl = document.body.querySelectorAll('*').length;
    const rect = clickable.getBoundingClientRect();
    ['pointerdown', 'pointerup', 'click'].forEach(type => {
      clickable!.dispatchEvent(new PointerEvent(type as any, {
        bubbles: true, cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0, pointerId: 1,
      }));
    });
    await wait(randomBetween(1000, 1500));
    
    const afterEl = document.body.querySelectorAll('*').length;
    if (afterEl <= beforeEl) {
      return { success: false, error: '封面弹窗未打开（DOM无变化）' };
    }

    // 3b. Find file input (from adapter config)
    let fi: HTMLInputElement | null = null;
    if (coverInputSelector) {
      fi = document.querySelector(coverInputSelector) as HTMLInputElement | null;
    }
    if (!fi) fi = document.querySelector('input[type="file"]:not([accept*="video"])') as HTMLInputElement | null;
    if (!fi) { fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; document.body.appendChild(fi); }
    
    const dt = new DataTransfer(); dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    fi.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(randomBetween(3000, 5000));

    const confirmBtn = findByVisibleText('确定') || findByVisibleText('确认') || findByVisibleText('完成') || findByVisibleText('保存');
    if (!confirmBtn) return { success: false, error: '找不到确定按钮' };
    (confirmBtn as HTMLElement).click();
    await wait(1000);

    return { success: true, message: '封面图已上传' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
