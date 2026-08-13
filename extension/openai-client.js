export const DEFAULT_API_BASE_URL = "https://api.ai.tosky.top/v1";
export const RESUME_PARSE_TIMEOUT_MS = 480_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;

const SENSITIVE_LABEL_PATTERN =
  /(身份证|证件号|护照|薪资|工资|期望薪|到岗|入职时间|婚姻|性别|民族|政治面貌|党员|宗教|残疾|生育|户籍|工作许可|签证|relocat|salary|compensation|authorization|visa|gender|ethnicity|religion|disability|marital)/i;

const MATCHING_INSTRUCTIONS = `
You are a resume-to-application-form matching agent.

Your job is to map facts explicitly present in RESUME to the PAGE_FIELDS. First understand the whole page and each field group, then produce a conservative filling plan.

Rules:
1. Never invent, infer, embellish, or calculate a fact that is not supported by RESUME.
2. Return only field IDs that appear in PAGE_FIELDS.
3. Do not return a match for a field whose currentValue is non-empty.
4. For select, radio, or checkbox fields, value must exactly equal one provided option value. Use the option label to understand its meaning.
5. Preserve names, identifiers, phone numbers, email addresses, dates, organization names, degrees, and scores exactly as supported by RESUME.
6. Normalize a value only when the field type clearly requires it. Do not guess missing date components.
7. Mark requiresConfirmation true for identity numbers, salary, availability, relocation, work authorization, political status, demographic data, declarations, agreements, or confidence below 0.85.
8. Omit submit buttons, consent decisions, legal declarations, and facts requiring user judgment.
9. source must briefly identify the supporting resume section or exact fact. reason must explain the field-to-fact match.
10. Keep the plan concise. An omitted field means it should remain untouched.
11. PAGE_FIELDS are not isolated. Use groupId, groupLabel, groupContext, section, and the current values of sibling fields to identify the record represented by a repeated form card. For example, project name Karmada and role 开源维护者 identify the Karmada project; fill every supported empty sibling field from that same project record.
12. For internship/project/education/award groups, perform record-level matching before field-level matching. Return all supported empty fields in the matched group, including dates, link, description, and achievements. Never mix fields from different resume records.
13. Treat textarea and contenteditable rich-text editors as ordinary fillable fields. Map 项目描述/工作内容 to description and 项目业绩/项目成果/成果亮点 to achievements.
14. A generic placeholder example is not evidence. Prefer group labels, sibling current values, and pageContext when interpreting a field.
15. PAGE_ACTIONS contains only locally allowlisted add-record and finish-record controls. After filling the current record, request at most one finish_record action. If the page has fewer records than RESUME and an add_record control is available, request at most one add_record action. Never request both in one turn. Never click submit-application, delete, cancel, navigation, or consent controls.
`;

const RESUME_PARSING_INSTRUCTIONS = `
You are the extraction agent inside the OfferPilot resume Agent harness. Inspect the complete RESUME_TEXT, build a fact ledger, reconcile repeated mentions, and submit exactly one canonical profile with the submit_resume_profile tool.

Rules:
1. Use only facts explicitly present in RESUME_TEXT. Never invent, infer, embellish, or calculate missing facts.
2. Every scalar field is required by the output schema. Return an empty string when the resume does not support a value, and an empty array when a repeatable section is absent.
3. Preserve names, phone numbers, email addresses, URLs, organization names, degrees, scores, certificate names, and quantified achievements exactly as supported.
4. For dates, use YYYY-MM-DD or YYYY-MM only when all components are explicit. Otherwise preserve the supported source wording.
5. Use these exact values when applicable: degree = 博士/硕士/本科/大专/高中及以下; educationType = 全日制/非全日制/海外 / 港澳台; employmentType = 校园招聘/实习/社会招聘; willingToRelocate = 是/否.
6. Keep genuinely distinct education, internship, project, campus, and award records separate and in source order. A heading, date line, bullet list, and later detailed description of the same experience are one record, not multiple records.
7. Put responsibilities in description and measurable outcomes in achievements. Do not rewrite facts into stronger claims.
8. Do not generate a self-evaluation. Only populate selfEvaluation when the resume contains an explicit summary, profile, or self-evaluation section.
9. Put concise, relevant resume facts that do not fit another field in additionalNotes. Do not copy the entire resume there.
10. Add warnings for ambiguous dates, uncertain section classification, unreadable text, or facts deliberately omitted because they cannot be mapped safely.
11. summary should briefly state what was extracted, without evaluating the candidate.
12. Before submitting, perform a duplicate audit. Merge records that share the same organization/project and overlapping dates. Prefer the most complete name and combine complementary supported facts without repeating sentences.
13. Reject OCR/text-layer fragments as entity names: generic labels such as Agent, Agent Infra, Kubernetes, OpenCAS, or a date line are not a company or school unless the resume explicitly presents them as one.
14. Tool submission is the only valid completion. Do not answer with prose.
15. skills.languages is only for human-language proficiency such as English CET-6 or Japanese N2. Put Go, Python, Java, SQL, and other programming languages in skills.technical.
16. RESUME_TEXT may include PDF_LINK_EVIDENCE records. Use a URL as projects[].link only when its context identifies the same project. Prefer repository/homepage URLs over pull-request query URLs. Keep personal website and profile URLs in additionalNotes. Never invent or rewrite a URL.
17. PDF text is emitted as PDF_PAGE/PDF_ROW layout evidence. LEFT and RIGHT mark independent columns on the same visual row. For an award, bind a year/date only when it appears in the same row and same column as that award. If only a year is explicit, store YYYY; never invent a month. Do not attach a date from the opposite column or an adjacent award.
18. Classify awards[].level as exactly one of 国际级/国家级/省级/市级/校级/院级/其他. Determine the level from the actual awarded tier in the award name and issuer, not merely the competition's overall title. Result qualifiers take priority: for example, 全国大学生数学建模竞赛省二等奖 is 省级, while 挑战杯揭榜挂帅全国二等奖 is 国家级. ICM/MCM international awards are 国际级; provincial government awards are 省级; university scholarships and university honors are 校级. Leave level empty only when neither the name nor issuer supports a reliable classification.
`;

