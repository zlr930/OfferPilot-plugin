import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchPlan,
  extractResponseText,
  finalizeResumeSubmission,
  normalizeBaseUrl,
  parseResumeProfile,
  RESUME_PARSE_TIMEOUT_MS,
  testOpenAIConnection,
  validateAgentPlan,
} from "../extension/openai-client.js";

const field = {
  id: "f1",
  label: "姓名",
  section: "基本信息",
  type: "text",
  required: true,
  currentValue: "",
  placeholder: "",
  options: [],
};

test("extractResponseText reads Responses API output text", () => {
  const text = extractResponseText({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
  });
  assert.equal(text, "{}");
});

test("validateAgentPlan drops invalid fields and protects sensitive values", () => {
  const { accepted, dropped } = validateAgentPlan(
    {
      matches: [
        {
          fieldId: "f1",
          value: "张三",
          confidence: 0.99,
          reason: "姓名一致",
          source: "基本信息",
          requiresConfirmation: false,
        },
        { fieldId: "unknown", value: "x", confidence: 1 },
      ],
    },
    [field],
  );
  assert.equal(accepted.length, 1);
  assert.equal(dropped.length, 1);
});

test("createMatchPlan sends strict structured output request", async () => {
  let requestUrl;
  let requestBody;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        status: "completed",
        model: "test-model",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "找到姓名",
                  matches: [
                    {
                      fieldId: "f1",
                      value: "张三",
                      confidence: 0.99,
                      reason: "姓名一致",
                      source: "基本信息",
                      requiresConfirmation: false,
                    },
                  ],
                  warnings: [],
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const result = await createMatchPlan(
    {
      page: { url: "https://jobs.example.com/apply", title: "Apply" },
      resume: "姓名：张三",
      fields: [field],
    },
    {
      apiKey: "test-key",
      baseUrl: "https://gateway.example.com/openai/v1/",
      model: "test-model",
      reasoningEffort: "low",
    },
    fetchImpl,
  );
  assert.equal(requestUrl, "https://gateway.example.com/openai/v1/responses");
  assert.equal(requestBody.text.format.type, "json_schema");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.store, false);
  assert.equal(result.matches[0].value, "张三");
});

