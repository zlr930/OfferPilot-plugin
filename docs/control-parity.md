# 控件能力对照：牛客 1.0.8 → OfferPilot

核对日期：2026-09-08。参考用户提供的解压包 `page/content/main.entry.js`，SHA-256：`8ce9c9a4d215871ff852e04ed11dbdcf1a82f45e6a1afc177ee1d00005567a37`。

这是已确认的客户端控件分支对照，不是所有招聘网站的成功率报告。牛客的服务端实现不在解压包内；本项目不调用牛客的登录、简历或私有匹配服务，也不将其整个 bundle 带入发布包。

## 选择控件

| 牛客分支 / 模块 | OfferPilot 对应实现 | 回归入口 |
| --- | --- | --- |
| 原生输入、textarea、select（29973、DOM 输入辅助） | 原型 setter、input/change/blur、原生选项校验、单选/多选 | form-engine.spec.js |
| Ant Select / AutoComplete / Dropdown（79366、47989） | `ant` 适配：新旧下拉、搜索、唯一候选选择、多选标签 | form-engine.spec.js、advanced-controls.spec.js |
| Element Select / Autocomplete / Dropdown（86939） | `element` 适配，关联弹层、标签读回、键盘打开回退 | 同上 |
| ATSX Select / Tree（7204） | `atsx` 适配、指定祖先展开、叶子查找、树标题识别 | advanced-controls.spec.js |
| iView、MTD、Kuma、Brick（29973） | `iview`、`mtd`、`kuma`、`brick` 适配 | advanced-controls.spec.js |
| Moka 下拉（29973） | `moka` 适配、sd-Dropdown/Select/Menu | form-engine.spec.js |
| 北森 Phoenix（29973） | 输入搜索、common-unmodeled-layer、列表及地区逐层选择、局部确定按钮 | advanced-controls.spec.js |
| 飞书（40824、远程 FEISHU 配置） | ud__select__dropdown、ud__select__list__item、ud__tree 节点和展开器 | advanced-controls.spec.js |
| 智联（29973） | lxselect/ui-select、s-dialog、s-cascader 热门分类展开及确认 | advanced-controls.spec.js |
| 学校／专业选择弹窗（79366） | school-form 搜索、school-item / subject-item 选择、弹窗内确认 | advanced-controls.spec.js |
| 通用选择回退（82507、85918） | 关联 ID 优先；观察新增或显隐弹层；精确匹配优先；虚拟滚动；语义匹配回退 | advanced-controls.spec.js |

树路径以 `父级 / 子级` 表达；多选以逗号分隔多个值。对于未提供路径的树叶子，执行器可展开有明确展开器的节点进行有限查找。并列同名候选不随意选择。

## 日期控件

| 牛客分支 / 模块 | OfferPilot 日期预设 / 流程 | 验证方式 |
| --- | --- | --- |
| antCalendarWithYearSelect、antCalendar（8225、55333） | `ant-calendar` 年/十年视图、月视图、日期选择 | 年→月→日浏览器状态转换 |
| antPicker（8225、47989） | `ant` 年/月网格、精确日期标记、年月导航 | 同上及月份导航 |
| elDatePicker（8225、86939） | `element` 年/月/日网格 | 年→月→日 |
| iView / MTD / Kuma / Brick（29973） | `iview`、`mtd`、`kuma`、`brick` | 年→月→日／Brick 月份 |
| Moka / Phoenix / Feishu（8225、29973、40824） | `moka`、`phoenix`、`feishu` | 年→月→日 |
| ATSX 普通日历（55333、7204） | `atsx` 年/月/日视图 | 年→月→日 |
| ATSX period-month（55333.W） | 双列年份／月份选择；无 input 的 label 也可识别和读回 | ATSX 双列专项用例 |
| Ant / Element 日期和月份区间（47989、55333） | 两个端点合并为一个 daterange 字段；编辑弹层输入或左右日历 | 区间处理与稳定读回 |
| Fusion range（29973、8225） | `fusion` 弹层起止输入、日历和确认按钮 | readonly Fusion 区间用例 |
| MD monthrange（55333.H） | `md` 左右日历、独立年份导航、月份选择 | MD 双端专项用例 |
| 原生日期、分离年份／月份输入 | 日期格式转换和精度校验；独立年/月提取 | 原生日期和精度用例 |

