# OfferPilot

OfferPilot 是一个纯前端 Chrome 网申辅助扩展。它可以解析 PDF、DOCX、HTML 简历，生成结构化个人档案，再使用 OpenAI Responses API 将档案事实匹配到招聘表单，供用户确认后填写。

详细说明见：[插件介绍与使用指南](使用指南.md)。

## 核心能力

- PDF、DOCX、HTML/HTM 简历在浏览器内提取文字，不上传原始文件。
- 使用 Structured Outputs 将简历文字解析为结构化个人档案。
- 解析结果先预览，再以“只填空白字段、合并不重复经历”的方式写入档案。
- 识别招聘页字段并生成保守的填写计划。
- 已有值不覆盖，敏感或低置信度字段要求人工确认。
- 不点击提交、不同意协议、不操作招聘网站的附件上传控件。

## 架构

```text
Chrome 扩展设置页
  ├─ PDF.js / Mammoth / DOMParser 提取简历文字
  ├─ chrome.storage.local 保存 API 设置和个人档案
  └─ 后台 Service Worker 调用 OpenAI Responses API

招聘页面内容脚本
  ├─ 提取字段标签、类型、候选项和当前值
  ├─ 通过后台 Agent 获取结构化匹配计划
  └─ 用户确认后填写，不自动提交
```

项目不再包含 Express 后端、`.env` 或本地端口配置。

## 安装

```bash
npm install
npm test
npm run check
npm run build:extension
```

然后在 Chrome 打开 `chrome://extensions/`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目的 `extension` 目录。

打包文件位于 [offerpilot.zip](dist/offerpilot.zip)。Chrome 开发模式应加载解压目录，而不是直接选择 ZIP。

## 配置

打开 OfferPilot 的“扩展程序选项”，在“AI Agent”中填写：

- Agent API Key
- API Base URL，默认 `https://api.ai.tosky.top/v1`
- 模型，默认 `gpt-5.6-sol`
- 推理强度，默认 `low`

使用中转或兼容服务时，Base URL 应填写 API 版本根路径，例如 `https://gateway.example.com/openai/v1`，不要加 `/responses`。服务需要支持 `GET /models`、`POST /responses` 和 Structured Outputs。点击“检测连接”时，Chrome 会请求访问该 API 域名的权限。

API Key 不会被写入源码、导出档案或发送给招聘网页。

## 安全说明

API Key 和 Base URL 保存在当前 Chrome 配置文件的扩展本地存储中，并通过 `TRUSTED_CONTEXTS` 限制为扩展页面和后台读取。内容脚本无法直接读取存储，Agent 请求设置 `store: false`。

纯前端架构无法达到服务端密钥托管的隔离级别。此版本适合个人、本地、未公开分发的使用方式；如果要发布给多用户，应恢复受控服务端或改用短期令牌，不能把共享 API Key 打包进扩展。

## 目录

```text
extension/       Chrome MV3 扩展及浏览器端 Agent
extension/vendor PDF.js 与 Mammoth 浏览器构建
demo/            招聘表单演示页
examples/        示例结构化档案
scripts/         检查、依赖同步与打包脚本
test/            客户端 Agent、档案合并和解析测试
dist/            扩展 ZIP 与界面截图
```

## 开发命令

```bash
npm test
npm run check
npm run sync:vendor
npm run build:extension
```

`build:extension` 会先从锁定的 npm 依赖同步 PDF.js 和 Mammoth 浏览器文件，再生成 `dist/offerpilot.zip`。

## 官方 API 依据

- [Responses API](https://developers.openai.com/api/reference/responses/overview)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [生产与 API Key 安全建议](https://developers.openai.com/api/docs/guides/production-best-practices)
