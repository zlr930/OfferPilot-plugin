import {
  calculateCompleteness,
  compactProfile,
  createEmptyProfile,
  createEmptyRecord,
  mergeParsedResume,
  normalizeProfile,
  PROFILE_SCHEMA_VERSION,
} from "./profile-model.js";
import { extractResumeFile } from "./resume-parser.js";
import {
  DEFAULT_API_BASE_URL,
  normalizeBaseUrl,
} from "./openai-client.js";

const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_REASONING_EFFORT = "low";
const LEGACY_DEFAULT_API_BASE_URLS = new Set([
  "https://api.openai.com/v1",
  "https://api.tosky.top/v1",
]);
const PROFILE_STORAGE_KEYS = ["profile", "profileVersion", "resumeText"];
const extensionApi = globalThis.chrome?.storage?.local
  ? globalThis.chrome
  : createPreviewApi();

const SECTIONS = [
  {
    id: "basic",
    title: "基础信息",
    description: "联系方式与身份信息。证件类敏感字段可以留空，填写时仍需人工确认。",
    fields: [
      ["fullName", "姓名", "text", "如：张三", true],
      ["preferredName", "英文名 / 常用名", "text", "选填"],
      ["gender", "性别", "select", ["", "男", "女", "其他 / 不便透露"]],
      ["birthDate", "出生日期", "date"],
      ["phone", "手机号", "tel", "常用手机号", true],
      ["email", "邮箱", "email", "常用邮箱", true],
      ["wechat", "微信号", "text", "选填"],
      ["currentCity", "现居城市", "text", "如：上海", true],
      ["hometown", "籍贯", "text", "省 / 市"],
      ["address", "联系地址", "text", "选填", false, "wide"],
      ["nationality", "国籍", "text", "如：中国"],
      ["politicalStatus", "政治面貌", "select", ["", "中共党员", "中共预备党员", "共青团员", "群众", "其他"]],
      ["idType", "证件类型", "select", ["", "居民身份证", "护照", "港澳居民来往内地通行证", "台湾居民来往大陆通行证", "其他"]],
      ["idNumber", "证件号码", "text", "敏感信息，按需填写"],
    ],
  },
  {
    id: "preferences",
    title: "求职意向",
    description: "不同公司岗位名称不同，建议同时填写职能方向和目标城市。",
    fields: [
      ["targetRoles", "目标岗位", "text", "多个岗位用逗号分隔", true, "wide"],
      ["targetCities", "意向城市", "text", "多个城市用逗号分隔", true],
      ["employmentType", "求职类型", "select", ["", "校园招聘", "实习", "社会招聘"]],
      ["earliestStartDate", "最早到岗日期", "date"],
      ["expectedSalary", "期望薪资", "text", "选填"],
      ["willingToRelocate", "是否接受调剂", "select", ["", "是", "否"]],
    ],
  },
  {
    id: "education",
    title: "教育背景",
    description: "从最高学历开始填写；每段教育经历独立保存。",
    repeat: true,
    addLabel: "添加教育经历",
    fields: [
      ["school", "学校", "text", "学校全称", true],
      ["college", "院系", "text", "学院 / 系"],
      ["major", "专业", "text", "专业全称", true],
      ["degree", "学历", "select", ["", "博士", "硕士", "本科", "大专", "高中及以下"], true],
      ["educationType", "培养方式", "select", ["", "全日制", "非全日制", "海外 / 港澳台"]],
      ["startDate", "入学时间", "month"],
      ["endDate", "毕业时间", "month"],
      ["gpa", "GPA / 平均分", "text", "如：3.7/4.0 或 88/100"],
      ["rank", "专业排名", "text", "如：前 10%"],
      ["courses", "主修课程", "textarea", "填写与目标岗位相关的课程", false, "wide"],
    ],
  },
  {
    id: "internships",
    title: "实习经历",
    description: "建议用动作、任务和可验证结果描述工作内容。",
    repeat: true,
    addLabel: "添加实习经历",
    fields: [
      ["company", "公司", "text", "公司全称", true],
      ["department", "部门", "text", "所属部门"],
      ["role", "职位", "text", "实习岗位", true],
      ["city", "工作城市", "text", "城市"],
      ["startDate", "开始时间", "month"],
      ["endDate", "结束时间", "month"],
      ["description", "工作内容", "textarea", "职责、使用的方法与协作对象", true, "wide"],
      ["achievements", "成果亮点", "textarea", "尽量写清指标、规模或业务结果", false, "wide"],
    ],
  },
  {
    id: "projects",
    title: "项目背景",
    description: "课程、科研、竞赛和个人项目都可以记录。",
    repeat: true,
    addLabel: "添加项目经历",
    fields: [
      ["name", "项目名称", "text", "项目全称", true],
      ["role", "担任角色", "text", "如：项目负责人", true],
      ["startDate", "开始时间", "month"],
      ["endDate", "结束时间", "month"],
      ["link", "项目链接", "url", "作品、仓库或演示地址", false, "wide"],
      ["stack", "工具 / 技术", "text", "多个关键词用逗号分隔", false, "wide"],
      ["description", "项目说明", "textarea", "背景、目标和你的具体工作", true, "wide"],
      ["achievements", "项目成果", "textarea", "结果、数据或最终产出", false, "wide"],
    ],
  },
  {
    id: "campus",
    title: "校园经历",
    description: "学生组织、志愿服务、社团或其他校园任职。",
    repeat: true,
    addLabel: "添加校园经历",
    fields: [
      ["organization", "组织名称", "text", "组织 / 社团 / 活动", true],
      ["role", "担任职务", "text", "职务或角色", true],
      ["startDate", "开始时间", "month"],
      ["endDate", "结束时间", "month"],
      ["description", "经历描述", "textarea", "职责与主要工作", true, "wide"],
      ["achievements", "成果亮点", "textarea", "活动规模、影响或结果", false, "wide"],
    ],
  },
  {
    id: "awards",
    title: "获得奖项",
    description: "奖学金、竞赛名次、荣誉称号和专业认证均可记录。",
    repeat: true,
    addLabel: "添加奖项",
    fields: [
      ["name", "奖项名称", "text", "奖项 / 荣誉全称", true],
      ["level", "奖项级别", "select", ["", "国际级", "国家级", "省级", "市级", "校级", "院级", "其他"]],
      ["issuer", "颁发机构", "text", "机构或主办方"],
      ["date", "获得时间", "month"],
      ["description", "奖项说明", "textarea", "名次、参赛规模或评选标准", false, "wide"],
    ],
  },
  {
    id: "skills",
    title: "技能与证书",
    description: "使用招聘页面上常见的标准名称，便于 Agent 匹配关键词。",
    fields: [
      ["technical", "专业技能", "textarea", "工具、语言、平台或专业方法", true, "wide"],
      ["languages", "语言能力", "textarea", "如：英语 CET-6 560；日语 N2", false, "wide"],
      ["certificates", "证书资质", "textarea", "证书名称、等级和获得时间", false, "wide"],
    ],
  },
  {
    id: "selfEvaluation",
    title: "自我评价",
    description: "概括与你目标岗位相关的能力、经验和工作方式。",
    rootField: true,
    fields: [["selfEvaluation", "自我评价", "textarea", "建议 100–300 字，避免空泛形容词", true, "wide", 8]],
  },
  {
    id: "additionalNotes",
    title: "补充信息",
    description: "可放作品集、个人主页、资格限制说明或旧版简历原文。",
    rootField: true,
    fields: [["additionalNotes", "其他信息", "textarea", "选填", false, "wide", 7]],
  },
];

