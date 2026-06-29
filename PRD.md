# Little Finger — PRD (v0.1)

> AI 驱动的浏览器操作 Chrome 扩展。
> 接受 AI Agent 指令，模拟真人操作浏览器完成文章发布、数据抓取等任务。
> 每个平台有独立的 Adapter，平台变更时只需维护对应 Adapter。

---

## 1. 项目定位

一个能被 AI Agent（如 Hermes Agent）调遣的浏览器"手指"。

- **核心能力**：接受指令 → 打开网页 → 模拟真人操作 → 返回结果
- **两类用户**：人类（通过 Side Panel 对话）和 AI Agent（通过通信协议发送指令）
- **首批平台**：知乎、微信公众号
- **扩展平台**：掘金、抖音、小红书、快手、CSDN 等

---

## 2. 系统架构

```
┌──────────────────────────────────────────────┐
│  AI Agent (Hermes / 任意外部 Agent)            │
│  通过 Little Finger CLI 发送 JSON 指令         │
└──────────────────┬───────────────────────────┘
                   │ Native Messaging / CLI
                   ↓
┌──────────────────────────────────────────────┐
│  Little Finger 扩展 (Chrome Extension)         │
│                                                │
│  ┌────────────────┐  ┌──────────────────────┐ │
│  │  Side Panel UI  │  │  Agent Protocol      │ │
│  │  (Vue 3)        │  │  (Native Messaging)  │ │
│  │  - 对话输入      │  │  - 接收外部指令       │ │
│  │  - 任务监控      │  │  - 返回执行结果       │ │
│  │  - 历史记录      │  │  - 进度实时推送       │ │
│  └───────┬────────┘  └──────────┬───────────┘ │
│          │                      │              │
│  ┌───────┴──────────────────────┴───────────┐ │
│  │           Orchestrator (任务编排)          │ │
│  │  - 解析指令 & 分配 Adapter                 │ │
│  │  - 状态机管理（步骤调度/异常处理）          │ │
│  │  - 连接 AI 引擎获取决策                     │ │
│  └───────┬──────────────────────────────────┘ │
│          │                                     │
│  ┌───────┴──────────────────────────────────┐ │
│  │           Human Simulator (真人模拟)       │ │
│  │  - 鼠标移动（贝塞尔曲线 + 变速）            │ │
│  │  - 键盘输入（变速 + 偶尔修正）              │ │
│  │  - 滚轮操作（变速 + 回滚）                  │ │
│  │  - 操作间隔（随机延迟 + 阅读停顿）          │ │
│  └───────┬──────────────────────────────────┘ │
│          │                                     │
│  ┌───────┴──────┬───────────────────────────┐ │
│  │  Executor     │  Adapters                 │ │
│  │  (操作执行器)  │  ├─ zhihu/adapter.ts      │ │
│  │               │  ├─ wechat/adapter.ts      │ │
│  │  Content       │  ├─ juejin/adapter.ts     │ │
│  │  Script 注入   │  ├─ douyin/adapter.ts     │ │
│  │               │  └─ ...                    │ │
│  └───────────────┴───────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  AI Engine (DeepSeek API)                 │ │
│  │  - 意图解析（自然语言 → 结构化指令）        │ │
│  │  - 异常决策（遇到弹窗/验证码怎么办）         │ │
│  │  - 可能在未来接入视觉模型                    │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
                   │
                   ↓
           目标网站（知乎、公众号后台...）
```

---

## 3. AI Agent 通信协议

### 3.1 设计目标

外部 AI Agent（如 Hermes）能像调 API 一样调遣 Little Finger，无需打开 Side Panel。

### 3.2 通信方式：Native Messaging

Chrome Extension 标准通信机制。流程：

```
Hermes Agent
  │
  ├─ 生成 JSON 指令
  ├─ 写入 stdin → Native Messaging Host (Python)
  │                  │
  │                  ├─ 4 字节长度前缀 + JSON
  │                  ├─ 转发给 Chrome Extension
  │                  │
  │                  │  Little Finger 执行任务
  │                  │  实时推送进度: {type: "progress", step: "..."}
  │                  │  最终推送结果: {type: "result", data: {...}}
  │                  │
  │                  ├─ Chrome Extension 回复
  │                  └─ 输出到 stdout (4 字节长度前缀 + JSON)
  │
  └─ 读取结果
```

