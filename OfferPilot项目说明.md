# OfferPilot 项目说明

## 项目定位

OfferPilot 是一个纯前端 Chrome MV3 网申辅助扩展。它在浏览器内解析简历、维护结构化档案，并由后台 Service Worker 直接调用用户配置的 OpenAI Responses 兼容 API 生成填写计划。

## 技术架构

```text
OfferPilot Chrome 扩展
├── 设置页
│   ├── PDF.js 解析 PDF
│   ├── Mammoth 解析 DOCX
│   ├── DOMParser 解析 HTML
│   └── 档案预览、合并与编辑
├── 后台 Service Worker
│   ├── Agent API Key、Base URL 配置隔离
│   ├── 自定义 API 域名运行时授权
│   ├── Structured Outputs 请求
│   └── 本地结果校验
├── 招聘页内容脚本
│   ├── 字段提取
│   ├── 建议预览
│   └── 用户确认后填写
└── 测试与打包脚本
```

项目不包含应用后端、数据库、`.env` 或本地监听端口。

## 数据边界

- API Key、Base URL 和档案保存在 `chrome.storage.local`。
- 存储设为 `TRUSTED_CONTEXTS`，内容脚本通过后台获取档案，不能直接读取 Key。
- 原始简历文件在设置页内存中解析，不上传原文件。
- 提取后的简历文字和招聘字段元数据会发送到用户配置的 Agent API。
- 请求设置 `store: false`。
- Agent 不编造缺失事实，不覆盖已有字段，不自动提交表单。

纯前端密钥存储适合个人本地版本。如果公开分发，应改用用户自有授权或受控服务端短期令牌，不能内置共享 Key。

## 目录

```text
extension/       扩展源码、Agent 客户端和文件解析器
extension/vendor 浏览器端 PDF.js 与 Mammoth
demo/            招聘表单演示页
examples/        示例档案
scripts/         依赖同步、检查和打包
test/            客户端逻辑测试
dist/            打包结果与截图
```

## 开发命令

```bash
npm install
npm test
npm run check
npm run sync:vendor
npm run build:extension
```

## 后续方向

1. 使用脱敏页面样本建立招聘平台兼容性测试集。
2. 为高频自定义控件增加确定性适配器。
3. 为扫描 PDF 增加可选 OCR。
4. 增加职位描述与经历匹配建议。
5. 为公开分发版本设计短期令牌与用量隔离。
