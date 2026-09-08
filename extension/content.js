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
    actionElements: new Map(),
    plannedAction: null,
    targetRecord: "",
    agentRounds: 0,
    trace: [],
    matches: [],
    snapshots: new Map(),
    outcomes: new Map(),
    feedback: [],
  };
  const engine = window.__OFFERPILOT_FORM__;
  const failedActions = new WeakSet();
  const rulesReady = chrome.runtime.sendMessage({type:'offerpilot:load-rules'}).then((response) => {
    engine.configureRules(response?.ok ? response.data : [], (rules) => {
      chrome.runtime.sendMessage({type:'offerpilot:save-rules', rules}).catch(() => {});
    });
  }).catch(() => {});
  engine.setOptionMatcher(async (payload) => {
    const response = await chrome.runtime.sendMessage({ type: "offerpilot:match-option", payload });
    return response?.ok ? response.data.value : null;
  });

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
  const runBar = createElement("div", "agent-run-bar");
  const runPhase = createElement("span", "agent-run-phase", "IDLE");
  const runRound = createElement("span", "agent-run-round", "0 轮");
  runBar.append(runPhase, runRound);
  const tracePanel = createElement("div", "agent-trace");
  const content = createElement("div");
  const traceDetails = createElement("details", "agent-trace-details");
  traceDetails.append(createElement("summary", "", "执行详情"), runBar, tracePanel);
  body.append(status, content, traceDetails);

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

  function addTrace(kind, title, detail = "", data = null, stateName = "done") {
    const item = { kind, title, detail, data, state: stateName, time: new Date() };
    state.trace.push(item);
    if (state.trace.length > 40) state.trace.shift();
    renderTrace();
    return item;
  }

  function updateTrace(item, patch) {
    Object.assign(item, patch);
    renderTrace();
  }

  function renderTrace() {
    tracePanel.replaceChildren();
    runRound.textContent = `${state.agentRounds + 1} 轮`;
    runPhase.textContent = state.busy ? "RUNNING" : state.trace.length ? "READY" : "IDLE";
    for (const item of state.trace.slice(-8)) {
      const row = createElement("div", `agent-trace-item agent-trace-${item.state}`);
      const rail = createElement("span", "agent-trace-rail");
      const main = createElement("div", "agent-trace-main");
      const top = createElement("div", "agent-trace-top");
      top.append(createElement("span", "agent-trace-kind", item.kind), createElement("span", "agent-trace-title", item.title), createElement("time", "agent-trace-time", item.time.toLocaleTimeString("zh-CN", { hour12: false })));
      main.append(top);
      if (item.detail) main.append(createElement("div", "agent-trace-detail", item.detail));
      if (item.data) {
        const details = createElement("details", "agent-tool-result");
        details.append(createElement("summary", "", "查看工具结果"), createElement("pre", "", typeof item.data === "string" ? item.data : JSON.stringify(item.data, null, 2)));
        main.append(details);
      }
      row.append(rail, main);
      tracePanel.append(row);
    }
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    primaryButton.disabled = isBusy;
    secondaryButton.disabled = isBusy;
    renderTrace();
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
    for (const warning of result.warnings || []) results.append(createElement('div', 'agent-summary', `需要核对：${warning}`));
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
      await analyzePage();
      return;
    }
    await analyzePage();
  }

  function handleSecondaryAction() {
    if (state.view === "results" || state.view === "done") {
      resetAnalysis();
      return;
    }
    chrome.runtime.sendMessage({ type: "offerpilot:open-options" });
  }

  async function analyzePage() {
    setBusy(true);
    const scanTrace = addTrace("TOOL", "扫描页面结构", "读取可见经历、字段和安全操作", null, "running");
    setStatus("正在读取页面字段", "working");
    renderEmpty("正在分析", "读取表单字段、候选项和经历上下文");
    primaryButton.textContent = "分析中";

    try {
      await rulesReady;
      let extracted = extractFields();
      if (!extracted.fields.length) {
        const editors = [...document.querySelectorAll('button, a, [role="button"]')].filter(element =>
          !host.contains(element) && engine.visible(element) && !element.disabled && /^编辑简历$/.test(cleanLabel(element.textContent)));
        if (editors.length === 1) {
          const editor = editors[0];
          if (failedActions.has(editor)) throw new Error('编辑简历未进入编辑态，请检查页面后重试');
          const actionTrace = addTrace('ACTION', '进入简历编辑模式', '点击编辑简历，等待可操作字段出现', null, 'running');
          try {
            await performObservedAction(editor, 'edit_record');
            extracted = extractFields();
            updateTrace(actionTrace, { state: 'done', detail: `编辑态已确认，发现 ${extracted.fields.length} 个字段`, data: { status: 'editor_opened', fieldCount: extracted.fields.length } });
          } catch (error) {
            updateTrace(actionTrace, {state:'error',detail:error.message,data:{status:'no_editor_detected'}});
            throw error;
          }
        }
      }
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

      state.fields = extracted.fields;
      state.fieldElements = extracted.fieldElements;
      state.actionElements = extracted.actionElements;
      state.snapshots = new Map([...state.fieldElements].map(([id, elements]) => [id, engine.snapshot(elements)]));
      state.outcomes = new Map();
      state.matches = [];
      state.plannedAction = null;
      updateTrace(scanTrace, { state: "done", detail: `发现 ${state.fields.length} 个字段、${extracted.actions.length} 个可执行动作`, data: { headings: extracted.pageContext.headings, actions: extracted.actions } });
      if (!state.fields.length && !extracted.actions.length) {
        throw new Error("当前页面没有找到可填写字段");
      }

      setStatus(`Agent 正在匹配 ${state.fields.length} 个字段`, "working");
      if (!state.fields.some((field) => !field.currentValue) && extracted.actions.some((action) => ["add_record", "edit_record"].includes(action.type))) {
        const inventoryTrace = addTrace("AGENT", "盘点并对齐经历", "比对网页现有记录与个人档案", null, "running");
        setStatus("Agent 正在盘点现有经历", "working");
        const inventoryResponse = await chrome.runtime.sendMessage({
          type: "offerpilot:inventory-page",
          payload: { page: { url: location.href, title: document.title }, pageContext: extracted.pageContext, resume, actions: extracted.actions },
        });
        if (!inventoryResponse?.ok) throw new Error(inventoryResponse?.error || "页面盘点失败");
        const inventory = inventoryResponse.data;
        updateTrace(inventoryTrace, { state: "done", detail: inventory.summary, data: { existingRecords: inventory.existingRecords, missingRecords: inventory.missingRecords, correctionRecords: inventory.correctionRecords, targetRecord: inventory.targetRecord } });
        state.targetRecord = inventory.targetRecord || "";
        state.plannedAction = inventory.action ? { actionId: inventory.action.id, type: inventory.action.type, label: inventory.action.label } : null;
        if (!state.plannedAction) {
          state.view = "idle";
          setStatus("页面盘点完成，没有可执行的安全动作", "success");
          renderEmpty(inventory.summary || "现有经历已对齐", [...(inventory.missingRecords || []).map((item) => `缺失：${item}`), ...(inventory.correctionRecords || []).map((item) => `待修正：${item}`)].join("；"));
          primaryButton.textContent = "重新分析";
          return;
        }
        state.view = "results";
        addTrace("ACTION", inventory.action.type === "add_record" ? "准备新增记录" : "准备编辑记录", state.targetRecord, inventory.action, "pending");
        renderEmpty(`准备处理：${state.targetRecord}`, inventory.summary || state.plannedAction.label);
        primaryButton.textContent = "执行下一步";
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "offerpilot:match",
        payload: {
          page: { url: location.href, title: document.title },
          pageContext: extracted.pageContext,
          resume,
          fields: state.fields,
          actions: extracted.actions,
          targetRecord: state.targetRecord,
          executionFeedback: state.feedback.slice(-30),
        },
      });
      if (!response?.ok) throw new Error(response?.error || "Agent 匹配失败");

      state.matches = response.data.matches || [];
      addTrace("AGENT", "生成字段填充计划", response.data.summary, { targetRecord: state.targetRecord, matches: state.matches.map((match) => ({ fieldId: match.fieldId, value: match.value, confidence: match.confidence })) });
      state.plannedAction = response.data.actions?.[0] || null;
      if (!state.matches.length && !state.plannedAction) {
        state.view = "done";
        const emptyCount = state.fields.filter(field => !field.currentValue).length;
        setStatus(`没有新增填充项，${emptyCount} 个空字段待核对`, "idle");
        renderOutcomes();
        const explanation = createElement('div', 'agent-summary', response.data.summary || '当前档案没有可直接补填的匹配项');
        content.prepend(explanation);
        for (const warning of response.data.warnings || []) content.append(createElement('div', 'agent-summary', `需要核对：${warning}`));
        primaryButton.textContent = "补充填写";
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
      const runningTrace = state.trace.findLast((item) => item.state === "running");
      if (runningTrace) updateTrace(runningTrace, { state: "error", detail: error.message || "执行失败" });
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
    state.actionElements = new Map();
    state.plannedAction = null;
    state.targetRecord = "";
    state.agentRounds = 0;
    state.snapshots = new Map();
    state.outcomes = new Map();
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
    if (!selectedIds.size && !state.plannedAction) {
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
        const applied = await executeMatch(match);
        markElements(applied.elements, true);
        state.outcomes.set(match.fieldId, { success: true, value: applied.value });
        addTrace("TOOL", "写入字段", state.fields.find((field) => field.id === match.fieldId)?.label || match.fieldId, { value: match.value }, "done");
        successCount += 1;
      } catch (error) {
        state.outcomes.set(match.fieldId, { success: false, reason: engine.message(error) });
        const field = state.fields.find((item) => item.id === match.fieldId);
        state.feedback.push({ label: field?.label, section: field?.section, type: field?.type, attemptedValue: match.value, code: error.message, reason: engine.message(error) });
        markElements(elements, false);
        addTrace("TOOL", "字段写入失败", state.fields.find((field) => field.id === match.fieldId)?.label || match.fieldId, { error: error.message }, "error");
        failureCount += 1;
      }
    }

    for (const [id, outcome] of state.outcomes) {
      if (!outcome.success) continue;
      try {
        const elements = engine.resolve(state.snapshots.get(id));
        if (engine.read(elements) !== outcome.value || engine.validationError(elements)) throw new Error("write_not_persisted");
      } catch (error) {
        state.outcomes.set(id, { success: false, reason: engine.message(error) });
        successCount -= 1;
        failureCount += 1;
      }
    }
    const allApproved = state.matches.every((match) => selectedIds.has(match.fieldId));
    if (state.plannedAction && failureCount === 0 && allApproved && state.agentRounds < 20) {
      const actionElement = state.actionElements.get(state.plannedAction.actionId);
      if (actionElement?.isConnected && engine.visible(actionElement) && !actionElement.disabled) {
        const actionScope = actionElement.closest('form, [role="dialog"]');
        if (state.plannedAction.type === "finish_record" && (!actionScope || engine.validationError([...actionScope.querySelectorAll('input, select, textarea')]))) {
          setStatus("当前记录仍有校验问题，请检查后保存", "error");
          renderOutcomes();
          state.view = "done";
          primaryButton.textContent = "补充填写";
          setBusy(false);
          return;
        }
        const actionTrace = addTrace("ACTION", state.plannedAction.label || "执行页面动作", state.targetRecord, null, "running");
        actionElement.scrollIntoView({ block: "center", behavior: "smooth" });
        await new Promise((resolve) => setTimeout(resolve, 120));
        try {
          await performObservedAction(actionElement, state.plannedAction.type);
        } catch (error) {
          updateTrace(actionTrace, {state:'error',detail:error.message,data:{status:'no_expected_change'}});
          setStatus(error.message, 'error');
          state.plannedAction = null;
          state.view = 'done';
          primaryButton.textContent = '重新分析';
          setBusy(false);
          return;
        }
        state.agentRounds += 1;
        if (state.plannedAction.type === "finish_record" && actionElement.isConnected && engine.visible(actionElement)) {
          updateTrace(actionTrace, { state: "error", detail: "尚未确认记录保存，请检查页面" });
          setStatus("尚未确认记录保存，请检查页面", "error");
          renderOutcomes();
          state.view = "done";
          primaryButton.textContent = "补充填写";
          setBusy(false);
          return;
        }
        if (state.plannedAction.type === "finish_record") state.targetRecord = "";
        updateTrace(actionTrace, { state: "done", detail: "页面已更新，重新进入盘点" });
        state.view = "idle";
        setBusy(false);
        await analyzePage();
        return;
      }
    }

    setStatus(
      failureCount
        ? `已填写 ${successCount} 项，${failureCount} 项失败`
        : `已填写 ${successCount} 项，请检查后提交`,
      failureCount ? "error" : "success",
    );
    state.view = "done";
    renderOutcomes();
    primaryButton.textContent = "补充填写";
    setBusy(false);
  }

  function renderOutcomes() {
    content.replaceChildren();
    const results = createElement("div", "agent-results");
    for (const field of state.fields) {
      const outcome = state.outcomes.get(field.id);
      if (field.currentValue && !outcome) continue;
      const row = createElement("div", "agent-outcome-row");
      const main = createElement("div", "agent-match-main");
      main.append(createElement("div", "agent-match-label", `${field.required ? "必填 · " : ""}${field.label}`));
      main.append(createElement("div", "agent-match-reason", outcome?.success ? "已填写并通过读回校验" : outcome?.reason || (state.matches.some((match) => match.fieldId === field.id) ? "未勾选，等待确认" : "未匹配到档案事实，请补充或手动填写")));
      const locate = createElement("button", "agent-icon-button", "↗");
      locate.title = "定位字段";
      locate.setAttribute("aria-label", `定位${field.label}`);
      locate.addEventListener("click", () => {
        try { const [element] = engine.resolve(state.snapshots.get(field.id)); element.scrollIntoView({ block: "center" }); element.focus(); } catch { setStatus("页面已变化，请重新分析", "error"); }
      });
      row.append(main, locate);
      const match = state.matches.find((item) => item.fieldId === field.id);
      if (outcome && !outcome.success && match) {
        const retry = createElement("button", "agent-icon-button", "↻");
        retry.title = "重试此字段";
        retry.setAttribute("aria-label", `重试${field.label}`);
        retry.addEventListener("click", async () => {
          if (state.busy) return;
          setBusy(true);
          try {
            const applied = await engine.apply(state.snapshots.get(field.id), match.value);
            state.outcomes.set(field.id, { success: true, value: applied.value });
          } catch (error) { state.outcomes.set(field.id, { success: false, reason: engine.message(error) }); }
          renderOutcomes();
          setStatus(`已验证 ${[...state.outcomes.values()].filter((item) => item.success).length} 项，剩余项请检查`);
          setBusy(false);
        });
        row.append(retry);
      }
      results.append(row);
    }
    content.append(results);
  }

  async function executeMatch(match) {
    const snapshot = state.snapshots.get(match.fieldId);
    try { return await engine.apply(snapshot, match.value); }
    catch (error) {
      // One automatic recovery of the approved value; replanning still returns to review.
      if (!["option_not_found", "write_not_persisted"].includes(error.message)) throw error;
      const field = state.fields.find((item) => item.id === match.fieldId);
      state.feedback.push({ label: field?.label, section: field?.section, type: field?.type, attemptedValue: match.value, code: error.message });
      addTrace("RECOVER", "重新观察并重试字段", field?.label || match.fieldId);
      await new Promise((resolve) => setTimeout(resolve, 250));
      return engine.apply(snapshot, match.value);
    }
  }

  function extractFields() {
    revealResumeSectionControls();
    const candidates = engine.candidates().filter(isEligibleElement);
    const fields = [];
    const fieldElements = new Map();
    const grouped = new Set();

    for (const element of candidates) {
      const inputType = engine.kind(element);
      const ariaGroup = element.closest('[role="radiogroup"], [role="group"]');
      const groupName = element.name || (ariaGroup ? `aria:${[...document.querySelectorAll('[role="radiogroup"], [role="group"]')].indexOf(ariaGroup)}` : '');
      const groupKey =
        ["radio", "checkbox"].includes(inputType) && groupName
          ? `${inputType}:${groupName}:${getFieldGroup(element, 0).id}`
          : null;
      if (groupKey && grouped.has(groupKey)) continue;

      const elements = groupKey
        ? candidates.filter(
            (candidate) =>
              engine.kind(candidate) === inputType &&
              (element.name ? candidate.name === element.name : candidate.closest('[role="radiogroup"], [role="group"]') === ariaGroup) && getFieldGroup(candidate, 0).id === getFieldGroup(element, 0).id,
          )
        : [element];
      if (groupKey) grouped.add(groupKey);

      const label = getFieldLabel(element, elements);
      if (!label) continue;
      const id = `agent-field-${fields.length + 1}`;
      for (const target of elements) target.dataset.agentFieldId = id;

      const type = getFieldType(element);
      const group = getFieldGroup(element, fields.length + 1);
      fields.push({
        id,
        label,
        section: getSectionLabel(element),
        groupId: group.id,
        groupLabel: group.label,
        groupContext: group.context,
        type,
        multiple: type === "checkbox" || engine.multiple(element),
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

    const { actions, actionElements } = extractPageActions();
    return {
      fields,
      fieldElements,
      actions,
      actionElements,
      pageContext: {
        platform: engine.platform().id,
        headings: [...document.querySelectorAll("h1, h2, h3, h4, [role='heading']")]
          .map((heading) => cleanLabel(heading.textContent))
          .filter(Boolean)
          .slice(0, 40),
        visibleStructure: extractVisiblePageStructure(),
      },
    };
  }

  function extractVisiblePageStructure() {
    const nodes = [...document.querySelectorAll(
      "main, form, section, article, fieldset, h1, h2, h3, h4, button, [role='button']",
    )].filter((element) => isEligibleElement(element) && !host.contains(element));
    const seen = new Set();
    const lines = [];
    for (const element of nodes) {
      const rawText = String(element.innerText || element.textContent || '').replace(/[\s\u00a0]+/g, ' ').trim();
      const text = rawText.slice(0, 14000) + (rawText.length > 14000 ? ' [内容截断，不能据此判定后续记录缺失]' : '');
      if (!text || seen.has(text)) continue;
      seen.add(text);
      lines.push(`[${element.tagName.toLowerCase()}] ${text}`);
      if (lines.join("\n").length >= 16_000) break;
    }
    return lines.join("\n").slice(0, 16_000);
  }

  function extractPageActions() {
    const actions = [];
    const actionElements = new Map();
    const seenClickables = new Set();
    const candidates = [...document.querySelectorAll(
      "button, [role='button'], a, [class*='add'], [class*='Add'], [class*='edit'], [class*='Edit'], [onclick]",
    )].filter((element) => element instanceof HTMLElement && !host.contains(element) && engine.visible(element));
    for (const element of candidates) {
      let label = cleanLabel(element.textContent || element.getAttribute("aria-label") || element.title);
      let type = "";
      if (label.length <= 40 && /^(?:新增|添加).*(?:项目|实习|工作|教育|校园|奖项|经历|论文)$/.test(label)) type = "add_record";
      else if (/(?:^|[-_])(add|plus)(?:[-_]|$)/i.test(String(element.className || ""))) {
        const sectionName = findResumeSectionName(element);
        if (sectionName) {
          type = "add_record";
          label = `添加${sectionName}`;
        }
      }
      else if (/(?:^|[-_])edit(?:[-_]|$)/i.test(String(element.className || ""))) {
        const sectionName = findResumeSectionName(element);
        if (sectionName) {
          type = "edit_record";
          label = `编辑${sectionName}`;
        }
      }
      else if (/^(?:完成|保存)$/.test(label) && element.closest("form, [role='dialog'], [class*='edit'], [class*='form']")) type = "finish_record";
      if (!type || /删除|取消|投递|提交/.test(label)) continue;
      const clickable = closestClickableElement(element);
      if (!clickable || clickable.disabled || failedActions.has(clickable) || seenClickables.has(clickable)) continue;
      seenClickables.add(clickable);
      const id = `agent-action-${actions.length + 1}`;
      actions.push({ id, type, label, context: cleanLabel(element.parentElement?.textContent).slice(0, 1000) });
      actionElements.set(id, clickable);
    }
    return { actions, actionElements };
  }

  function findResumeSectionName(element) {
    let current = element.parentElement;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      if (current === document.body || current === document.documentElement || current.matches('main')) break;
      const heading = current.querySelector(':scope > .model_title, :scope > h2, :scope > h3, :scope > legend, :scope > [role="heading"]');
      const text = cleanLabel(heading?.textContent || current.textContent);
      const match = text.match(/^(基础信息|语言水平|工作\/实习经历|项目经历|工作经历|教育经历|实习经历|校园经历|获得奖项|论文)$/);
      if (match) return match[0];
    }
    return "";
  }

  function revealResumeSectionControls() {
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, div, span")]
      .filter((element) => /^(?:项目经历|工作经历|教育经历|实习经历)$/.test(cleanLabel(element.textContent)));
    for (const heading of headings) {
      const section = heading.closest("section, article, [class*='resume'], [class*='section']") || heading.parentElement;
      for (const target of [heading, section].filter(Boolean)) {
        target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
        target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      }
    }
  }

  function closestClickableElement(element) {
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
      if (
        current.matches("button, a, [role='button'], [onclick]") ||
        getComputedStyle(current).cursor === "pointer" ||
        /(?:add|edit|save|complete)/i.test(current.className || "")
      ) return current;
    }
    return null;
  }

  function waitForPageUpdate() {
    return new Promise((resolve) => {
      let settled;
      const observer = new MutationObserver(() => {
        clearTimeout(settled);
        settled = setTimeout(() => { observer.disconnect(); resolve(); }, 350);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      setTimeout(() => { observer.disconnect(); resolve(); }, 2500);
    });
  }

  async function performObservedAction(element, type) {
    if (!element.isConnected || !engine.visible(element) || element.disabled || failedActions.has(element)) throw new Error('操作入口已变化，请重新分析');
    const before = new Set(engine.candidates().filter(isEligibleElement));
    const scope = element.closest('form, [role="dialog"], .modal_form');
    element.click();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 120));
      if (type === 'finish_record') {
        if ((!element.isConnected || !engine.visible(element)) && (!scope || !engine.validationError([...scope.querySelectorAll('input,select,textarea')]))) return;
      } else {
        const after = engine.candidates().filter(isEligibleElement);
        if (after.some(field => !before.has(field))) return;
      }
    }
    failedActions.add(element);
    throw new Error(type === 'finish_record' ? '未确认保存成功，已停止后续操作' : '点击后没有出现新的编辑字段，已停止重复操作');
  }

  function getFieldGroup(element, fallbackIndex) {
    const selectors = [
      "fieldset", "section", "[role='group']", "form",
      ".form-card", ".form-section", ".form-group", ".resume-item",
      "[class*='formCard']", "[class*='form-card']", "[class*='resumeItem']",
      "[class*='resume-item']", "[class*='project']",
    ];
    let container = engine.group(element) || element.closest(selectors.join(", "));
    if (!container) container = closestSharedFormContainer(element);
    const label = cleanLabel(
      container?.querySelector(":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [role='heading']")?.textContent ||
      getSectionLabel(element),
    );
    const controls = container
      ? [...container.querySelectorAll('input, select, textarea, [contenteditable="true"]')]
      : [element];
    const context = controls
      .filter(isEligibleElement)
      .slice(0, 30)
      .map((control) => {
        const fieldLabel = getFieldLabel(control, [control]);
        const value = getCurrentValue([control], getFieldType(control));
        return value ? `${fieldLabel}: ${value}` : fieldLabel;
      })
      .filter(Boolean)
      .join(" | ")
      .slice(0, 4000);
    const id = container
      ? `${container.tagName}:${[...document.querySelectorAll(container.tagName)].indexOf(container)}`
      : `field:${fallbackIndex}`;
    return { id, label, context };
  }

  function closestSharedFormContainer(element) {
    let current = element.parentElement;
    while (current && current !== document.body) {
      const count = current.querySelectorAll('input, select, textarea, [contenteditable="true"]').length;
      if (count >= 2 && count <= 30) return current;
      current = current.parentElement;
    }
    return element.parentElement;
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
      ].includes(type) && !(type === "button" && ["combobox", "cascader"].includes(engine.kind(element)))
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
    const controlKind = engine.kind(element);
    if (["combobox", "cascader", "datepicker", "daterange", "radio", "checkbox", "switch", "slider", "spinbutton"].includes(controlKind)) return controlKind;
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
    const platformLabel = engine.label(element);
    if (platformLabel) return platformLabel;
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
    const platformHeading = engine.heading(element);
    if (platformHeading) return platformHeading;
    const section = element.closest("fieldset, section, [role='group'], form, [class*='project'], [class*='resume']");
    const heading = section?.querySelector(
      "legend, h1, h2, h3, h4, [role='heading']",
    );
    return cleanLabel(heading?.textContent).slice(0, 300);
  }

  function getCurrentValue(elements) {
    return engine.read(elements).slice(0, 4000);
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
    if (["radio", "checkbox", "switch"].includes(type)) {
      return elements.slice(0, 200).map((element) => ({
        label: cleanLabel(
          element.labels?.[0]?.textContent || engine.optionValue(element),
        ).slice(0, 300),
        value: engine.optionValue(element).slice(0, 300),
      }));
    }
    return [];
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