const dom = {
  form: document.querySelector("#profileForm"),
  nav: document.querySelector("#sectionNav"),
  completionValue: document.querySelector("#completionValue"),
  completionBar: document.querySelector("#completionBar"),
  completionMeta: document.querySelector("#completionMeta"),
  migrationNotice: document.querySelector("#migrationNotice"),
  importButton: document.querySelector("#importButton"),
  exportButton: document.querySelector("#exportButton"),
  clearProfileButton: document.querySelector("#clearProfileButton"),
  fileInput: document.querySelector("#fileInput"),
  parseResumeButton: document.querySelector("#parseResumeButton"),
  resumeFileInput: document.querySelector("#resumeFileInput"),
  resumeParseDialog: document.querySelector("#resumeParseDialog"),
  resumeParseSummary: document.querySelector("#resumeParseSummary"),
  resumeParseMeta: document.querySelector("#resumeParseMeta"),
  resumeParsePreview: document.querySelector("#resumeParsePreview"),
  resumeParseWarnings: document.querySelector("#resumeParseWarnings"),
  resumeProgress: document.querySelector("#resumeProgress"),
  resumeProgressTitle: document.querySelector("#resumeProgressTitle"),
  resumeProgressDetail: document.querySelector("#resumeProgressDetail"),
  resumeProgressValue: document.querySelector("#resumeProgressValue"),
  resumeProgressTrack: document.querySelector("#resumeProgressTrack"),
  resumeProgressBar: document.querySelector("#resumeProgressBar"),
  closeResumeDialogButton: document.querySelector("#closeResumeDialogButton"),
  cancelResumeButton: document.querySelector("#cancelResumeButton"),
  applyResumeButton: document.querySelector("#applyResumeButton"),
  replaceResumeButton: document.querySelector("#replaceResumeButton"),
  saveButton: document.querySelector("#saveButton"),
  saveMessage: document.querySelector("#saveMessage"),
};

