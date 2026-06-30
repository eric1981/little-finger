#!/usr/bin/env python3
"""
Little Finger 批量发布入口
用法:
  python3 publish.py article.txt                      # 发布到所有平台
  python3 publish.py article.txt --platform zhihu     # 指定平台
  python3 publish.py article.txt --platform zhihu,toutiao,baijiahao

文件格式:
  第一行 = 标题
  其余行 = 正文（Markdown）

新增平台：只需在 PLATFORMS 数组中加一行即可。
"""

import subprocess, json, sys, time, argparse
from pathlib import Path

CLI = Path(__file__).parent / 'native-host' / 'little-finger-cli.py'

# ═══════════════════════════════════════════════
# 平台注册表 — 新增平台只需在此加一行
# ═══════════════════════════════════════════════
PLATFORMS: list[dict] = [
    {"id": "zhihu",    "name": "知乎",   "maxTitle": 50},
    {"id": "toutiao",  "name": "头条号", "maxTitle": 35},
    {"id": "baijiahao","name": "百家号", "maxTitle": 64},
]

TIMEOUT = 130  # seconds per platform

def publish(platform_id: str, title: str, content: str, docxB64: str = "") -> dict:
    """向单个平台发布，返回 {'success': bool, 'message': str}"""
    cmd = json.dumps({
        "action": "publish_article",
        "platform": platform_id,
        "title": title,
        "content": content,
        "params": {"docxB64": docxB64} if docxB64 else {},
    }, ensure_ascii=False)

    result = subprocess.run(
        [sys.executable, str(CLI), cmd],
        capture_output=True, text=True, timeout=TIMEOUT,
    )
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {"success": False, "error": result.stdout.strip() or result.stderr.strip()}

def main():
    parser = argparse.ArgumentParser(description="Little Finger 批量发布")
    parser.add_argument("file", nargs="?", help="文章文件（第一行标题，剩余正文）")
    parser.add_argument("--title", "-t", help="文章标题（--docx 时必需）")
    parser.add_argument("--platform", "-p", help="平台列表，逗号分隔（默认全部）")
    parser.add_argument("--docx", help="docx文件路径（仅头条支持导入，需配合 --title）")
    parser.add_argument("--dry-run", action="store_true", help="只显示内容，不发布")
    args = parser.parse_args()

    title = ""
    content = ""

    if args.docx:
        # docx 导入模式
        if not args.title:
            print("❌ --docx 需要配合 --title 使用")
            sys.exit(1)
        title = args.title
        content = f"[从 {Path(args.docx).name} 导入]"
    elif args.file:
        text = Path(args.file).read_text(encoding="utf-8").strip()
        lines = text.split("\n", 1)
        title = lines[0].strip()
        content = lines[1].strip() if len(lines) > 1 else ""
    else:
        print("❌ 需要提供文章文件或 --docx + --title")
        sys.exit(1)

    # 处理 docx base64 编码
    docxB64 = ""
    if args.docx:
        import base64
        docxPath = Path(args.docx)
        # Auto-translate Windows paths to WSL (/mnt/c/...)
        if not docxPath.exists() and '\\' in args.docx:
            wslPath = '/mnt/' + args.docx.replace(':\\', '/').replace('\\', '/').lower()
            docxPath = Path(wslPath)
        docxB64 = base64.b64encode(docxPath.read_bytes()).decode()
        print(f"📦 docx: {docxPath.name} ({len(docxB64)} chars base64)")

    # 确定目标平台
    if args.platform:
        target_ids = [p.strip() for p in args.platform.split(",")]
        targets = [p for p in PLATFORMS if p["id"] in target_ids]
    else:
        targets = PLATFORMS

    print(f"📄 标题: {title}")
    print(f"📝 正文: {len(content)} 字")
    print(f"🎯 平台: {', '.join(p['name'] for p in targets)}")
    print()

    if args.dry_run:
        print("[DRY RUN] 跳过发布")
        return

    results = {}
    for p in targets:
        print(f"⏳ {p['name']} 发布中...", end=" ", flush=True)
        t0 = time.time()
        result = publish(p["id"], title, content, docxB64)
        elapsed = time.time() - t0
        results[p["id"]] = result

        if result.get("success"):
            print(f"✅ ({elapsed:.0f}s)")
        else:
            print(f"❌ {result.get('error') or result.get('message', 'unknown')} ({elapsed:.0f}s)")

    print(f"\n📊 结果: ", end="")
    success = sum(1 for r in results.values() if r.get("success"))
    fail = len(results) - success
    if fail == 0:
        print(f"全部成功 ✅")
    else:
        print(f"{success} 成功 / {fail} 失败")

if __name__ == "__main__":
    main()