const stringSchema = (maxLength = 500) => ({ type: "string", maxLength });
const strictObject = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const recordArray = (properties) => ({
  type: "array",
  items: strictObject(properties),
  maxItems: 50,
});

const PROFILE_SCHEMA = strictObject({
  schemaVersion: { type: "integer", enum: [1] },
  basic: strictObject({
    fullName: stringSchema(),
    preferredName: stringSchema(),
    gender: stringSchema(),
    birthDate: stringSchema(),
    phone: stringSchema(),
    email: stringSchema(),
    wechat: stringSchema(),
    currentCity: stringSchema(),
    hometown: stringSchema(),
    address: stringSchema(6_000),
    nationality: stringSchema(),
    politicalStatus: stringSchema(),
    idType: stringSchema(),
    idNumber: stringSchema(),
  }),
  preferences: strictObject({
    targetRoles: stringSchema(6_000),
    targetCities: stringSchema(6_000),
    employmentType: stringSchema(),
    earliestStartDate: stringSchema(),
    expectedSalary: stringSchema(),
    willingToRelocate: stringSchema(),
  }),
  education: recordArray({
    school: stringSchema(),
    college: stringSchema(),
    major: stringSchema(),
    degree: stringSchema(),
    educationType: stringSchema(),
    startDate: stringSchema(),
    endDate: stringSchema(),
    gpa: stringSchema(),
    rank: stringSchema(),
    courses: stringSchema(6_000),
  }),
  internships: recordArray({
    company: stringSchema(),
    department: stringSchema(),
    role: stringSchema(),
    city: stringSchema(),
    startDate: stringSchema(),
    endDate: stringSchema(),
    description: stringSchema(6_000),
    achievements: stringSchema(6_000),
  }),
  projects: recordArray({
    name: stringSchema(),
    role: stringSchema(),
    startDate: stringSchema(),
    endDate: stringSchema(),
    link: stringSchema(6_000),
    stack: stringSchema(6_000),
    description: stringSchema(6_000),
    achievements: stringSchema(6_000),
  }),
  campus: recordArray({
    organization: stringSchema(),
    role: stringSchema(),
    startDate: stringSchema(),
    endDate: stringSchema(),
    description: stringSchema(6_000),
    achievements: stringSchema(6_000),
  }),
  awards: recordArray({
    name: stringSchema(),
    level: stringSchema(),
    issuer: stringSchema(),
    date: stringSchema(),
    description: stringSchema(6_000),
  }),
  skills: strictObject({
    technical: stringSchema(6_000),
    languages: stringSchema(6_000),
    certificates: stringSchema(6_000),
  }),
  selfEvaluation: stringSchema(6_000),
  additionalNotes: stringSchema(6_000),
});