test("testOpenAIConnection uses the configured API base URL", async () => {
  let requestUrl;
  const fetchImpl = async (url) => {
    requestUrl = url;
    return new Response(JSON.stringify({ id: "proxy-model" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const result = await testOpenAIConnection(
    {
      apiKey: "test-key",
      baseUrl: "https://gateway.example.com/api/v1/",
      model: "proxy/model",
    },
    fetchImpl,
  );
  assert.equal(
    requestUrl,
    "https://gateway.example.com/api/v1/models",
  );
  assert.equal(result.model, "proxy/model");
});

test("testOpenAIConnection explains network failures", async () => {
  await assert.rejects(
    testOpenAIConnection(
      {
        apiKey: "test-key",
        baseUrl: "https://unreachable.example/v1",
        model: "test-model",
      },
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ),
    /地址、DNS、HTTPS 证书或网络代理/,
  );
});

test("normalizeBaseUrl validates and normalizes custom endpoints", () => {
  assert.equal(normalizeBaseUrl(""), "https://api.ai.tosky.top/v1");
  assert.equal(
    normalizeBaseUrl("https://gateway.example.com/openai/v1///"),
    "https://gateway.example.com/openai/v1",
  );
  assert.throws(
    () => normalizeBaseUrl("ftp://gateway.example.com/v1"),
    /HTTP 或 HTTPS/,
  );
  assert.throws(
    () => normalizeBaseUrl("https://gateway.example.com/v1?token=secret"),
    /查询参数/,
  );
});

test("resume parsing allows enough time for reasoning and structured output", () => {
  assert.equal(RESUME_PARSE_TIMEOUT_MS, 480_000);
});

test("resume parsing uses a forced Responses function tool", async () => {
  let requestUrl;
  let requestBody;
  let callCount = 0;
  const progress = [];
  const fetchImpl = async (url, options) => {
    callCount += 1;
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    const toolName = requestBody.tools[0].name;
    const output = createResumeSubmission();
    const toolArguments = toolName === "submit_polished_experience"
      ? { record: output.profile.internships[0], warnings: [] }
      : output;
    return new Response(
      JSON.stringify({
        status: "completed",
        model: "test-agent",
        output: [
          {
            type: "function_call",
            call_id: "call_1",
            name: toolName,
            arguments: JSON.stringify(toolArguments),
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const result = await parseResumeProfile(
    {
      fileName: "resume.pdf",
      fileType: "pdf",
      text: "冉熙 中国科学院大学 计算机技术",
      extractedCharacterCount: 18,
      experienceSkill: "# Resume Experience STAR\nPreserve evidence and metrics.",
    },
    {
      apiKey: "test-key",
      baseUrl: "https://gateway.example.com/v1",
      model: "test-agent",
      reasoningEffort: "medium",
    },
    fetchImpl,
    (event) => progress.push(event),
  );
  assert.equal(requestUrl, "https://gateway.example.com/v1/responses");
  assert.equal(requestBody.tools[0].name, "submit_polished_experience");
  assert.deepEqual(requestBody.tool_choice, {
    type: "function",
    name: "submit_polished_experience",
  });
  assert.equal(requestBody.parallel_tool_calls, false);
  assert.equal(requestBody.text, undefined);
  assert.equal(result.profile.education.length, 1);
  assert.equal(callCount, 2);
  assert.ok(progress.some((event) => event.title === "润色实习经历 1/1"));
  assert.ok(progress.some((event) => event.title === "已完成实习经历 1/1"));
});

test("resume harness merges duplicate records before accepting a profile", () => {
  const submission = createResumeSubmission();
  submission.profile.education.push({
    ...submission.profile.education[0],
    college: "杭州高等研究院智能科学与技术学院",
    courses: "并行计算",
  });
  const finalized = finalizeResumeSubmission({ model: "test-agent", output: submission });
  assert.equal(finalized.output.profile.education.length, 1);
  assert.equal(
    finalized.output.profile.education[0].college,
    "杭州高等研究院智能科学与技术学院",
  );
  assert.match(finalized.output.profile.education[0].courses, /并行计算/);
  assert.equal(finalized.issues.length, 1);
});

test("resume harness classifies award levels from the awarded tier", () => {
  const submission = createResumeSubmission();
  submission.profile.awards = [
    { name: "全国大学生数模竞赛省二等奖", level: "", issuer: "", date: "2022", description: "" },
    { name: "挑战杯揭榜挂帅全国二等奖", level: "", issuer: "", date: "2023", description: "" },
    { name: "美国大学生数学建模 ICM H 奖", level: "", issuer: "", date: "2022", description: "" },
    { name: "浙江省政府奖学金", level: "", issuer: "", date: "2022", description: "" },
  ];
  const finalized = finalizeResumeSubmission({ model: "test-agent", output: submission });
  assert.deepEqual(
    finalized.output.profile.awards.map((award) => award.level),
    ["省级", "国家级", "国际级", "省级"],
  );
});

function createResumeSubmission() {
  return {
    summary: "已提取个人档案",
    profile: {
      schemaVersion: 1,
      basic: {
        fullName: "冉熙", preferredName: "", gender: "", birthDate: "",
        phone: "", email: "", wechat: "", currentCity: "", hometown: "",
        address: "", nationality: "", politicalStatus: "", idType: "", idNumber: "",
      },
      preferences: {
        targetRoles: "", targetCities: "", employmentType: "", earliestStartDate: "",
        expectedSalary: "", willingToRelocate: "",
      },
      education: [{
        school: "中国科学院大学", college: "", major: "计算机技术", degree: "硕士",
        educationType: "", startDate: "2024-09", endDate: "2027-06", gpa: "3.75",
        rank: "", courses: "",
      }],
      internships: [{
        company: "示例公司", department: "", role: "Agent 工程师", city: "",
        startDate: "2025-01", endDate: "2025-06", description: "开发 Agent 工具链",
        achievements: "处理耗时从 40 分钟降至 4 分钟",
      }],
      projects: [], campus: [], awards: [],
      skills: { technical: "", languages: "", certificates: "" },
      selfEvaluation: "", additionalNotes: "",
    },
    warnings: [],
  };
}