let profile = createEmptyProfile();
let openaiApiKeyValue = "";
let openaiBaseUrlValue = DEFAULT_API_BASE_URL;
let openaiModelValue = DEFAULT_OPENAI_MODEL;
let reasoningEffortValue = DEFAULT_REASONING_EFFORT;
let saveTimer;
let activeResumeParseId = "";
let parsedResumeResult = null;

await initialize();

async function initialize() {
  const settings = await extensionApi.storage.local.get([
    "openaiApiKey",
    "openaiBaseUrl",
    "openaiModel",
    "reasoningEffort",
    "profile",
    "resumeText",
  ]);
  openaiApiKeyValue = settings.openaiApiKey || "";
  openaiBaseUrlValue =
    !settings.openaiBaseUrl ||
    LEGACY_DEFAULT_API_BASE_URLS.has(settings.openaiBaseUrl)
      ? DEFAULT_API_BASE_URL
      : settings.openaiBaseUrl;
  openaiModelValue = settings.openaiModel || DEFAULT_OPENAI_MODEL;
  reasoningEffortValue = settings.reasoningEffort || DEFAULT_REASONING_EFFORT;
  profile = normalizeProfile(settings.profile);

  if (!settings.profile && String(settings.resumeText || "").trim()) {
    profile.additionalNotes = String(settings.resumeText).trim();
    dom.migrationNotice.hidden = false;
    dom.migrationNotice.textContent =
      "已将旧版简历内容迁移到“补充信息”。建议逐项完善结构化档案，以提高匹配准确率。";
  }

  renderPage();
  bindGlobalEvents();
  updateCompleteness();
}