### 3.3 消息格式

#### 指令（Agent → Extension）

```json
{
  "id": "task_20250101_001",
  "action": "publish_article",
  "platform": "zhihu",
  "params": {
    "title": "如何用 AI 自动发布文章",
    "content": "# Markdown 内容\n\n这是正文...",
    "tags": ["AI", "自动化"],
    "cover_image": "https://example.com/cover.jpg",
    "publish_type": "public"
  },
  "options": {
    "human_speed": "normal",
    "headless": false,
    "timeout": 120000
  }
}
```

#### 进度（Extension → Agent）

```json
{
  "id": "task_20250101_001",
  "type": "progress",
  "step": "filling_title",
  "message": "正在填入标题...",
  "progress": 0.4
}
```

#### 结果（Extension → Agent）

```json
{
  "id": "task_20250101_001",
  "type": "result",
  "success": true,
  "data": {
    "url": "https://zhuanlan.zhihu.com/p/123456789",
    "platform": "zhihu",
    "published_at": "2025-01-01T12:00:00Z"
  }
}
```

#### 错误（Extension → Agent）

```json
{
  "id": "task_20250101_001",
  "type": "error",
  "success": false,
  "error": {
    "code": "LOGIN_EXPIRED",
    "message": "知乎登录已过期，请重新登录",
    "recoverable": true,
    "suggested_action": "open_login_page"
  }
}
```

### 3.4 支持的操作类型

| action | 参数 | 说明 |
|--------|------|------|
| `publish_article` | title, content, tags, cover_image | 发布文章 |
| `scrape_articles` | platform, account, count, date_range | 抓取文章列表 |
| `scrape_comments` | article_url, count | 抓取评论 |
| `scrape_stats` | platform, account | 抓取账号数据（粉丝/播放/获赞） |
| `login` | platform | 打开登录页面，等待用户扫码/输入 |
| `check_status` | platform | 检查登录状态 |
| `custom` | script (JSON workflow) | 执行自定义 Adapter 工作流 |

### 3.5 Hermes Agent 集成示例

```python
# Hermes 侧调用 Little Finger
import json
import struct
import subprocess

def little_finger(command: dict) -> dict:
    """向 Little Finger 发送指令并等待结果"""
    proc = subprocess.Popen(
        ["python3", "/path/to/little-finger-cli.py"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE
    )
    msg = json.dumps(command).encode()
    proc.stdin.write(struct.pack("<I", len(msg)) + msg)
    proc.stdin.flush()
    
    # 读取长度前缀
    raw_len = proc.stdout.read(4)
    length = struct.unpack("<I", raw_len)[0]
    response = json.loads(proc.stdout.read(length))
    return response

# Hermes 调遣 Little Finger 发布文章
result = little_finger({
    "action": "publish_article",
    "platform": "zhihu",
    "params": {"title": "...", "content": "..."}
})
```

---

## 4. 真人操作模拟

### 4.1 为什么需要

平台反爬/反自动化系统会检测：
- 鼠标轨迹是否自然（直线/瞬时移动 = 机器人）
- 键盘输入速度是否恒定（恒定间隔 = 脚本）
- 操作间隔是否机械（固定延迟 = 脚本）
- 滚动行为是否有"人味"（无随机抖动 = 爬虫）

### 4.2 模拟维度

#### 鼠标移动

```
路径: 贝塞尔曲线（起点 → 控制点 → 终点）
速度: 先加速后减速（ease-in-out）
精度: 目标点周围随机偏移 ±3px
细节: 
  - 长距离移动有中途停顿（"找按钮"）
  - 悬停后再点击（延迟 50-200ms）
  - 偶尔 overshoot 再修正
```

