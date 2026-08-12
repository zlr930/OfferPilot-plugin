(() => {
  const existing = window.__OFFERPILOT__;
  if (existing) {
    existing.toggle();
    return;
  }

  const state = {
    visible: true,
    busy: false,
    view: "idle",
    fields: [],
    fieldElements: new Map(),
    matches: [],
  };

  const host = document.createElement("div");
  host.id = "offerpilot-root";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = chrome.runtime.getURL("content.css");
  shadow.appendChild(stylesheet);

  const panel = createElement("section", "agent-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "OfferPilot");
  shadow.appendChild(panel);

  const header = createElement("header", "agent-header");
  header.dataset.dragHandle = "true";
  const mark = createElement("div", "agent-mark", "OP");
  const titleWrap = createElement("div", "agent-title-wrap");
  titleWrap.append(
    createElement("div", "agent-title", "OfferPilot"),
    createElement("div", "agent-subtitle", "匹配后确认填写"),
  );
  const settingsButton = iconButton("设置", "⚙");
  settingsButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "offerpilot:open-options" });
  });
  const closeButton = iconButton("关闭", "×");
  closeButton.addEventListener("click", toggle);
  header.append(mark, titleWrap, settingsButton, closeButton);

  const body = createElement("div", "agent-body");
  const status = createElement("div", "agent-status");
  const statusDot = createElement("span", "agent-status-dot");
  const statusText = createElement("span", "", "准备分析当前表单");
  status.append(statusDot, statusText);
  const content = createElement("div");
  body.append(status, content);

  const footer = createElement("footer", "agent-footer");
  const secondaryButton = createElement("button", "agent-button", "配置简历");
  secondaryButton.type = "button";
  secondaryButton.addEventListener("click", handleSecondaryAction);
  const primaryButton = createElement(
    "button",
    "agent-button agent-button-primary",
    "分析当前页面",
  );
  primaryButton.type = "button";
  primaryButton.addEventListener("click", handlePrimaryAction);
  footer.append(secondaryButton, primaryButton);
  panel.append(header, body, footer);

  let drag = null;
  header.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag, { once: true });
  });

  function onDrag(event) {
    if (!drag) return;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    panel.style.left = `${Math.min(maxLeft, Math.max(0, event.clientX - drag.x))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(0, event.clientY - drag.y))}px`;
    panel.style.right = "auto";
  }

  function stopDrag() {
    drag = null;
    document.removeEventListener("mousemove", onDrag);
  }

  function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function iconButton(label, symbol) {
    const button = createElement("button", "agent-icon-button", symbol);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    return button;
  }

  function setStatus(message, statusState = "idle") {
    status.dataset.state = statusState;
    statusText.textContent = message;
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    primaryButton.disabled = isBusy;
    secondaryButton.disabled = isBusy;
  }

  function renderEmpty(title, metadata = "") {
    content.replaceChildren();
    const empty = createElement("div", "agent-empty");
    const wrap = createElement("div");
    wrap.append(createElement("div", "agent-empty-title", title));
    if (metadata) {
      wrap.append(createElement("div", "agent-empty-meta", metadata));
    }
    empty.append(wrap);
    content.append(empty);
  }

  function renderResults(result) {
    content.replaceChildren();
    const results = createElement("div", "agent-results");
    results.append(
      createElement(
        "div",
        "agent-summary",
        `${result.summary} · ${result.meta.acceptedMatchCount}/${result.meta.requestedFieldCount} 个字段可匹配`,
      ),
    );

    for (const match of state.matches) {
      const field = state.fields.find(
        (candidate) => candidate.id === match.fieldId,
      );
      if (!field) continue;
      const row = createElement("label", "agent-match-row");
      const checkbox = createElement("input", "agent-match-check");
      checkbox.type = "checkbox";
      checkbox.dataset.fieldId = match.fieldId;
      checkbox.checked = !match.requiresConfirmation;
      const main = createElement("div", "agent-match-main");
      main.append(
        createElement(
          "div",
          "agent-match-label",
          field.section ? `${field.section} · ${field.label}` : field.label,
        ),
        createElement("div", "agent-match-value", match.value),
        createElement(
          "div",
          "agent-match-reason",
          `${match.reason} · 来源：${match.source}`,
        ),
      );
      const confidence = createElement(
        "span",
        "agent-confidence",
        `${Math.round(match.confidence * 100)}%`,
      );
      confidence.dataset.review = String(match.requiresConfirmation);
      confidence.title = match.requiresConfirmation
        ? "需要人工确认"
        : "可直接填写";
      row.append(checkbox, main, confidence);
      results.append(row);
    }
    content.append(results);
  }

  async function handlePrimaryAction() {
    if (state.busy) return;
    if (state.view === "results") {
      await applySelectedMatches();
      return;
    }
    if (state.view === "done") {
      resetAnalysis();
      return;
    }
    await analyzePage();
  }

  function handleSecondaryAction() {
    if (state.view === "results") {
      resetAnalysis();
      return;
    }
    chrome.runtime.sendMessage({ type: "offerpilot:open-options" });
  }

  async function analyzePage() {
    setBusy(true);
    setStatus("正在读取页面字段", "working");
    renderEmpty("正在分析", "只发送字段标签和候选项，不发送整页内容");
    primaryButton.textContent = "分析中";

    try {
      const profileResponse = await chrome.runtime.sendMessage({
        type: "offerpilot:get-profile",
      });
      if (!profileResponse?.ok) {
        throw new Error(profileResponse?.error || "读取个人档案失败");
      }
      const settings = profileResponse.data || {};
      const resume = serializeResume(settings.profile, settings.resumeText);
      if (!resume) {
        throw new Error("请先在设置中完善个人档案");
      }

      const extracted = extractFields();
      state.fields = extracted.fields;
      state.fieldElements = extracted.fieldElements;
      if (!state.fields.length) {
        throw new Error("当前页面没有找到可填写字段");
      }

      setStatus(`Agent 正在匹配 ${state.fields.length} 个字段`, "working");
      const response = await chrome.runtime.sendMessage({
        type: "offerpilot:match",
        payload: {
          page: { url: location.href, title: document.title },
          resume,
          fields: state.fields,
        },
      });
      if (!response?.ok) throw new Error(response?.error || "Agent 匹配失败");

      state.matches = response.data.matches || [];
      if (!state.matches.length) {
        state.view = "idle";
        setStatus("没有可安全填写的匹配项", "success");
        renderEmpty("未匹配到字段", "页面内容保持不变");
        primaryButton.textContent = "重新分析";
        return;
      }

      state.view = "results";
      renderResults(response.data);
      const reviewCount = state.matches.filter(
        (match) => match.requiresConfirmation,
      ).length;
      setStatus(
        reviewCount
          ? `${state.matches.length} 项建议，${reviewCount} 项需要确认`
          : `${state.matches.length} 项建议可填写`,
        "success",
      );
      secondaryButton.textContent = "重新分析";
      primaryButton.textContent = "应用选中";
    } catch (error) {
      state.view = "idle";
      state.matches = [];
      setStatus(error.message || "分析失败", "error");
      renderEmpty("无法完成分析", error.message || "请稍后重试");
      primaryButton.textContent = "重试";
    } finally {
      setBusy(false);
    }
  }

  function serializeResume(profile, legacyResumeText) {
    if (profile && typeof profile === "object" && !Array.isArray(profile)) {
      const compact = compactProfileValue(profile);
      const factKeys = Object.keys(compact).filter(
        (key) => key !== "schemaVersion",
      );
      if (factKeys.length) return JSON.stringify(compact);
    }
    return String(legacyResumeText || "").trim();
  }

  function compactProfileValue(value) {
    if (Array.isArray(value)) {
      return value.map(compactProfileValue).filter((item) => {
        if (item && typeof item === "object") return Object.keys(item).length;
        return item !== "";
      });
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== "id")
          .map(([key, child]) => [key, compactProfileValue(child)])
          .filter(([, child]) => {
            if (Array.isArray(child)) return child.length;
            if (child && typeof child === "object") {
              return Object.keys(child).length;
            }
            return child !== "";
          }),
      );
    }
    return typeof value === "string" ? value.trim() : value;
  }

  function resetAnalysis() {
    state.view = "idle";
    state.matches = [];
    state.fields = [];
    state.fieldElements = new Map();
    setStatus("准备分析当前表单");
    renderEmpty("当前页面尚未分析");
    secondaryButton.textContent = "配置简历";
    primaryButton.textContent = "分析当前页面";
  }

  async function applySelectedMatches() {
    const selectedIds = new Set(
      [...shadow.querySelectorAll(".agent-match-check:checked")].map(
        (checkbox) => checkbox.dataset.fieldId,
      ),
    );
    if (!selectedIds.size) {
      setStatus("请至少选择一个匹配项", "error");
      return;
    }

    setBusy(true);
    let successCount = 0;
    let failureCount = 0;
    for (const match of state.matches) {
      if (!selectedIds.has(match.fieldId)) continue;
      const elements = state.fieldElements.get(match.fieldId) || [];
      try {
        await applyValue(elements, match.value);
        markElements(elements, true);
        successCount += 1;
      } catch {
        markElements(elements, false);
        failureCount += 1;
      }
    }

    setStatus(
      failureCount
        ? `已填写 ${successCount} 项，${failureCount} 项失败`
        : `已填写 ${successCount} 项，请检查后提交`,
      failureCount ? "error" : "success",
    );
    state.view = "done";
    primaryButton.textContent = "重新分析";
    setBusy(false);
  }

  function extractFields() {
    const candidates = [
      ...document.querySelectorAll(
        'input, select, textarea, [contenteditable="true"]',
      ),
    ].filter(isEligibleElement);
    const fields = [];
    const fieldElements = new Map();
    const grouped = new Set();

    for (const element of candidates) {
      const inputType = (element.type || "").toLowerCase();
      const groupKey =
        ["radio", "checkbox"].includes(inputType) && element.name
          ? `${inputType}:${element.name}`
          : null;
      if (groupKey && grouped.has(groupKey)) continue;

      const elements = groupKey
        ? candidates.filter(
            (candidate) =>
              (candidate.type || "").toLowerCase() === inputType &&
              candidate.name === element.name,
          )
        : [element];
      if (groupKey) grouped.add(groupKey);

      const label = getFieldLabel(element, elements);
      if (!label) continue;
      const id = `agent-field-${fields.length + 1}`;
      for (const target of elements) target.dataset.agentFieldId = id;

      const type = getFieldType(element);
      fields.push({
        id,
        label,
        section: getSectionLabel(element),
        type,
        required: elements.some(
          (target) =>
            target.required || target.getAttribute("aria-required") === "true",
        ),
        currentValue: getCurrentValue(elements, type),
        placeholder: String(element.placeholder || "")
          .trim()
          .slice(0, 500),
        options: getOptions(elements, type),
      });
      fieldElements.set(id, elements);
    }

    return { fields, fieldElements };
  }

  function isEligibleElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (host.contains(element)) return false;
    const type = (element.type || "").toLowerCase();
    if (
      [
        "hidden",
        "password",
        "file",
        "submit",
        "button",
        "reset",
        "image",
      ].includes(type)
    ) {
      return false;
    }
    if (element.disabled || element.getAttribute("aria-disabled") === "true")
      return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function getFieldType(element) {
    if (element.isContentEditable) return "contenteditable";
    if (element instanceof HTMLSelectElement) return "select";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    const type = (element.type || "text").toLowerCase();
    const supported = new Set([
      "email",
      "tel",
      "url",
      "number",
      "date",
      "month",
      "radio",
      "checkbox",
    ]);
    return supported.has(type) ? type : "text";
  }

  function cleanLabel(value) {
    return String(value || "")
      .replace(/[\s\u00a0]+/g, " ")
      .replace(/[＊*：:]\s*$/, "")
      .trim()
      .slice(0, 500);
  }

  function getFieldLabel(element, groupElements) {
    if (groupElements.length > 1) {
      const legend = element
        .closest("fieldset")
        ?.querySelector("legend")?.textContent;
      if (cleanLabel(legend)) return cleanLabel(legend);
      const container = element.closest(
        ".form-item, .form-group, .field, .ant-form-item, .el-form-item, [class*='formItem'], [class*='form-item']",
      );
      const groupLabel = container?.querySelector(
        ":scope > label, .ant-form-item-label, .el-form-item__label",
      );
      if (cleanLabel(groupLabel?.textContent))
        return cleanLabel(groupLabel.textContent);
    }

    const direct = [
      element.getAttribute("aria-label"),
      element.labels?.[0]?.textContent,
      element.id
        ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
            ?.textContent
        : "",
      element.placeholder,
      element.name,
    ]
      .map(cleanLabel)
      .find(Boolean);
    if (direct && !/^(input|select|textarea|field)[-_\d]*$/i.test(direct)) {
      return direct;
    }

    const container = element.closest(
      ".form-item, .form-group, .field, .ant-form-item, .el-form-item, [class*='formItem'], [class*='form-item']",
    );
    if (container) {
      const label = container.querySelector(
        "label, .ant-form-item-label, .el-form-item__label, [class*='label']",
      );
      if (cleanLabel(label?.textContent)) return cleanLabel(label.textContent);
    }
    return direct || "";
  }

  function getSectionLabel(element) {
    const section = element.closest("fieldset, section, [role='group']");
    const heading = section?.querySelector(
      "legend, h1, h2, h3, h4, [role='heading']",
    );
    return cleanLabel(heading?.textContent).slice(0, 300);
  }

  function getCurrentValue(elements, type) {
    if (type === "radio") {
      return elements.find((element) => element.checked)?.value || "";
    }
    if (type === "checkbox") {
      return elements
        .filter((element) => element.checked)
        .map((element) => element.value || "true")
        .join(",");
    }
    const element = elements[0];
    return String(
      element.isContentEditable ? element.textContent : element.value || "",
    )
      .trim()
      .slice(0, 4000);
  }

  function getOptions(elements, type) {
    if (type === "select") {
      return [...elements[0].options]
        .filter((option) => !option.disabled && String(option.value).trim())
        .slice(0, 200)
        .map((option) => ({
          label: cleanLabel(option.textContent).slice(0, 300),
          value: String(option.value).slice(0, 300),
        }));
    }
    if (["radio", "checkbox"].includes(type)) {
      return elements.slice(0, 200).map((element) => ({
        label: cleanLabel(
          element.labels?.[0]?.textContent || element.value,
        ).slice(0, 300),
        value: String(element.value || "true").slice(0, 300),
      }));
    }
    return [];
  }

  async function applyValue(elements, value) {
    if (!elements.length) throw new Error("field_not_found");
    const element = elements[0];
    const type = getFieldType(element);
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    await new Promise((resolve) => setTimeout(resolve, 80));

    if (type === "radio") {
      const target = elements.find(
        (candidate) => String(candidate.value) === value,
      );
      if (!target) throw new Error("option_not_found");
      target.click();
      dispatchFormEvents(target);
      return;
    }

    if (type === "checkbox") {
      const selectedValues = new Set(
        value.split(",").map((part) => part.trim()),
      );
      for (const target of elements) {
        const shouldCheck = selectedValues.has(String(target.value || "true"));
        if (target.checked !== shouldCheck) target.click();
        dispatchFormEvents(target);
      }
      return;
    }

    if (type === "select") {
      const targetOption = [...element.options].find(
        (option) => String(option.value) === value,
      );
      if (!targetOption) throw new Error("option_not_found");
      setNativeValue(element, targetOption.value);
      dispatchFormEvents(element);
      return;
    }

    if (type === "contenteditable") {
      element.focus();
      element.textContent = value;
      dispatchFormEvents(element);
      return;
    }

    element.focus();
    setNativeValue(element, value);
    dispatchFormEvents(element);
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  function dispatchFormEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function markElements(elements, success) {
    for (const element of elements) {
      const previousOutline = element.style.outline;
      const previousOffset = element.style.outlineOffset;
      element.style.setProperty(
        "outline",
        `2px solid ${success ? "rgba(32, 166, 106, 0.75)" : "rgba(209, 67, 67, 0.75)"}`,
        "important",
      );
      element.style.setProperty("outline-offset", "2px", "important");
      setTimeout(() => {
        element.style.outline = previousOutline;
        element.style.outlineOffset = previousOffset;
      }, 3500);
    }
  }

  function toggle() {
    state.visible = !state.visible;
    panel.hidden = !state.visible;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "offerpilot:toggle") toggle();
  });

  window.__OFFERPILOT__ = { toggle };
  resetAnalysis();
})();