function renderPage() {
  dom.form.replaceChildren();
  dom.nav.replaceChildren();

  const connectionTemplate = document.querySelector("#connectionTemplate");
  dom.form.append(connectionTemplate.content.cloneNode(true));
  const apiKeyInput = document.querySelector("#openaiApiKey");
  const baseUrlInput = document.querySelector("#openaiBaseUrl");
  const modelInput = document.querySelector("#openaiModel");
  const reasoningSelect = document.querySelector("#reasoningEffort");
  apiKeyInput.value = openaiApiKeyValue;
  baseUrlInput.value = openaiBaseUrlValue;
  modelInput.value = openaiModelValue;
  reasoningSelect.value = reasoningEffortValue;
  apiKeyInput.addEventListener("input", (event) => {
    openaiApiKeyValue = event.target.value;
    markChanged();
  });
  baseUrlInput.addEventListener("input", (event) => {
    openaiBaseUrlValue = event.target.value;
    markChanged();
  });
  modelInput.addEventListener("input", (event) => {
    openaiModelValue = event.target.value;
    markChanged();
  });
  reasoningSelect.addEventListener("change", (event) => {
    reasoningEffortValue = event.target.value;
    markChanged();
  });
  document.querySelector("#showApiKey").addEventListener("change", (event) => {
    apiKeyInput.type = event.target.checked ? "text" : "password";
  });
  document.querySelector("#testButton").addEventListener("click", testConnection);
  addNavItem("connection", "AI Agent");

  for (const section of SECTIONS) {
    addNavItem(section.id, section.title);
    dom.form.append(createSection(section));
  }
}

