#!/usr/bin/env python3
"""
Little Finger 批量发布入口 — 生产级
用法:
  python3 publish.py article.txt                          # 文件模式-全部平台
  python3 publish.py article.txt -p zhihu                 # 文件模式-指定平台
  python3 publish.py --docx report.docx --title "标题" -p toutiao  # docx导入
  python3 publish.py --docx report.docx --title "标题"             # 全部平台

平台注册表:
  新增平台只需在 PLATFORMS 中加一行，无需改其他代码。
"""

import subprocess, json, sys, time, argparse, os
from pathlib import Path

CLI = Path(__file__).parent / 'native-host' / 'little-finger-cli.py'

# ═══════════════════════════════════════════════
# 平台注册表 — 新增平台在此加一行
# ═══════════════════════════════════════════════
PLATFORMS: list[dict] = [
    {"id": "zhihu",    "name": "知乎",   "timeout": 180},
    {"id": "toutiao",  "name": "头条号", "timeout": 180},
    {"id": "baijiahao","name": "百家号", "timeout": 180},
]

DEFAULT_TIMEOUT = 150
MAX_RETRIES = 1  # retry once on timeout/connection error


def kill_zombies():
    """Auto-kill stale native host processes before publishing"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "little-finger-host.py"],
            capture_output=True, text=True, timeout=3,
        )
        for pid in result.stdout.strip().split():
            if pid:
                os.kill(int(pid), 9)
    except Exception:
        pass


def publish(platform: dict, title: str, content: str, docxB64: str, action: str = 'publish_article') -> dict:
    """向单个平台发布或获取URL，支持重试"""
    cmd = json.dumps({
        "action": action,
        "platform": platform["id"],
        "title": title,
        "content": content,
        "params": {"docxB64": docxB64} if docxB64 else {},
    }, ensure_ascii=False)

    timeout = platform.get("timeout", DEFAULT_TIMEOUT)

    for attempt in range(MAX_RETRIES + 1):
        import tempfile

        # Write to temp file (avoids "Argument list too long" for large docx)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, encoding='utf-8') as f:
            f.write(cmd)
            tmp_path = f.name

        try:
            result = subprocess.run(
                [sys.executable, str(CLI), '--file', tmp_path],
                capture_output=True, text=True, timeout=timeout,
            )
            resp = json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            resp = {"success": False, "error": f"Timeout after {timeout}s"}
        except json.JSONDecodeError:
            resp = {"success": False, "error": result.stdout.strip() or "unknown"}
        except Exception as e:
            resp = {"success": False, "error": str(e)}
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        if resp.get("success"):
            return resp

        # Only retry on timeout/connection errors
        error = resp.get("error", resp.get("message", ""))
        if "Timeout" not in error and "connect" not in error.lower():
            return resp

        if attempt < MAX_RETRIES:
            kill_zombies()
            time.sleep(3)

    return resp


def main():
    parser = argparse.ArgumentParser(description="Little Finger 批量发布")
    parser.add_argument("file", nargs="?", help="文章文件（第一行标题，剩余正文）")
    parser.add_argument("--title", "-t", help="文章标题（--docx 时必需）")
    parser.add_argument("--platform", "-p", help="平台列表，逗号分隔（默认全部）")
    parser.add_argument("--docx", help="docx文件路径（需配合 --title）")
    parser.add_argument("--get-url", action="store_true", help="只获取文章URL（不发布）")
    parser.add_argument("--dry-run", action="store_true", help="只显示内容，不发布")
    args = parser.parse_args()

    title = ""
    content = ""

    if args.get_url:
        if not args.platform:
            args.platform = "zhihu,toutiao,baijiahao"
        title = args.title or ""
        content = ""
    elif args.docx:
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

    # Docx base64 encoding + text extraction
    docxB64 = ""
    docxText = ""
    if args.docx:
        import base64, zipfile, xml.etree.ElementTree as ET

        docxPath = Path(args.docx)
        # Auto-translate Windows paths to WSL
        if not docxPath.exists() and "\\" in args.docx:
            wslPath = "/mnt/" + args.docx.replace(":\\", "/").replace("\\", "/").lower()
            docxPath = Path(wslPath)

        # Base64 for Toutiao/Baijiahao injection
        docxB64 = base64.b64encode(docxPath.read_bytes()).decode()

        # Text extraction for stats display
        try:
            z = zipfile.ZipFile(str(docxPath))
            xml_data = z.read('word/document.xml')
            root = ET.fromstring(xml_data)
            NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
            paras = []
            for p in root.iter(f'{{{NS}}}p'):
                line = ''.join(t.text or '' for t in p.iter(f'{{{NS}}}t'))
                paras.append(line)
            docxText = '\n'.join(paras)
        except Exception:
            pass

        print(f"📦 {docxPath.name} | base64: {len(docxB64)} chars | 文本: {len(docxText)} 字, {len(paras)} 段")

    # 确定目标平台
    if args.platform:
        target_ids = [p.strip() for p in args.platform.split(",")]
        targets = [p for p in PLATFORMS if p["id"] in target_ids]
    else:
        targets = PLATFORMS

    print(f"📄 标题: {title}")
    print(f"🎯 平台: {', '.join(p['name'] for p in targets)}\n")

    if args.dry_run:
        print("[DRY RUN] 跳过发布")
        return

    # 发布
    results = {}
    for p in targets:
        label = f"{p['name']}"
        print(f"⏳ {label} ...", end=" ", flush=True)
        t0 = time.time()
        action = 'get_article_url' if args.get_url else 'publish_article'
        result = publish(p, title, content, docxB64, action)
        elapsed = time.time() - t0
        results[p["id"]] = result

        if result.get("success"):
            url = result.get("data", {}).get("url", "")
            if url:
                print(f"🔗 {url}")
            else:
                print(f"✅ ({elapsed:.0f}s)")
        else:
            error = result.get("error") or result.get("message", "unknown")
            print(f"❌ {error} ({elapsed:.0f}s)")

    # 汇总
    success = sum(1 for r in results.values() if r.get("success"))
    fail = len(results) - success
    print()
    if fail == 0:
        print(f"🎉 全部成功 ({success}/{success})")
    else:
        print(f"✅ {success} / ❌ {fail}")
        failed = [pid for pid, r in results.items() if not r.get("success")]
        print(f"失败: {', '.join(failed)} — 重试: python3 publish.py ... -p {','.join(failed)}")


if __name__ == "__main__":
    main()