```typescript
interface MouseMoveConfig {
  speed: 'slow' | 'normal' | 'fast';
  curve: 'bezier2' | 'bezier3';
  overshoot: boolean;      // 是否偶尔划过再回来
  midPauseProbability: 0.1; // 中途停顿概率
}
```

#### 键盘输入

```
延迟: 每字符 50-200ms 随机（非固定间隔）
变速: 常见字符快，不常见字符慢
修正: 偶尔输错 → 退格删掉 → 重新输入（概率 ~2%）
粘贴: 长文本分段粘贴（每 20-50 字一批），之间有小延迟
中文: 使用 compositionstart/update/end 事件，模拟输入法
```

```typescript
interface TypeConfig {
  wpm: number;              // 打字速度（字/分钟），default: 40
  variance: number;         // 速度波动范围，default: 0.3
  typoRate: number;         // 输错概率，default: 0.02
  pasteChunkSize: number;   // 粘贴分段大小，default: 30
}
```

#### 滚动操作

```
速度: 非线性（先快后慢的惯性滚动）
停顿: 间隔随机停顿（"在看内容"）
回滚: 偶尔向上回滚一小段（"确认刚才的内容"）
幅度: 每次滚动距离随机偏离 ±30%
方式: 混合使用 wheel 事件和 scrollTo
```

```typescript
interface ScrollConfig {
  style: 'reading' | 'scanning' | 'searching';
  pauseProbability: number;    // 滚动后停顿概率
  backScrollProbability: number; // 回滚概率
  minPauseMs: number;          // 最短停顿
  maxPauseMs: number;          // 最长停顿
}
```

#### 操作节奏

```
思考停顿: 大操作前暂停 0.5-3s（"人在思考/阅读"）
页面加载等待: 不是固定 timeout，而是检测 DOM 稳定 + 额外随机延迟
批量操作间隔: 文章之间停顿 2-5s
会话长度: 连续操作不超过 20 分钟，然后会"休息"一下
```

### 4.3 HumanSimulator 模块

所有 DOM 操作都通过 HumanSimulator 执行，不直接调 DOM API：

```typescript
class HumanSimulator {
  // 点击：移动鼠标 → 悬停 → 点击
  async click(element: Element, config?: MouseMoveConfig): Promise<void>;
  
  // 输入：模拟真实打字
  async type(element: Element, text: string, config?: TypeConfig): Promise<void>;
  
  // 滚动：模拟真人滚动
  async scroll(container: Element, direction: 'up'|'down', 
               amount: number, config?: ScrollConfig): Promise<void>;
  
  // 等待：随机延迟
  async wait(minMs: number, maxMs: number, reason?: string): Promise<void>;
  
  // 选择下拉框：模拟鼠标操作
  async select(element: Element, value: string): Promise<void>;
  
  // 拖拽（如上传图片、排序）
  async dragDrop(source: Element, target: Element): Promise<void>;
}
```

### 4.4 风险等级

不同平台、不同操作类型的模拟强度不同：

| 平台 | 发布文章 | 抓取数据 | 登录 |
|------|---------|---------|------|
| 知乎 | normal | normal | normal |
| 公众号 | normal | high (强反爬) | normal |
| 掘金 | low | normal | low |
| 抖音 | normal | high | normal |
| 小红书 | normal | high | normal |

---

## 5. 平台 Adapter 设计

### 5.1 接口定义

```typescript
interface IPlatformAdapter {
  // 元数据
  id: string;                    // 'zhihu'
  name: string;                  // '知乎'
  domains: string[];             // ['zhihu.com', 'zhuanlan.zhihu.com']
  
  // 能力
  capabilities: {
    publish: 'markdown' | 'richtext' | 'video' | null;
    scrapeArticles: boolean;
    scrapeComments: boolean;
    scrapeStats: boolean;
    login: 'qrcode' | 'password' | 'sms' | 'auto' | null;
  };
  
  // 入口
  entryUrl: Record<string, string>;  // { creator: '...', publish: '...', dashboard: '...' }
  
  // 核心方法
  detectState(dom: DomSnapshot): PageState;
  publish(article: Article, sim: HumanSimulator): AsyncGenerator<Step, Result>;
  scrape(params: ScrapeParams, sim: HumanSimulator): AsyncGenerator<Step, Result[]>;
  login(sim: HumanSimulator): AsyncGenerator<Step, boolean>;
}
```

