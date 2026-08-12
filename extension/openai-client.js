export const DEFAULT_API_BASE_URL = "https://api.ai.tosky.top/v1";
export const RESUME_PARSE_TIMEOUT_MS = 240_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;

const SENSITIVE_LABEL_PATTERN =
  /(身份证|证件号|护照|薪资|工资|期望薪|到岗|入职时间|婚姻|性别|民族|政治面貌|党员|宗教|残疾|生育|户籍|工作许可|签证|relocat|salary|compensation|authorization|visa|gender|ethnicity|religion|disability|marital)/i;

const MATCHING_INSTRUCTIONS = `
You are a resume-to-application-form matching agent.

Your job is to map facts explicitly present in RESUME to the PAGE_FIELDS. Produce a conservative filling plan, not a completed application.

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
`;

const RESUME_PARSING_INSTRUCTIONS = `
You are a conservative resume parsing agent. Convert RESUME_TEXT into the exact structured profile schema.

Rules:
1. Use only facts explicitly present in RESUME_TEXT. Never invent, infer, embellish, or calculate missing facts.
2. Every scalar field is required by the output schema. Return an empty string when the resume does not support a value, and an empty array when a repeatable section is absent.
3. Preserve names, phone numbers, email addresses, URLs, organization names, degrees, scores, certificate names, and quantified achievements exactly as supported.
4. For dates, use YYYY-MM-DD or YYYY-MM only when all components are explicit. Otherwise preserve the supported source wording.
5. Use these exact values when applicable: degree = 博士/硕士/本科/大专/高中及以下; educationType = 全日制/非全日制/海外 / 港澳台; employmentType = 校园招聘/实习/社会招聘; willingToRelocate = 是/否.
6. Keep distinct education, internship, project, campus, and award records separate and in the order found in the resume.
7. Put responsibilities in description and measurable outcomes in achievements. Do not rewrite facts into stronger claims.
8. Do not generate a self-evaluation. Only populate selfEvaluation when the resume contains an explicit summary, profile, or self-evaluation section.
9. Put concise, relevant resume facts that do not fit another field in additionalNotes. Do not copy the entire resume there.
10. Add warnings for ambiguous dates, uncertain section classification, unreadable text, or facts deliberately omitted because they cannot be mapped safely.
11. summary should briefly state what was extracted, without evaluating the candidate.
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
  warnings: { type: "array", items: stringSchema(), maxItems: 30 },
});

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
          resume: request.resume,
          pageFields: request.fields,
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
  return {
    summary: parsed.output.summary,
    matches: accepted,
    warnings: parsed.output.warnings,
    meta: {
      model: parsed.model,
      requestedFieldCount: request.fields.length,
      acceptedMatchCount: accepted.length,
      droppedMatchCount: dropped.length,
    },
  };
}

export async function parseResumeProfile(request, config, fetchImpl = fetch) {
  const parsed = await requestStructuredOutput(
    {
      instructions: RESUME_PARSING_INSTRUCTIONS,
      input: JSON.stringify(
        {
          task: "Parse the resume into an OfferPilot profile.",
          fileName: request.fileName,
          resumeText: request.text,
        },
        null,
        2,
      ),
      name: "offerpilot_resume_profile",
      schema: RESUME_PROFILE_SCHEMA,
      timeoutMs: RESUME_PARSE_TIMEOUT_MS,
      timeoutMessage:
        "简历解析等待 4 分钟仍未完成，请将推理强度调为 low 后重试",
    },
    config,
    fetchImpl,
  );
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