日期区间统一表示为 `2020-01 / 2024-01` 或 `2020-01-01 / 2024-01-01`。分析、执行和读回都以整对端点为单位，避免把第一个端点缓存后提前报告成功。

## 富文本与执行机制

- contenteditable 使用选区和可取消的 `beforeinput(insertFromPaste)`，允许编辑器接管写入，再发送 input/change；适配飞书 adit/bitable 编辑器的事件路径（40824）。
- 原生 radio/checkbox 和 ARIA radio/checkbox/switch 通过点击控件改变状态，不只改 DOM 属性。
- 搜索选择必须执行实际选项操作；输入了搜索文字、选项未命中或点击后未提交均不报告成功。
- 支持异步候选、虚拟列表滚动、树分支展开、弹层局部确认、可见性/禁用检查、重新渲染后的唯一身份定位。
- 写入后稳定读回至少 600ms，最多等待 2200ms；批量结束再次复查前面字段，检测后续联动清空。
- 默认值保护、失败清单、单项重试、重新扫描补填继续生效。失败后保留已提交的多选项，不自动删除用户信息。

## 服务端依赖如何处理

牛客的 `fill-selector` 等候选项匹配服务，以我们自己的 `offerpilot:match-option` 后台消息和 `matchCandidateOption()` 替代。只发送当前字段标签、待填事实和候选标签，使用现有 API 配置；只接受候选集合内、置信度至少 0.95 的返回值，结果按上下文缓存。测试验证了虚构候选和低置信度返回会被拒绝。

公开 `platform-selectors.json` 的平台及飞书选择器已在核对时读取，静态规则纳入本项目适配注册表。私有站点配置接口可以返回额外日期、级联及提取规则，其完整数据没有随包提供；不能将未知规则视为已经逐项复现。新规则应作为声明式适配加入 `control-adapters.js`，并附上页面样本测试。

## 验收与边界

### Harness 执行反馈与恢复

后续匹配请求携带最近 30 条 executionFeedback（字段标签、区块、控件类型、尝试值、失败原因），与新扫描结果一起重新规划。执行器对候选未出现和写入被退回最多自动恢复一次；新计划仍回到确认界面。单个快照最多三次失败尝试。

多选和日期区间保留同一计划的失败检查点，只继续填写已批准值的缺失部分；用户修改、值改变或字段身份改变时拒绝恢复。检查点只在当前页面内存中保存，不跨刷新。ARIA 单选／复选按 radiogroup/group 扫描。虚拟列表累计最多 200 个候选标签，语义匹配可返回早先见过的候选，再重新定位。

动态弹层会通过交互后的 DOM 变化发现；具有唯一 ID 和选项证据的弹层规则按路径、控件结构和标签缓存，并通过后台按发送页 origin 保存到扩展本地存储（最多 50 条、30 天过期）。使用前重新校验，失效时丢弃并回到发现流程。此功能是本地声明式规则学习，尚不是完整的 AI 生成站点规则。验收口径见 [99% 验收基准](acceptance-99.md)。

执行 `npm test`、`npm run test:browser`、`npm run check`。浏览器测试使用本地有真实事件处理和异步状态变化的页面样本，不依赖牛客账号或外部 AI 服务。它们验证执行路径，不证明各框架所有版本或所有线上站点都已覆盖。

有意保留的差异：不为缺少日的简历日期补造 1 日；不覆盖已有内容；不通过跳过不可见/禁用字段增加成功计数；不点击投递、协议或附件上传。服务器是否保存成功仍需单独验证，DOM 稳定读回不能替代服务器回执。

未纳入此次一致性声明的范围：私有服务端未知规则、闭合 Shadow DOM、跨域 iframe、最终投递及附件上传、牛客简历服务和账号体系。多段经历的新增/保存继续使用现有记录流程，本次对齐对象是控件填写能力。