function addNavItem(id, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.target = id;
  button.addEventListener("click", () => {
    document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
  dom.nav.append(button);
}

function createSection(section) {
  const element = document.createElement("section");
  element.className = "form-section";
  element.dataset.section = section.id;

  const heading = document.createElement("div");
  heading.className = "section-heading";
  const headingCopy = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = section.title;
  const description = document.createElement("p");
  description.textContent = section.description;
  headingCopy.append(title, description);
  heading.append(headingCopy);
  element.append(heading);

  if (section.repeat) {
    const list = document.createElement("div");
    list.className = "repeat-list";
    list.dataset.repeatList = section.id;
    renderRepeatList(section, list);
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button add-button";
    addButton.textContent = `＋ ${section.addLabel}`;
    addButton.addEventListener("click", () => {
      profile[section.id].push(createEmptyRecord(section.id));
      renderRepeatList(section, list);
      markChanged();
      list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    element.append(list, addButton);
  } else {
    const grid = document.createElement("div");
    grid.className = "field-grid";
    for (const field of section.fields) {
      const path = section.rootField ? [field[0]] : [section.id, field[0]];
      grid.append(createField(field, path));
    }
    element.append(grid);
  }

  return element;
}

function renderRepeatList(section, list) {
  list.replaceChildren();
  const records = profile[section.id];
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "repeat-empty";
    empty.textContent = `尚未添加${section.title}`;
    list.append(empty);
    return;
  }

  records.forEach((record, index) => {
    const item = document.createElement("article");
    item.className = "repeat-item";
    const itemHeader = document.createElement("header");
    const itemTitle = document.createElement("strong");
    itemTitle.textContent = `${section.title} ${index + 1}`;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-button";
    removeButton.textContent = "×";
    removeButton.title = `删除第 ${index + 1} 条${section.title}`;
    removeButton.setAttribute("aria-label", removeButton.title);
    removeButton.addEventListener("click", () => {
      profile[section.id].splice(index, 1);
      renderRepeatList(section, list);
      markChanged();
    });
    itemHeader.append(itemTitle, removeButton);

    const grid = document.createElement("div");
    grid.className = "field-grid";
    for (const field of section.fields) {
      grid.append(createField(field, [section.id, index, field[0]]));
    }
    item.append(itemHeader, grid);
    list.append(item);
  });
}

function createField(definition, path) {
  const [key, labelText, type, placeholder = "", required = false, width, rows] =
    definition;
  const label = document.createElement("label");
  label.className = width === "wide" ? "field field-span-2" : "field";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  if (required) {
    const requiredMark = document.createElement("em");
    requiredMark.textContent = " 建议填写";
    caption.append(requiredMark);
  }

  let control;
  if (type === "textarea") {
    control = document.createElement("textarea");
    control.rows = rows || 4;
  } else if (type === "select") {
    control = document.createElement("select");
    for (const optionValue of placeholder) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue || "请选择";
      control.append(option);
    }
  } else {
    control = document.createElement("input");
    control.type = type;
    control.placeholder = String(placeholder || "");
  }
  if (type === "textarea") control.placeholder = String(placeholder || "");
  control.name = path.join(".");
  control.value = getAtPath(profile, path) || "";
  control.addEventListener("input", (event) => {
    setAtPath(profile, path, event.target.value);
    markChanged();
  });
  label.append(caption, control);
  return label;
}

function bindGlobalEvents() {
  dom.saveButton.addEventListener("click", () => saveProfile(true));
  dom.parseResumeButton.addEventListener("click", () => dom.resumeFileInput.click());
  dom.resumeFileInput.addEventListener("change", parseResumeFile);
  dom.importButton.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", importProfile);
  dom.exportButton.addEventListener("click", exportProfile);
  dom.clearProfileButton.addEventListener("click", clearStoredProfile);
  dom.closeResumeDialogButton.addEventListener("click", closeResumeDialog);
  dom.cancelResumeButton.addEventListener("click", closeResumeDialog);
  dom.applyResumeButton.addEventListener("click", applyParsedResume);
  dom.replaceResumeButton.addEventListener("click", replaceWithParsedResume);
  extensionApi.runtime.onMessage?.addListener((message) => {
    if (
      message?.type !== "offerpilot:resume-progress" ||
      message.parseId !== activeResumeParseId
    ) return;
    const progress = message.progress || {};
    setResumeProgress("agent", progress.percent, progress.title, progress.detail);
  });
}

function markChanged() {
  updateCompleteness();
  dom.saveMessage.textContent = "有未保存的修改";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProfile(false), 900);
}

async function saveProfile(showConfirmation) {
  clearTimeout(saveTimer);
  try {
    openaiApiKeyValue = document.querySelector("#openaiApiKey").value.trim();
    openaiBaseUrlValue = normalizeBaseUrl(
      document.querySelector("#openaiBaseUrl").value,
    );
    openaiModelValue =
      document.querySelector("#openaiModel").value.trim() || DEFAULT_OPENAI_MODEL;
    reasoningEffortValue = document.querySelector("#reasoningEffort").value;
    await extensionApi.storage.local.set({
      openaiApiKey: openaiApiKeyValue,
      openaiBaseUrl: openaiBaseUrlValue,
      openaiModel: openaiModelValue,
      reasoningEffort: reasoningEffortValue,
      profile: normalizeProfile(profile),
      profileVersion: PROFILE_SCHEMA_VERSION,
    });
    document.querySelector("#openaiBaseUrl").value = openaiBaseUrlValue;
    document.querySelector("#openaiModel").value = openaiModelValue;
    dom.saveMessage.textContent = showConfirmation ? "档案已保存" : "修改已自动保存";
  } catch (error) {
    dom.saveMessage.textContent = error.message || "保存失败";
  }
}

async function testConnection() {
  const button = document.querySelector("#testButton");
  const badge = document.querySelector("#connectionBadge");
  const message = document.querySelector("#connectionMessage");
  button.disabled = true;
  badge.textContent = "检测中";
  badge.dataset.state = "";
  message.textContent = "";
  try {
    const config = getAgentConfig();
    await ensureAgentHostPermission(config.baseUrl);
    const response = await extensionApi.runtime.sendMessage({
      type: "offerpilot:health",
      config,
    });
    if (!response?.ok) throw new Error(response?.error || "连接失败");
    badge.textContent = "已连接";
    badge.dataset.state = "success";
    message.textContent = `API 已连接 · ${response.data.model}`;
  } catch (error) {
    badge.textContent = "连接失败";
    badge.dataset.state = "error";
    message.textContent = error.message || "请检查 API Key、模型和网络";
  } finally {
    button.disabled = false;
  }
}

async function importProfile() {
  const [file] = dom.fileInput.files || [];
  dom.fileInput.value = "";
  if (!file) return;
  if (file.size > 500_000) {
    dom.saveMessage.textContent = "导入文件不能超过 500 KB";
    return;
  }
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(text);
      profile = normalizeImportedProfile(parsed);
    } else {
      profile = createEmptyProfile();
      profile.additionalNotes = text.trim();
    }
    renderPage();
    updateCompleteness();
    dom.saveMessage.textContent = "已导入，请检查后保存";
  } catch (error) {
    dom.saveMessage.textContent = `导入失败：${error.message}`;
  }
}