const RESUME_PROFILE_SCHEMA = strictObject({
  summary: stringSchema(),
  profile: PROFILE_SCHEMA,
  warnings: { type: "array", items: stringSchema(), maxItems: 30 },
});

const MATCH_PLAN_SCHEMA = strictObject({
  summary: stringSchema(),
  matches: {
    type: "array",
    items: strictObject({
      fieldId: stringSchema(100),
      value: stringSchema(4_000),
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: stringSchema(),
      source: stringSchema(),
      requiresConfirmation: { type: "boolean" },
    }),
  },
  actions: {
    type: "array",
    items: strictObject({
      actionId: stringSchema(100),
      reason: stringSchema(),
      requiresConfirmation: { type: "boolean" },
    }),
    maxItems: 1,
  },
  warnings: { type: "array", items: stringSchema(), maxItems: 30 },
});

const PAGE_INVENTORY_SCHEMA = strictObject({
  summary: stringSchema(),
  existingRecords: { type: "array", items: stringSchema(), maxItems: 50 },
  missingRecords: { type: "array", items: stringSchema(), maxItems: 50 },
  correctionRecords: { type: "array", items: stringSchema(), maxItems: 50 },
  targetRecord: stringSchema(500),
  actionId: stringSchema(100),
  warnings: { type: "array", items: stringSchema(), maxItems: 30 },
});

const PAGE_INVENTORY_INSTRUCTIONS = `
You are the page inventory agent in a two-agent web filling harness. Do not fill fields.
Read the complete PROFILE and PAGE_CONTEXT, including cards visible outside edit mode. Identify the resume section currently shown, extract the existing web records, and align them by stable identity (project name, company+role, school+major, or award name) against PROFILE.
Return existingRecords, missingRecords, and correctionRecords. Choose exactly one targetRecord for the next operation. Prefer correcting a clearly matching incomplete record; otherwise choose the first missing profile record in profile order.
Choose actionId only from PAGE_ACTIONS. Use an add_record action only when targetRecord is missing. Use an edit_record action only when targetRecord already exists and needs correction. If no safe action exists, return an empty actionId. Never choose delete, submit, navigation, or consent actions. Do not confuse unrelated historical web records with profile records.
`;