### 5.2 DomSnapshot（AI 看到的页面）

```typescript
interface DomSnapshot {
  url: string;
  title: string;
  bodyText: string;               // 页面可见文本（前2000字符）
  
  // 关键交互元素
  buttons: { text: string; selector: string; visible: boolean }[];
  inputs: { name: string; type: string; placeholder: string; selector: string }[];
  
  // 状态信号（文本匹配）
  signals: string[];              // ['登录', '发布成功', '验证码', '系统繁忙']
  
  // 异常
  alerts: string[];               // 弹窗/提示内容
  errors: string[];               // 错误信息
}
```

### 5.3 知乎 Adapter 关键选择器

```typescript
const ZHI_HU_SELECTORS = {
  creatorCenter: {
    writeBtn: 'a[href*="/write"], button:has-text("写文章")',
    articleList: '[class*="article"], .article-item',
  },
  editor: {
    // 多层备选（平台 UI 变更时的降级策略）
    titleInput: [
      'input[placeholder*="标题"]',
      '.WriteIndex-titleInput input',
      '[data-testid="title"]',
      '.title-input',
    ],
    contentEditor: [
      '.public-DraftEditor-content',
      '[contenteditable="true"]',
      '.rich-editor [contenteditable]',
    ],
    publishBtn: [
      'button:has-text("发布")',
      'button:has-text("发表")',
      '[data-testid="publish"]',
    ],
    topicInput: 'input[placeholder*="话题"], .topic-input input',
  },
  stateTexts: {
    loggedOut: ['登录', '账号密码登录', '手机号登录'],
    editorReady: ['写文章', '创作你的内容'],
    publishing: ['发布中', '正在发布'],
    success: ['发布成功', '已发布', '查看文章'],
    captcha: ['验证码', '安全验证', '滑块验证'],
    rateLimit: ['操作频繁', '稍后再试', '发布太频繁'],
  },
};
```

### 5.4 公众号 Adapter 特殊处理

公众号后台（mp.weixin.qq.com）的独特性：

```
编辑器结构:
  ┌─ 主页面 (mp.weixin.qq.com)
  │  ├─ iframe: 左侧菜单
  │  ├─ iframe: 正文编辑器 (核心，rich text editor)
  │  └─ iframe: 封面图选择器

Markdown → 微信富文本 转换:
  - 标题 → H1/H2/H3 对应的微信样式
  - 图片 → 需要通过微信素材管理上传后获取 media_id
  - 代码块 → 微信不支持，需替换为"引用"样式
  - 链接 → 微信不直接支持，需转为"阅读原文"或内嵌卡片

发布流程:
  1. 打开素材管理页面
  2. 新建图文 → 进入编辑器
  3. 填入标题 → 填入正文（iframe 内操作）
  4. 上传封面图（需等待微信压缩处理）
  5. 填写摘要（非必填，从正文截取前 120 字）
  6. 保存草稿 → 预览 → 发布（可能需要扫码确认）
```

---

## 6. 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 扩展框架 | **WXT** (TypeScript) | Manifest V3 最佳开发体验，热更新，多入口支持 |
| UI | **Vue 3** + Pinia | 你熟悉的栈，组件化 |
| AI 引擎 | **DeepSeek API** | 已有 Key，成本低 |
| Agent 通信 | **Chrome Native Messaging** | Chrome 标准，基于 stdin/stdout |
| 构建 | **Vite** (WXT 内置) | 快，支持 TS |
| 存储 | **chrome.storage.local** | 任务历史、配置、暂存 |

---

## 7. 项目结构