async function parseResumeFile() {
  const [file] = dom.resumeFileInput.files || [];
  dom.resumeFileInput.value = "";
  if (!file) return;
  const originalLabel = dom.parseResumeButton.textContent;
  dom.parseResumeButton.disabled = true;
  dom.parseResumeButton.textContent = "解析中...";
  dom.saveMessage.textContent = `正在解析 ${file.name}`;
  setResumeProgress("read", 3, "读取文件", file.name);
  activeResumeParseId = crypto.randomUUID();
  try {
    const config = getAgentConfig();
    await ensureAgentHostPermission(config.baseUrl);
    const extracted = await extractResumeFile(file, updateExtractionProgress);
    dom.saveMessage.textContent = `已读取 ${extracted.extractedCharacterCount.toLocaleString()} 个字符，Agent 正在解析与 STAR 润色（最多 8 分钟）`;
    setResumeProgress("agent", 48, "Agent 正在识别", "分析基本信息与经历");
    const response = await extensionApi.runtime.sendMessage({
      type: "offerpilot:parse-resume",
      payload: {
        fileName: extracted.fileName,
        fileType: extracted.fileType,
        text: extracted.text,
        extractedCharacterCount: extracted.extractedCharacterCount,
        parseId: activeResumeParseId,
      },
      config,
    });
    if (!response?.ok) throw new Error(response?.error || "简历解析失败");
    setResumeProgress("finalize", 96, "整理解析结果", "校验结构化档案");
    const body = response.data;
    if (extracted.truncated) {
      body.warnings = [
        ...(body.warnings || []),
        "简历文字超过 80,000 字符，已仅解析前 80,000 字符。",
      ];
    }
    parsedResumeResult = body;
    renderResumePreview(body);
    setResumeProgress("finalize", 100, "解析完成", "请检查结果后合并");
    dom.resumeParseDialog.showModal();
    dom.saveMessage.textContent = "解析完成，请确认后合并";
  } catch (error) {
    setResumeProgress("finalize", 100, "解析失败", error.message, true);
    dom.saveMessage.textContent = `解析失败：${error.message}`;
  } finally {
    activeResumeParseId = "";
    dom.parseResumeButton.disabled = false;
    dom.parseResumeButton.textContent = originalLabel;
  }
}

function updateExtractionProgress(event) {
  if (event.phase === "read") {
    setResumeProgress("read", 8, "读取文件", "正在载入本地简历");
    return;
  }
  if (event.phase === "extract") {
    const progress = Math.max(0, Math.min(1, event.progress));
    const detail = event.total
      ? `第 ${event.current} / ${event.total} 页`
      : "识别文档文字层";
    setResumeProgress("extract", 12 + Math.round(30 * progress), "提取简历文字", detail);
    return;
  }
  if (event.phase === "normalize") {
    setResumeProgress("extract", 45, "清理文本结构", "合并段落与空白字符");
  }
}

function setResumeProgress(phase, percent, title, detail = "", failed = false) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  dom.resumeProgress.hidden = false;
  dom.resumeProgress.dataset.state = failed ? "failed" : value === 100 ? "complete" : "active";
  dom.resumeProgressTitle.textContent = title;
  dom.resumeProgressDetail.textContent = detail;
  dom.resumeProgressValue.textContent = `${value}%`;
  dom.resumeProgressBar.style.width = `${value}%`;
  dom.resumeProgressTrack.setAttribute("aria-valuenow", String(value));

  const phases = ["read", "extract", "agent", "finalize"];
  const activeIndex = phases.indexOf(phase);
  dom.resumeProgress.querySelectorAll("[data-progress-step]").forEach((step, index) => {
    step.classList.toggle("is-complete", index < activeIndex || value === 100);
    step.classList.toggle("is-active", index === activeIndex && value < 100);
  });
}

