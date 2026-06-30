# 🖐️ Little Finger

AI 驱动的浏览器操作 Chrome 扩展。接受 AI Agent（如 Hermes Agent）的 JSON 指令，在浏览器中模拟真人操作完成文章发布、数据抓取等任务。

**核心理念**：每个平台有独立的 Adapter，AI 只负责意图解析，Adapter 负责确定性的 DOM 操作。

---

## 快速开始

### 1. 安装扩展

```bash
cd little-finger
npx wxt build -b chrome
```

加载扩展到 Chrome：
- **Windows (WSL)**: 复制到 Windows 本地路径
  ```bash
  cp -r .output/chrome-mv3/* "/mnt/c/Users/NINGMEI/little-finger-ext/"
  ```
  Chrome → 加载已解压 → `C:\Users\NINGMEI\little-finger-ext\`

- **Linux / macOS**: 直接加载
  Chrome → 加载已解压 → `little-finger/.output/chrome-mv3/`

### 2. 注册 Native Messaging Host（Agent 通信必需）

| 平台 | 安装方式 |
|------|---------|
| **Windows (WSL)** | `native-host/install.reg` → 双击导入注册表 |
| **Linux** | `bash native-host/install-linux.sh EXTENSION_ID` |
| **macOS** | `bash native-host/install-macos.sh EXTENSION_ID` |

> `EXTENSION_ID` 在 `chrome://extensions/` 中 Little Finger 卡片上显示。

### 3. 配置 AI（Side Panel 可选）

打开 Side Panel → ⚙ → 填入 DeepSeek API Key → 保存。

---

## Agent 调用方式

Little Finger 通过文件队列接收 Agent 指令：

```
Agent (Hermes)
  │
  │  python3 native-host/little-finger-cli.py '{"action":"...","title":"...","content":"..."}'
  │
  ├─ CLI 写入 ~/.little-finger/command.json
  ├─ Native Host 检测到 → 转发给 Chrome 扩展
  ├─ 扩展执行（打开标签页 → 运行 Adapter → 操作 DOM → 返回结果）
  ├─ Native Host 收到结果 → 写入 ~/.little-finger/result.json
  └─ CLI 读取结果 → 打印 JSON → Hermes 接收
```

### CLI 命令格式

**单平台发布：**
```bash
python3 native-host/little-finger-cli.py '<JSON_COMMAND>'
```

**批量发布（推荐）：**
```bash
python3 publish.py article.txt                          # 全部平台（文件模式）
python3 publish.py article.txt -p zhihu                 # 指定平台
python3 publish.py --docx report.docx --title "标题" -p toutiao  # docx导入
python3 publish.py article.txt --dry-run                # 预览不发布
```

文章文件格式：第一行标题，其余正文（Markdown）。

新增平台只需在 `publish.py` 的 `PLATFORMS` 数组中加一行：
```python
{"id": "wechat", "name": "公众号", "maxTitle": 64},
```

### CLI 单平台 JSON 格式
```

阻塞执行，超时 120 秒。返回 JSON 到 stdout。

### 支持的指令

#### 发布文章到知乎

```bash
python3 native-host/little-finger-cli.py '{
  "action": "publish_article",
  "platform": "zhihu",
  "title": "文章标题",
  "content": "文章正文（Markdown 格式，支持多行）"
}'
```

**成功返回：**
```json
{
  "success": true,
  "message": "完成",
  "data": {"title": "文章标题"}
}
```

**失败返回：**
```json
{
  "success": false,
  "message": "检测到登录页面 — 需要登录",
  "data": null
}
```

#### 注意事项

- **登录状态**：如果未登录知乎，扩展会自动打开知乎首页并等待用户登录（每 2 秒轮询，最多等 4 分钟）
- **正文格式**：支持 Markdown，由知乎编辑器渲染
- **内容长度**：无限制（Agent JSON 传完整内容，不会被 AI 截断）

### Hermes Agent 集成示例

```python
# Hermes skill 中调用 Little Finger
import subprocess, json

def publish_to_zhihu(title: str, content: str) -> dict:
    cmd = json.dumps({
        "action": "publish_article",
        "platform": "zhihu",
        "title": title,
        "content": content
    })
    result = subprocess.run(
        ["python3", "/home/eric/little-finger/native-host/little-finger-cli.py", cmd],
        capture_output=True, text=True, timeout=130
    )
    return json.loads(result.stdout)
```

---

## 架构

```
┌─────────────────────────────────────────┐
│  Agent (Hermes / CLI)                    │
│  python3 little-finger-cli.py '<json>'   │
└──────────────┬──────────────────────────┘
               │ 文件队列 (~/.little-finger/)
               ↓
┌─────────────────────────────────────────┐
│  Native Host (little-finger-host.py)     │
│  stdin/stdout ←→ Chrome Extension        │
└──────────────┬──────────────────────────┘
               │ Native Messaging
               ↓