export async function testOpenAIConnection(config, fetchImpl = fetch) {
  const normalized = normalizeConfig(config);
  try {
    const response = await fetchImpl(`${normalized.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${normalized.apiKey}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw createApiError(response, body);
    return { model: normalized.model };
  } catch (error) {
    throw normalizeRequestError(error);
  }
}

export async function createMatchPlan(request, config, fetchImpl = fetch) {
  const parsed = await requestStructuredOutput(
    {
      instructions: MATCHING_INSTRUCTIONS,
      input: JSON.stringify(
        {
          task: "Create a safe field filling plan.",
          page: request.page,
          pageContext: request.pageContext || {},
          resume: request.resume,
          pageFields: request.fields,
          pageActions: request.actions || [],
          targetRecord: request.targetRecord || "",
        },
        null,
        2,
      ),
      name: "resume_field_plan",
      schema: MATCH_PLAN_SCHEMA,
    },
    config,
    fetchImpl,
  );
  const { accepted, dropped } = validateAgentPlan(parsed.output, request.fields);
  const acceptedActions = validateAgentActions(parsed.output.actions, request.actions);
  return {
    summary: parsed.output.summary,
    matches: accepted,
    actions: acceptedActions,
    warnings: parsed.output.warnings,
    meta: {
      model: parsed.model,
      requestedFieldCount: request.fields.length,
      acceptedMatchCount: accepted.length,
      droppedMatchCount: dropped.length,
    },
  };
}

export async function parseResumeProfile(
  request,
  config,
  fetchImpl = fetch,
  onProgress = () => {},
) {
  const parsed = await runResumeAgentHarness(request, config, fetchImpl, onProgress);
  return {
    ...parsed.output,
    meta: {
      model: parsed.model,
      fileName: request.fileName,
      fileType: request.fileType,
      extractedCharacterCount: request.extractedCharacterCount,
      parsedAt: new Date().toISOString(),
    },
  };
}

export async function createPageInventory(request, config, fetchImpl = fetch) {
  const parsed = await requestStructuredOutput({
    instructions: PAGE_INVENTORY_INSTRUCTIONS,
    input: JSON.stringify({
      task: "Inventory and align the current resume section before editing.",
      page: request.page,
      pageContext: request.pageContext || {},
      profile: request.resume,
      pageActions: request.actions || [],
    }, null, 2),
    name: "page_record_inventory",
    schema: PAGE_INVENTORY_SCHEMA,
  }, config, fetchImpl);
  const action = (request.actions || []).find((item) => item.id === parsed.output.actionId);
  return {
    ...parsed.output,
    action: action && ["add_record", "edit_record"].includes(action.type) ? action : null,
    meta: { model: parsed.model },
  };
}

export function validateAgentActions(actions = [], availableActions = []) {
  const actionMap = new Map(availableActions.map((action) => [action.id, action]));
  for (const candidate of actions) {
    const action = actionMap.get(candidate.actionId);
    if (!action || !["add_record", "finish_record"].includes(action.type)) continue;
    return [{ ...candidate, type: action.type, label: action.label }];
  }
  return [];
}

async function runResumeAgentHarness(request, config, fetchImpl, onProgress) {
  const normalized = normalizeConfig(config);
  const deadline = Date.now() + RESUME_PARSE_TIMEOUT_MS;
  let feedback = "No previous submission. Perform the full extraction and duplicate audit.";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error("简历解析等待 8 分钟仍未完成，请将推理强度调为 low 后重试");
    }
    onProgress({ percent: 50, title: "提取简历事实", detail: `结构化提取第 ${attempt} 轮` });
    const submission = await requestResumeToolSubmission(
      {
        normalized,
        request,
        attempt,
        feedback,
        timeoutMs: remainingMs,
      },
      fetchImpl,
    );
    const extraction = finalizeResumeSubmission(submission);
    if (extraction.issues.length && attempt < 3) {
      feedback = `The harness rejected the previous submission. Fix every issue before resubmitting:\n- ${extraction.issues.join("\n- ")}`;
      continue;
    }
    const polished = await polishExperiencesIndividually(
      {
        normalized,
        request,
        extractedProfile: extraction.output,
        timeoutMs: Math.max(1, deadline - Date.now()),
      },
      fetchImpl,
      onProgress,
    );
    const finalized = finalizeResumeSubmission(polished);
    if (!finalized.issues.length || attempt === 3) {
      return { model: finalized.model || normalized.model, output: finalized.output };
    }
    feedback = `The harness rejected the previous submission. Fix every issue before resubmitting:\n- ${finalized.issues.join("\n- ")}`;
  }
  throw new Error("Agent harness 未能提交有效的个人档案");
}

async function polishExperiencesIndividually(options, fetchImpl, onProgress) {
  const skill = String(options.request.experienceSkill || "").trim();
  if (!skill) throw new Error("简历经历 STAR 润色技能未加载");
  const output = structuredClone(options.extractedProfile);
  const sectionLabels = {
    internships: "实习经历",
    projects: "项目经历",
    campus: "校园经历",
  };
  const jobs = Object.entries(sectionLabels).flatMap(([section, label]) =>
    (output.profile[section] || []).map((record, index, records) => ({
      section,
      label,
      index,
      total: records.length,
      record,
    })),
  );

  if (!jobs.length) return { model: options.normalized.model, output };
  const deadline = Date.now() + options.timeoutMs;
  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
    const job = jobs[jobIndex];
    const percent = 58 + Math.round((34 * jobIndex) / jobs.length);
    onProgress({
      percent,
      title: `润色${job.label} ${job.index + 1}/${job.total}`,
      detail: primaryRecordName(job.section, job.record),
    });
    const polished = await requestResumeToolSubmission(
      {
        normalized: options.normalized,
        request: options.request,
        timeoutMs: Math.max(1, deadline - Date.now()),
        instructions: `${skill}\n\nYou are the STAR polishing specialist. Polish exactly one supplied record. Preserve its identity and dates. Re-read RESUME_TEXT and restore all supported actions, technical paths, constraints, metrics, and outcomes. Submit only the polished record with warnings.`,
        input: {
          task: `Polish ${job.label} ${job.index + 1} of ${job.total}.`,
          record: job.record,
          resumeText: options.request.text,
        },
        toolName: "submit_polished_experience",
        toolDescription: "Submit one evidence-preserving polished experience record.",
        toolSchema: strictObject({
          record: PROFILE_SCHEMA.properties[job.section].items,
          warnings: { type: "array", items: stringSchema(), maxItems: 5 },
        }),
      },
      fetchImpl,
    );
    output.profile[job.section][job.index] = polished.output.record;
    output.warnings.push(...polished.output.warnings);
    onProgress({
      percent: 58 + Math.round((34 * (jobIndex + 1)) / jobs.length),
      title: `已完成${job.label} ${job.index + 1}/${job.total}`,
      detail: primaryRecordName(job.section, polished.output.record),
    });
  }
  return { model: options.normalized.model, output };
}

function primaryRecordName(section, record) {
  const key = { internships: "company", projects: "name", campus: "organization" }[section];
  return String(record?.[key] || record?.role || "未命名经历");
}

async function requestResumeToolSubmission(options, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(`${options.normalized.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.normalized.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.normalized.model,
        reasoning: { effort: options.normalized.reasoningEffort },
        instructions: options.instructions || RESUME_PARSING_INSTRUCTIONS,
        input: JSON.stringify(
          options.input || {
            task: "Build one canonical OfferPilot profile from the resume.",
            harnessAttempt: options.attempt,
            harnessFeedback: options.feedback,
            fileName: options.request.fileName,
            resumeText: options.request.text,
          },
          null,
          2,
        ),
        tools: [
          {
            type: "function",
            name: options.toolName || "submit_resume_profile",
            description: options.toolDescription ||
              "Submit the canonical, deduplicated resume profile after inspecting all source text.",
            parameters: options.toolSchema || RESUME_PROFILE_SCHEMA,
            strict: true,
          },
        ],
        tool_choice: {
          type: "function",
          name: options.toolName || "submit_resume_profile",
        },
        parallel_tool_calls: false,
        store: false,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw createApiError(response, body);
    const toolName = options.toolName || "submit_resume_profile";
    const call = (body.output || []).find(
      (item) => item.type === "function_call" && item.name === toolName,
    );
    if (!call?.arguments) throw new Error("Agent 未调用个人档案提交工具");
    return { model: body.model || options.normalized.model, output: JSON.parse(call.arguments) };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("简历解析等待 8 分钟仍未完成，请将推理强度调为 low 后重试");
    }
    if (error instanceof SyntaxError) throw new Error("Agent 工具参数不是有效 JSON");
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export function finalizeResumeSubmission(submission) {
  const output = structuredClone(submission.output);
  const issues = [];
  for (const section of ["education", "internships", "projects", "campus", "awards"]) {
    const records = Array.isArray(output.profile?.[section]) ? output.profile[section] : [];
    output.profile[section] = deduplicateRecords(section, records, issues);
  }
  output.profile.awards = output.profile.awards.map(normalizeAwardLevel);
  output.warnings = [...new Set((output.warnings || []).map((item) => String(item).trim()).filter(Boolean))];
  return { model: submission.model, output, issues };
}

const AWARD_LEVELS = new Set(["国际级", "国家级", "省级", "市级", "校级", "院级", "其他"]);

export function normalizeAwardLevel(award) {
  const normalized = { ...award };
  const supplied = String(normalized.level || "").trim();
  if (AWARD_LEVELS.has(supplied)) return normalized;

  const evidence = `${normalized.name || ""} ${normalized.issuer || ""}`;
  const resultTier = evidence.match(/(国际|世界|全球|全国|国家|省|市|校|院)(?:级)?(?:特等|一等|二等|三等|金|银|铜|优秀|专项)?(?:奖|名|荣誉)/);
  const tier = resultTier?.[1];
  if (tier) {
    normalized.level = {
      国际: "国际级", 世界: "国际级", 全球: "国际级",
      全国: "国家级", 国家: "国家级", 省: "省级", 市: "市级",
      校: "校级", 院: "院级",
    }[tier];
    return normalized;
  }

  if (/\b(?:ICM|MCM)\b|美国大学生数学建模/i.test(evidence)) normalized.level = "国际级";
  else if (/省政府奖学金|^省/.test(evidence)) normalized.level = "省级";
  else if (/国家励志奖学金/.test(evidence)) normalized.level = "国家级";
  return normalized;
}

function deduplicateRecords(section, records, issues) {
  const identityKeys = {
    education: ["school", "major"],
    internships: ["company", "role"],
    projects: ["name"],
    campus: ["organization", "role"],
    awards: ["name"],
  }[section];
  const result = [];
  for (const record of records) {
    const hasContent = Object.values(record || {}).some((value) => String(value || "").trim());
    if (!hasContent) continue;
    const match = result.find((candidate) =>
      identityKeys.some(
        (key) => normalizeEntity(candidate[key]) && normalizeEntity(candidate[key]) === normalizeEntity(record[key]),
      ) && datesOverlap(candidate, record),
    );
    if (!match) {
      result.push({ ...record });
      continue;
    }
    issues.push(`${section} contains duplicate records for ${identityKeys.map((key) => record[key]).filter(Boolean).join(" / ")}`);
    mergeRecordFacts(match, record);
  }
  return result;
}

function mergeRecordFacts(target, source) {
  for (const [key, rawValue] of Object.entries(source)) {
    const value = String(rawValue || "").trim();
    if (!value) continue;
    if (!String(target[key] || "").trim()) target[key] = value;
    else if (["description", "achievements", "courses"].includes(key) && !target[key].includes(value)) {
      target[key] = `${target[key]}\n${value}`;
    }
  }
}

function datesOverlap(left, right) {
  const leftDates = [left.startDate, left.endDate].map(normalizeEntity).filter(Boolean);
  const rightDates = [right.startDate, right.endDate].map(normalizeEntity).filter(Boolean);
  return !leftDates.length || !rightDates.length || leftDates.some((date) => rightDates.includes(date));
}

function normalizeEntity(value) {
  return String(value || "").toLocaleLowerCase().replace(/[\s·()（）,，.。\-—_]/g, "");
}

async function requestStructuredOutput(options, config, fetchImpl) {
  const normalized = normalizeConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(`${normalized.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalized.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalized.model,
        reasoning: { effort: normalized.reasoningEffort },
        instructions: options.instructions,
        input: options.input,
        text: {
          format: {
            type: "json_schema",
            name: options.name,
            strict: true,
            schema: options.schema,
          },
        },
        store: false,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw createApiError(response, body);
    const text = extractResponseText(body);
    return { model: body.model || normalized.model, output: JSON.parse(text) };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(options.timeoutMessage || "Agent 请求超时，请稍后重试");
    }
    if (error instanceof SyntaxError) throw new Error("模型返回了无法解析的结构化结果");
    throw normalizeRequestError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export function extractResponseText(response) {
  if (response.status === "incomplete") {
    throw new Error("模型输出不完整，请重试");
  }
  for (const output of response.output || []) {
    if (output.type !== "message") continue;
    for (const content of output.content || []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal || "模型拒绝处理该请求");
      }
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("模型没有返回结构化结果");
}

export function validateAgentPlan(plan, fields) {
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const seen = new Set();
  const accepted = [];
  const dropped = [];

  for (const candidate of plan.matches || []) {
    const field = fieldMap.get(candidate.fieldId);
    if (!field || seen.has(candidate.fieldId) || normalize(field.currentValue)) {
      dropped.push(candidate);
      continue;
    }
    seen.add(candidate.fieldId);
    let value = normalize(candidate.value);
    if (!value) {
      dropped.push(candidate);
      continue;
    }
    if (["select", "radio", "checkbox"].includes(field.type)) {
      value = normalizeOptionMatch(field, value);
      if (value === null) {
        dropped.push(candidate);
        continue;
      }
    }
    accepted.push({
      ...candidate,
      value,
      requiresConfirmation:
        candidate.requiresConfirmation ||
        candidate.confidence < 0.85 ||
        SENSITIVE_LABEL_PATTERN.test(field.label),
    });
  }
  return { accepted, dropped };
}

function normalizeConfig(config) {
  const apiKey = String(config?.apiKey || "").trim();
  if (!apiKey) throw new Error("请先在个人档案页配置 Agent API Key");
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(config?.baseUrl),
    model: String(config?.model || "gpt-5.6-sol").trim(),
    reasoningEffort: String(config?.reasoningEffort || "low").trim(),
  };
}

export function normalizeBaseUrl(value) {
  const raw = String(value || DEFAULT_API_BASE_URL).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API Base URL 格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API Base URL 必须使用 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("API Base URL 不能包含账号、密码、查询参数或锚点");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeOptionMatch(field, requestedValue) {
  if (!field.options.length) return requestedValue;
  const directValue = field.options.find(
    (option) => normalize(option.value) === requestedValue,
  );
  if (directValue) return directValue.value;
  const directLabel = field.options.find(
    (option) => normalize(option.label) === requestedValue,
  );
  return directLabel?.value ?? null;
}

function createApiError(response, body) {
  const message = body?.error?.message || body?.error || `OpenAI 请求失败 (${response.status})`;
  return new Error(message);
}

function normalizeRequestError(error) {
  if (
    error instanceof TypeError ||
    /failed to fetch|fetch failed|networkerror/i.test(error?.message || "")
  ) {
    return new Error(
      "无法连接 API Base URL，请检查地址、DNS、HTTPS 证书或网络代理",
    );
  }
  return error;
}