function renderResumePreview(result) {
  const parsed = normalizeProfile(result.profile);
  dom.resumeParseSummary.textContent = result.summary || "已提取简历中的个人信息";
  dom.resumeParseMeta.textContent = `${result.meta.fileName} · ${result.meta.fileType.toUpperCase()} · ${result.meta.extractedCharacterCount.toLocaleString()} 字符`;
  dom.resumeParsePreview.replaceChildren();

  const groups = [
    [
      "基本信息",
      [
        parsed.basic.fullName,
        parsed.basic.phone,
        parsed.basic.email,
        parsed.basic.currentCity,
      ].filter(Boolean),
    ],
    [
      "教育背景",
      parsed.education.map((item) =>
        [item.school, item.degree, item.major].filter(Boolean).join(" · "),
      ),
    ],
    [
      "实习经历",
      parsed.internships.map((item) =>
        [item.company, item.role].filter(Boolean).join(" · "),
      ),
    ],
    [
      "项目背景",
      parsed.projects.map((item) =>
        [item.name, item.role].filter(Boolean).join(" · "),
      ),
    ],
    [
      "校园与奖项",
      [
        ...parsed.campus.map((item) => item.organization),
        ...parsed.awards.map((item) => item.name),
      ].filter(Boolean),
    ],
    [
      "技能与证书",
      [parsed.skills.technical, parsed.skills.languages, parsed.skills.certificates]
        .filter(Boolean)
        .map((value) => summarize(value, 180)),
    ],
  ].filter(([, items]) => items.length);

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "resume-preview-empty";
    empty.textContent = "未识别到可合并的档案字段";
    dom.resumeParsePreview.append(empty);
  }

  for (const [titleText, items] of groups) {
    const section = document.createElement("section");
    const title = document.createElement("h3");
    title.textContent = titleText;
    const list = document.createElement("ul");
    for (const item of items) {
      if (!item) continue;
      const row = document.createElement("li");
      row.textContent = item;
      list.append(row);
    }
    section.append(title, list);
    dom.resumeParsePreview.append(section);
  }

  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  dom.resumeParseWarnings.hidden = warnings.length === 0;
  dom.resumeParseWarnings.replaceChildren();
  if (warnings.length) {
    const title = document.createElement("strong");
    title.textContent = "需要检查";
    const list = document.createElement("ul");
    for (const warning of warnings) {
      const item = document.createElement("li");
      item.textContent = warning;
      list.append(item);
    }
    dom.resumeParseWarnings.append(title, list);
  }
}

async function applyParsedResume() {
  if (!parsedResumeResult?.profile) return;
  const before = normalizeProfile(profile);
  profile = mergeParsedResume(profile, parsedResumeResult.profile);
  const changes = countProfileChanges(before, profile);
  renderPage();
  updateCompleteness();
  closeResumeDialog();
  await saveProfile(false);
  dom.saveMessage.textContent = `已新增 ${changes.added} 项、更新 ${changes.updated} 项信息，请检查档案内容`;
}

async function replaceWithParsedResume() {
  if (!parsedResumeResult?.profile) return;
  if (!globalThis.confirm("全新替换会清除当前档案内容，并仅保留本次简历解析结果。是否继续？")) {
    return;
  }
  profile = normalizeProfile(parsedResumeResult.profile);
  renderPage();
  updateCompleteness();
  closeResumeDialog();
  await saveProfile(false);
  dom.saveMessage.textContent = "已使用本次解析结果重建个人档案";
}

async function clearStoredProfile() {
  if (!globalThis.confirm("清除当前个人档案和旧版简历缓存？Agent API 配置会保留。")) {
    return;
  }
  clearTimeout(saveTimer);
  profile = createEmptyProfile();
  parsedResumeResult = null;
  dom.resumeProgress.hidden = true;
  dom.migrationNotice.hidden = true;
  await extensionApi.storage.local.remove(PROFILE_STORAGE_KEYS);
  renderPage();
  updateCompleteness();
  dom.saveMessage.textContent = "个人档案已清除，Agent API 配置已保留";
}