┌─────────────────────────────────────────┐
│  Chrome Extension (Background SW)        │
│  ┌─────────────────────────────────────┐ │
│  │  Command Executor                    │ │
│  │  → AI Intent Parser (DeepSeek)      │ │
│  │  → Adapter Router                   │ │
│  │  → Step Executor                    │ │
│  └─────────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │ chrome.tabs.sendMessage
               ↓
┌─────────────────────────────────────────┐
│  Content Script (DOM Operations)         │
│  • FIND_AND_CLICK (visible text match)   │
│  • FIND_AND_TYPE (placeholder/label)     │
│  • TYPE_SELECTOR (CSS + native setter)   │
│  • SAMPLE_DOM (page state detection)     │
│  • SCROLL_PAGE (jitter + reading pause) │
└─────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| Adapter 驱动 | 平台 DOM 操作是确定性的，不应由 AI 逐步决策 |
| AI 只做意图解析 | DeepSeek 解析 "发到知乎" → `{intent, platform, title}` |
| 步骤执行器独立 | `core/executor.ts` 不依赖 UI，可在 Background SW 中运行 |
| Side Panel 可选 | Agent 调用的核心路径不经过 Side Panel |
| 文件队列通信 | Native Messaging 单向连接，文件队列实现请求-响应 |

---

## 项目结构

```
little-finger/
├── adapters/                     # 平台适配器
│   ├── base.ts                   #   IPlatformAdapter 接口
│   ├── registry.ts              #   适配器注册表
│   ├── zhihu/
│   │   ├── adapter.ts           #   知乎发布/抓取工作流
│   │   └── selectors.ts        #   DOM 选择器 + 状态检测
│   ├── wechat/                  #   公众号（待实现）
│   └── template/               #   新平台模板
├── core/
│   ├── executor.ts             #   步骤执行器（navigate/click/type/wait...）
│   ├── types.ts               #   核心类型定义
│   └── ai.ts                  #   DeepSeek API 封装
├── entrypoints/
│   ├── background.ts           #   Service Worker（Native Messaging + 命令执行）
│   ├── content.ts             #   Content Script（DOM 采样 + 操作）
│   └── sidepanel/             #   Side Panel（Vue 3 聊天 UI）
├── native-host/
│   ├── little-finger-host.py  #   Native Messaging Host
│   ├── little-finger-cli.py   #   CLI（Agent 入口）
│   └── install.sh             #   WSL 安装脚本
├── PRD.md                      #   产品需求文档
├── wxt.config.ts               #   WXT 配置
└── package.json
```

---

## Side Panel 使用（人类操作）

扩展图标 → Side Panel 打开：

### 键盘指令模式（非 AI）
- `列出按钮` — 显示当前页面按钮
- `点击 写文章` — 点击指定按钮
- `标题框 输入 Hello` — 填入内容
- `向下滚动` — 滚动页面

### AI 模式（需配置 DeepSeek Key）
- `在知乎发一篇文章，标题「XXX」，内容「YYY」`

---

## 开发新平台 Adapter

参考 `adapters/zhihu/`：

1. 创建 `adapters/<platform>/selectors.ts` — 定义 CSS 选择器和状态文本
2. 创建 `adapters/<platform>/adapter.ts` — 实现 `publish()` 生成器方法
3. 在 `background.ts` 的 `executeCommand()` 中添加路由
4. 在 Side Panel（可选）添加自然语言支持

### Step 类型

| 类型 | target | value | 说明 |
|------|--------|-------|------|
| `navigate` | URL | — | 导航到指定 URL |
| `wait` | 毫秒数 | — | 等待 |
| `find_and_click` | 按钮文字 | — | 按可见文本查找并点击 |
| `find_and_click_optional` | 按钮文字 | — | 同上，失败不中断 |
| `find_and_type` | placeholder/标签 | 输入内容 | 按标签查找并输入 |
| `find_and_type_rich` | 匹配文本 | 内容 | 富文本编辑器输入 |
| `type_selector` | CSS 选择器 | 内容 | 直接 CSS + 原生 setter |
| `sample` | 标签 | — | DOM 采样 |
| `wait_for_login` | 域名 | — | 轮询等待登录 |
| `check` | 消息 | — | 终止信号 |

---

### 平台标题字数限制

| 平台 | 限制 | 超出后果 |
|------|------|---------|
| 知乎 | 50 字 | 截断 |
| 头条号 | 35 字 | 截断 |
| 百家号 | 64 字 | 截断 |

`publish.py` 不会自动截断标题，请在文案阶段控制。

---

## 环境要求

- Node.js ≥ 22, npm ≥ 10
- Python ≥ 3.10
- WSL (Ubuntu-24.04)
- Chrome ≥ 114
- DeepSeek API Key（Side Panel AI 模式需要）