```
little-finger/
├── adapters/
│   ├── base.ts                    # IPlatformAdapter 接口
│   ├── registry.ts                # Adapter 注册表
│   ├── zhihu/
│   │   ├── adapter.ts
│   │   ├── selectors.ts
│   │   └── workflows.ts
│   ├── wechat/
│   │   ├── adapter.ts
│   │   ├── selectors.ts
│   │   └── workflows.ts
│   └── template/                  # 新平台模板
│       ├── adapter.ts.tmpl
│       └── selectors.ts.tmpl
├── core/
│   ├── ai.ts                      # DeepSeek API 封装
│   ├── orchestrator.ts            # 任务编排状态机
│   ├── executor.ts                # 操作执行器（调度 Content Script）
│   ├── sampler.ts                 # DOM 采样（生成 DomSnapshot）
│   ├── human-simulator.ts         # 真人模拟（鼠标/键盘/滚动/节奏）
│   ├── protocol.ts                # Agent 通信协议处理
│   └── types.ts                   # 核心类型定义
├── sidepanel/
│   ├── index.html                 # Side Panel 入口
│   ├── App.vue
│   ├── components/
│   │   ├── ChatPanel.vue          # 对话输入 + 消息历史
│   │   ├── TaskMonitor.vue        # 任务进度实时显示
│   │   ├── PlatformConfig.vue     # 平台配置
│   │   └── LogViewer.vue          # 操作日志
│   └── stores/
│       └── task.ts                # Pinia 任务状态
├── content/
│   └── index.ts                   # Content Script 注入 + executor 通信
├── background/
│   └── index.ts                   # Service Worker（Agent 协议 + 持久化）
├── native-host/
│   ├── little-finger-host.py      # Native Messaging Host（Python）
│   ├── install.sh                 # 注册 Native Messaging Host
│   └── manifest.json.tmpl         # Native Host manifest 模板
├── entrypoints/                   # WXT 自动生成的入口配置
├── wxt.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 8. 开发阶段

| 阶段 | 内容 | 产出 | 验证标准 |
|------|------|------|---------|
| **Phase 0** | WXT 脚手架 + 项目骨架 | 扩展能加载到 Chrome | Side Panel 能打开 |
| **Phase 1** | Content Script + DOM Sampler | 能读取目标页面 DOM | 采样结果显示在 Side Panel |
| **Phase 2** | HumanSimulator 核心 | 鼠标/键盘/滚动模拟 | 自动化操作能被 chrome.debugger 录制回放 |
| **Phase 3** | DeepSeek AI 引擎 | 意图解析 + 异常决策 | 输入"发到知乎"→ 返回结构化 plan |
| **Phase 4** | Orchestrator + Executor | 端到端操作闭环 | 能在知乎编辑器里自动填表 |
| **Phase 5** | 知乎 Adapter | 完整发布流程 | 一句话 → 知乎文章发布成功 |
| **Phase 6** | 公众号 Adapter | 对接微信后台 | Markdown → 公众号草稿箱 |
| **Phase 7** | Agent 通信协议 | Native Messaging 联通 | Hermes 发指令 → 扩展执行 → 返回结果 |
| **Phase 8+** | 掘金 / 抖音 / 小红书... | 扩展 Adapter | 按需 |

---

## 9. 风险 & 应对

| 风险 | 影响 | 对策 |
|------|------|------|
| 平台 UI 更新导致选择器失效 | 任务失败 | 多备选选择器 + AI 根据文本描述重新定位元素 |
| 反爬升级（验证码频率增加） | 不可用 | 降低操作频率 + 接入人工验证码打断机制 |
| Chrome 限制 Content Script 权限 | 部分平台无法注入 | 准备 chrome.debugger API 作为备选方案 |
| Manifest V3 Service Worker 休眠 | 长任务中断 | 关键状态存 chrome.storage，恢复后可续接 |
| 公众号 iframe 内操作复杂 | 开发周期变长 | 优先处理正文编辑器 iframe，菜单使用 URL 直接跳转 |

---

## 10. 命名来源

"Little Finger" — 《权力的游戏》中的培提尔·贝里席（Petyr Baelish）的绰号。

> "Chaos isn't a pit. Chaos is a ladder."
>
> 混乱不是深渊，混乱是阶梯。

这个扩展就是 AI Agent 在浏览器世界的"小指头"——在每个平台间游走，完成各种任务。
