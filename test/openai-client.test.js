import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchPlan,
  extractResponseText,
  normalizeBaseUrl,
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
  assert.equal(RESUME_PARSE_TIMEOUT_MS, 240_000);
});