function closeResumeDialog() {
  if (dom.resumeParseDialog.open) dom.resumeParseDialog.close();
}

function countProfileFacts(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countProfileFacts(item), 0);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).reduce(
      (total, [key, child]) =>
        key === "schemaVersion" ? total : total + countProfileFacts(child),
      0,
    );
  }
  return typeof value === "string" && value.trim() ? 1 : 0;
}

function countProfileChanges(before, after) {
  let added = 0;
  let updated = 0;
  const visit = (left, right) => {
    if (Array.isArray(right)) {
      const leftItems = Array.isArray(left) ? left : [];
      right.forEach((item, index) => visit(leftItems[index], item));
      return;
    }
    if (right && typeof right === "object") {
      for (const [key, value] of Object.entries(right)) {
        if (key !== "id" && key !== "schemaVersion") visit(left?.[key], value);
      }
      return;
    }
    const oldValue = String(left || "").trim();
    const newValue = String(right || "").trim();
    if (!newValue || newValue === oldValue) return;
    if (oldValue) updated += 1;
    else added += 1;
  };
  visit(before, after);
  return { added, updated };
}

function summarize(value, maxLength) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function getAgentConfig() {
  return {
    apiKey: document.querySelector("#openaiApiKey").value.trim(),
    baseUrl: normalizeBaseUrl(document.querySelector("#openaiBaseUrl").value),
    model:
      document.querySelector("#openaiModel").value.trim() || DEFAULT_OPENAI_MODEL,
    reasoningEffort: document.querySelector("#reasoningEffort").value,
  };
}

async function ensureAgentHostPermission(baseUrl) {
  if (!extensionApi.permissions?.contains) return;
  const origin = `${new URL(normalizeBaseUrl(baseUrl)).origin}/*`;
  const granted = await extensionApi.permissions.contains({ origins: [origin] });
  if (granted) return;
  const approved = await extensionApi.permissions.request({ origins: [origin] });
  if (!approved) {
    throw new Error("需要授权扩展访问该 API Base URL");
  }
}

function normalizeImportedProfile(parsed) {
  if (parsed?.basic || parsed?.preferences || parsed?.schemaVersion) {
    return normalizeProfile(parsed);
  }
  const migrated = createEmptyProfile();
  migrated.basic.fullName = String(parsed?.name || "");
  migrated.basic.email = String(parsed?.email || "");
  migrated.basic.phone = String(parsed?.phone || "");
  migrated.selfEvaluation = String(parsed?.summary || "");
  migrated.additionalNotes = JSON.stringify(parsed, null, 2);
  return migrated;
}

function exportProfile() {
  const data = JSON.stringify(compactProfile(profile), null, 2);
  const blob = new Blob([data], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `offerpilot-profile-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  dom.saveMessage.textContent = "档案已导出";
}

function updateCompleteness() {
  const completeness = calculateCompleteness(profile);
  dom.completionValue.textContent = `${completeness.percent}%`;
  dom.completionBar.style.width = `${completeness.percent}%`;
  dom.completionMeta.textContent = `已完成 ${completeness.completed}/${completeness.total} 项`;
}

function getAtPath(target, path) {
  return path.reduce((current, key) => current?.[key], target);
}

function setAtPath(target, path, value) {
  const parent = path.slice(0, -1).reduce((current, key) => current[key], target);
  parent[path.at(-1)] = value;
}

function createPreviewApi() {
  return {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(
            keys.map((key) => {
              const raw = localStorage.getItem(`offerpilot:${key}`);
              return [key, raw ? JSON.parse(raw) : undefined];
            }),
          );
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            localStorage.setItem(`offerpilot:${key}`, JSON.stringify(value));
          }
        },
        async remove(keys) {
          for (const key of keys) localStorage.removeItem(`offerpilot:${key}`);
        },
      },
    },
    runtime: {
      async sendMessage() {
        return { ok: false, error: "Agent 操作需要在 Chrome 扩展中使用" };
      },
    },
  };
}
