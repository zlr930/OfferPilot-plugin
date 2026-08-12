import {
  createMatchPlan,
  DEFAULT_API_BASE_URL,
  normalizeBaseUrl,
  parseResumeProfile,
  testOpenAIConnection,
} from "./openai-client.js";

const LEGACY_DEFAULT_API_BASE_URLS = new Set([
  "https://api.openai.com/v1",
  "https://api.tosky.top/v1",
]);

restrictStorageAccess();

chrome.runtime.onInstalled.addListener(restrictStorageAccess);
chrome.runtime.onStartup.addListener(restrictStorageAccess);

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || "")) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "offerpilot:toggle" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "offerpilot:open-options") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  const handlers = {
    "offerpilot:health": () => handleConnectionTest(message.config),
    "offerpilot:match": () => handleMatchRequest(message.payload),
    "offerpilot:parse-resume": () => handleResumeParse(message.payload, message.config),
    "offerpilot:get-profile": () => getProfile(),
  };
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler().then(sendResponse);
  return true;
});

async function restrictStorageAccess() {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    const { openaiBaseUrl } = await chrome.storage.local.get("openaiBaseUrl");
    if (!openaiBaseUrl || LEGACY_DEFAULT_API_BASE_URLS.has(openaiBaseUrl)) {
      await chrome.storage.local.set({ openaiBaseUrl: DEFAULT_API_BASE_URL });
    }
  } catch (error) {
    console.error("Failed to restrict extension storage:", error.message);
  }
}

async function getOpenAIConfig(override = {}) {
  const settings = await chrome.storage.local.get([
    "openaiApiKey",
    "openaiBaseUrl",
    "openaiModel",
    "reasoningEffort",
  ]);
  const storedBaseUrl =
    !settings.openaiBaseUrl ||
    LEGACY_DEFAULT_API_BASE_URLS.has(settings.openaiBaseUrl)
      ? DEFAULT_API_BASE_URL
      : settings.openaiBaseUrl;
  return {
    apiKey: override.apiKey || settings.openaiApiKey || "",
    baseUrl: normalizeBaseUrl(
      override.baseUrl || storedBaseUrl,
    ),
    model: override.model || settings.openaiModel || "gpt-5.6-sol",
    reasoningEffort:
      override.reasoningEffort || settings.reasoningEffort || "low",
  };
}

async function getProfile() {
  try {
    const settings = await chrome.storage.local.get(["profile", "resumeText"]);
    return { ok: true, data: settings };
  } catch (error) {
    return { ok: false, error: error.message || "读取档案失败" };
  }
}

async function handleConnectionTest(override) {
  try {
    const config = await getOpenAIConfig(override);
    await ensureHostPermission(config.baseUrl);
    const data = await testOpenAIConnection(config);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || "OpenAI 连接失败" };
  }
}

async function handleMatchRequest(payload) {
  try {
    const config = await getOpenAIConfig();
    await ensureHostPermission(config.baseUrl);
    const data = await createMatchPlan(payload, config);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || "Agent 匹配失败" };
  }
}

async function handleResumeParse(payload, override) {
  try {
    const config = await getOpenAIConfig(override);
    await ensureHostPermission(config.baseUrl);
    const data = await parseResumeProfile(
      payload,
      config,
    );
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error.message || "简历解析失败" };
  }
}

async function ensureHostPermission(baseUrl) {
  const origin = `${new URL(normalizeBaseUrl(baseUrl)).origin}/*`;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) {
    throw new Error("请在扩展设置页检测连接，并授权访问 API Base URL");
  }
}
