(() => {
  if (window.__OFFERPILOT_FORM__) return;
  const registry = window.__OFFERPILOT_ADAPTERS__;
  const wrappers =
    registry.choices.map((item) => item.trigger).join(", ") +
    ', [role="combobox"], [aria-haspopup="listbox"], [aria-autocomplete="list"], [aria-autocomplete="both"]';
  const controls =
    'input, select, textarea, [contenteditable="true"], .atsx-date-picker-period-month-label, [role="textbox"], [role="radio"], [role="checkbox"], [role="switch"], [role="slider"], [role="spinbutton"], ' +
    wrappers;
  const panels =
    registry.choices.map((item) => item.panel).join(", ") +
    ', [role="listbox"], [role="tree"], [role="menu"], .ant-modal, .school-form, .subject-wrap, [class*="dropdown"], [class*="Dropdown"], [class*="popper"], [class*="Popover"]';
  const options =
    registry.choices.map((item) => item.option).join(", ") +
    ', [role="option"], [role="treeitem"], [role="menuitem"], .school-item, .subject-item, .ant-radio-wrapper, .ant-checkbox-wrapper';
  const selected =
    registry.choices.map((item) => item.selected).join(", ") +
    ", [data-selected-label]";
  const disabled =
    '[disabled], [aria-disabled="true"], .disabled, .is-disabled, [class*="-disabled"], [class*="last-month"], [class*="next-month-cell"], [class*="last-decade"], [class*="next-decade-cell"]';
  const itemSelector =
    '.ant-form-item, .el-form-item, .form-item, .form-group, .field, [class*="form-item"], [class*="apply-field"]';
  const adapters = [
    { id: 'meituan', name: '美团', host: /(^|\.)zhaopin\.meituan\.com$/, marker: '.resume_detail_edit .mtd-form', group: '.modal_form, .base_info_form', item: '.mtd-form-item', label: '.label', heading: '.model_title' },
    {
      id: "atsx",
      name: "ATSX",
      host: /a^/,
      marker: ".atsx-form-item-label",
      group: ".resumeEditForm-item",
      item: ".atsx-form-item",
      label: ".atsx-form-item-label",
      heading: ".createFormSection-title",
    },
    {
      id: "hotjob",
      name: "Hotjob",
      host: /(^|\.)hotjob\.cn$/,
      marker: ".set_i_content_table",
      group: ".form-cell-inner, .set_i_content_table",
      item: ".ant-form-item, .resume_info",
      label: ".ant-form-item-label, .resume_info_title",
      heading: ".tit, .setTitle",
    },
    {
      id: "feishu",
      name: "飞书",
      host: /(^|\.)(feishu\.cn|bytedance\.com)$/,
      marker: ".bitable-form-item",
      group: ".bitable-form-item",
      item: ".bitable-form-item",
      label: 'label, [class*="title"]',
      heading: "h2, h3",
    },
    {
      id: "zhilian",
      name: "智联",
      host: /(^|\.)zhaopin\.com$/,
      marker: ".lxselect-box",
      group: ".resume-item, fieldset, section",
      item: ".form-item, .field",
      label: 'label, [class*="label"]',
      heading: "h2, h3",
    },
    {
      id: "moka",
      name: "Moka",
      host: /(^|\.)mokahr\.com$/,
      marker: '[class*="apply-block"] [class*="apply-fields"]',
      group: '[class*="apply-fields"]',
      item: '[class*="apply-field"]',
      label: '[class*="title"], label',
      heading: '[class*="blockTitle"], h2, h3',
    },
    {
      id: "beisen",
      name: "北森",
      host: /(^|\.)(zhipin|italent)\.com$/,
      marker: ".ux-standard-form, .phoenix-input__input",
      group: ".ux-standard-form, .form_container",
      item: ".form-item, .form_part_container li",
      label: ".form-item__text, label",
      heading: ".dl_menutit, h2, h3",
    },
  ];
  const normalize = (value) =>
    String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function visible(element) {
    if (
      !element?.isConnected ||
      element.closest('[hidden], [inert], [aria-hidden="true"]')
    )
      return false;
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      element.getClientRects().length > 0
    );
  }
  function platform() {
    return (
      adapters.find(
        (adapter) =>
          adapter.host.test(location.hostname) ||
          document.querySelector(adapter.marker),
      ) || { id: "generic", name: "通用表单" }
    );
  }
  function group(element) {
    const adapter = platform();
    return adapter.group ? element.closest(adapter.group) : null;
  }
  function label(element) {
    const adapter = platform();
    const item = element.closest(adapter.item || itemSelector);
    return normalize(
      item?.querySelector(
        adapter.label || "label, .ant-form-item-label, .el-form-item__label",
      )?.textContent,
    );
  }
  function heading(element) {
    const adapter = platform();
    if (adapter.id === 'meituan') return normalize(element.closest('.model_edit')?.querySelector('.model_title')?.textContent || '基础信息');
    return normalize(
      group(element)?.parentElement?.querySelector(
        adapter.heading || "h2, h3, legend",
      )?.textContent,
    );
  }
  function root(element) {
    return (
      element.closest(
        registry.choices.map((item) => item.trigger).join(", "),
      ) ||
      element.closest('[role="combobox"], [aria-haspopup="listbox"]') ||
      element
    );
  }
  function multiple(element) {
    const widget = root(element);
    const controlled = element.getAttribute('aria-controls');
    if (controlled && document.getElementById(controlled)?.closest('.el-select-dropdown.is-multiple')) return true;
    return (
      !!element.multiple ||
      widget.matches(
        '[aria-multiselectable="true"], .ant-select-multiple, .el-select--multiple, .ivu-select-multiple, .atsx-select-multiple, .kuma-select2-multiple, .ud__select-multiple',
      ) ||
      !!widget.querySelector(
        ".el-select__tags, .ant-select-selection--multiple",
      )
    );
  }
  function rangeInputs(element) {
    const container = element.closest(registry.range);
    return container
      ? [...container.querySelectorAll("input")]
          .filter((item) => item.type !== "hidden")
          .slice(0, 2)
      : [];
  }
  function dateAdapter(element) {
    return registry.dates.find((item) => element.closest(item.trigger));
  }
  function kind(element) {
    if (element.matches("select")) return "select";
    if (["radio", "checkbox"].includes(element.type)) return element.type;
    if (rangeInputs(element).length === 2) return "daterange";
    const calendar = dateAdapter(element);
    if (
      calendar &&
      (!["phoenix", "moka"].includes(calendar.id) ||
        /日期|时间|年月|date|yyyy/i.test(
          `${element.placeholder} ${label(element)} ${element.className}`,
        ))
    )
      return "datepicker";
    const widget = root(element);
    if (
      element.matches(".phoenix-input__input") &&
      !element.readOnly &&
      !element.hasAttribute("aria-controls") &&
      !/学校|院校|专业|公司|地区|城市/.test(label(element))
    )
      return "text";
    if (
      platform().id === "zhilian" &&
      element.readOnly &&
      element.closest(".el-input")
    )
      return "cascader";
    if (
      /cascader/.test(widget.className) ||
      widget.getAttribute("aria-haspopup") === "tree"
    )
      return "cascader";
    if (widget.matches(wrappers)) return "combobox";
    if (
      element.closest(".ant-picker, .el-date-editor") ||
      element.matches('[aria-haspopup="grid"]')
    )
      return "datepicker";
    return element.isContentEditable
      ? "contenteditable"
      : element.getAttribute("role") || element.type || "text";
  }
  function candidates() {
    const all = [...document.querySelectorAll(controls)].filter(visible);
    const byRoot = new Map();
    for (const element of all) {
      const widget = root(element);
      if (!byRoot.has(widget)) byRoot.set(widget, []);
      byRoot.get(widget).push(element);
    }
    return all.filter((element) => {
      const widget = root(element);
      const peers = byRoot.get(widget);
      if (kind(element) === "daterange")
        return element === rangeInputs(element)[0];
      const input = peers.find(
        (other) =>
          other.matches('input:not([type="hidden"])') && !other.disabled,
      );
      return element === (input || peers[0]);
    });
  }
  function read(elements) {
    const element = elements[0];
    if (!element) return "";
    const type = kind(element);
    if (type === "daterange")
      return rangeInputs(element)
        .map((item) => normalize(item.value))
        .join(" / ")
        .replace(/^\s*\/\s*$/, "");
    if (["radio", "checkbox", "switch"].includes(type))
      return elements
        .filter(
          (item) =>
            item.checked || item.getAttribute("aria-checked") === "true",
        )
        .map(optionValue)
        .sort()
        .join(",");
    if (["slider", "spinbutton"].includes(type) && !element.matches("input"))
      return element.getAttribute("aria-valuenow") || "";
    if (type === "select" && element.multiple)
      return [...element.selectedOptions]
        .map((item) => item.value)
        .sort()
        .join(",");
    if (type === "combobox" || type === "cascader") {
      const labels = selectedLabels(root(element));
      if (labels.length) return labels.join(",");
    }
    const display =
      element.getAttribute("data-value") ??
      (element.matches(".atsx-date-picker-period-month-label")
        ? element.textContent
        : "");
    return normalize(
      element.isContentEditable
        ? element.textContent
        : (element.value ?? display),
    );
  }
  function selectedLabels(widget) {
    const nodes = [...widget.querySelectorAll(selected)].filter((item) => !item.matches('.is-transparent, .el-select__input-wrapper, .el-select__placeholder.is-transparent, .mtd-select-placeholder') && !item.closest('[aria-hidden="true"]'));
    return nodes
      .filter(
        (item) =>
          !nodes.some((child) => child !== item && item.contains(child)),
      )
      .map((item) =>
        normalize(item.getAttribute("data-selected-label") || item.textContent),
      )
      .filter(value => value && !/^(请选择|请选择一项|Select|Please select)$/i.test(value));
  }
  function optionValue(element) {
    return String(
      element.value ??
        element.getAttribute("data-value") ??
        element.getAttribute("aria-label") ??
        normalize(element.textContent),
    );
  }
  function snapshot(elements) {
    return {
      elements,
      before: read(elements),
      identities: elements.map((element) => ({
        id: element.id,
        name: element.getAttribute("name"),
        tag: element.tagName,
        type: kind(element),
        scope:
          group(element) ||
          element.closest('fieldset, [role="group"], .resume-item, form') ||
          element.getRootNode(),
      })),
    };
  }
  // Replacements must have a unique stable identity inside the original record scope.
  function resolve(snapshot) {
    return snapshot.elements.map((element, index) => {
      const identity = snapshot.identities[index];
      if (element.isConnected) {
        if (
          !identity.scope.contains(element) ||
          kind(element) !== identity.type
        )
          throw new Error("field_changed");
        return element;
      }
      if (!identity.scope.isConnected) throw new Error("field_changed");
      const selector = identity.id
        ? `#${CSS.escape(identity.id)}`
        : identity.name
          ? `[name="${CSS.escape(identity.name)}"]`
          : null;
      if (!selector) throw new Error("field_changed");
      const matches = [...identity.scope.querySelectorAll(selector)].filter(
        (item) =>
          visible(item) &&
          item.tagName === identity.tag &&
          kind(item) === identity.type,
      );
      if (matches.length !== 1) throw new Error("field_changed");
      return matches[0];
    });
  }
  function events(element) {
    element.dispatchEvent(
      new Event("input", { bubbles: true, composed: true }),
    );
    element.dispatchEvent(
      new Event("change", { bubbles: true, composed: true }),
    );
  }
  function setValue(element, value) {
    if (element.isContentEditable) {
      const view = element.ownerDocument.defaultView;
      element.focus();
      const selection = view.getSelection();
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      const allowed = element.dispatchEvent(
        new view.InputEvent("beforeinput", {
          inputType: "insertFromPaste",
          data: value,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      if (allowed) {
        range.deleteContents();
        range.insertNode(element.ownerDocument.createTextNode(value));
      }
      element.dispatchEvent(
        new view.InputEvent("input", {
          inputType: "insertFromPaste",
          data: value,
          bubbles: true,
          composed: true,
        }),
      );
      element.dispatchEvent(new view.Event("change", { bubbles: true }));
      return;
    } else {
      if (!element.matches("input, textarea, select"))
        throw new Error("unsupported_control");
      const prototype =
        element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(
        element,
        value,
      );
    }
    events(element);
  }
  function validationError(elements) {
    return elements.some((element) => {
      if (
        element.getAttribute("aria-invalid") === "true" ||
        (element.validity && !element.validity.valid)
      )
        return true;
      const item = element.closest(itemSelector);
      return (
        item &&
        [
          ...item.querySelectorAll(
            '.ant-form-item-explain-error, .el-form-item__error, [role="alert"]',
          ),
        ].some((error) => visible(error) && normalize(error.textContent))
      );
    });
  }
  async function waitFor(check, timeout = 1800) {
    const deadline = Date.now() + timeout;
    do {
      const value = check();
      if (value) return value;
      await pause(60);
    } while (Date.now() < deadline);
    throw new Error("option_not_found");
  }
  const learnedPanels = new Map();
  let persistRules = null;
  function saveRules() { persistRules?.([...learnedPanels].map(([key, selector]) => ({key, selector, updatedAt:Date.now()}))); }
  function ruleKey(element) { return JSON.stringify([location.pathname, root(element).tagName, root(element).className, label(element)]); }
  function learnedCandidates(element) {
    const key = ruleKey(element);
    const selector = learnedPanels.get(key);
    if (!selector) return [];
    const found = [...document.querySelectorAll(selector)];
    if (found.length !== 1 || !found[0].querySelector('[role="option"], [data-value], [aria-selected]')) { learnedPanels.delete(key); saveRules(); return []; }
    return found;
  }
  function associatedPanels(element, previous) {
    const widget = root(element);
    const ids = [
      element,
      widget,
      ...widget.querySelectorAll("[aria-controls], [aria-owns]"),
    ]
      .flatMap((item) =>
        `${item.getAttribute("aria-controls") || ""} ${item.getAttribute("aria-owns") || ""}`.split(
          /\s+/,
        ),
      )
      .filter(Boolean);
    if (ids.length)
      return [...new Set([...new Set(ids)]
        .map(
          (id) =>
            element.getRootNode().getElementById?.(id) ||
            element.ownerDocument.getElementById(id),
        )
        .map((node) => node?.closest('.ant-select-dropdown, .el-select-dropdown') || node)
        .filter(visible))];
    const opened = [
      ...new Set([
        ...document.querySelectorAll(panels),
        ...learnedCandidates(element),
        ...(previous.discovered || []),
      ]),
    ].filter((panel) => visible(panel) && !previous.has(panel));
    return opened.filter(
      (panel) =>
        !opened.some((other) => other !== panel && other.contains(panel)),
    );
  }
  function observePanels(element, previous) {
    previous.discovered = new Set();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const nodes =
          record.type === "childList"
            ? [...record.addedNodes]
            : [record.target];
        for (const node of nodes) {
          if (
            !(node instanceof HTMLElement) ||
            node.contains(element) ||
            node.closest("#offerpilot-root")
          )
            continue;
          const candidates = [
            node,
            ...node.querySelectorAll(
              '[role="listbox"], [role="tree"], [role="menu"]',
            ),
          ];
          for (const candidate of candidates) {
            const style = getComputedStyle(candidate);
            if (
              (candidate.matches(
                '[role="listbox"], [role="tree"], [role="menu"]',
              ) ||
                ["fixed", "absolute"].includes(style.position)) &&
              candidate.querySelector(
                '[role="option"], [role="treeitem"], [data-value], [aria-selected]',
              ) &&
              !candidate.querySelector("form, a[href]")
            )
              previous.discovered.add(candidate);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });
    return observer;
  }
  function activate(element) {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }
  const optionCache = new Map();
  let optionMatcher = null;
  function optionText(element) {
    const title = element.querySelector(
      ".ant-select-tree-title, .ant-tree-title, .atsx-tree-title, .atsx-select-tree-node-content-wrapper, .el-tree-node__label, .ud__tree__node__label, .area-text-label",
    );
    return normalize(
      element.getAttribute("aria-label") ||
        title?.textContent ||
        element.textContent,
    );
  }
  async function matchOption(items, value, element) {
    const exact = items.filter(
      (item) =>
        optionText(item) === normalize(value) ||
        item.getAttribute("data-value") === value,
    );
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error("ambiguous_option");
    if (!optionMatcher || !items.length) return null;
    const labels = items.map(optionText);
    const key = JSON.stringify([label(element), value, labels]);
    let answer = optionCache.get(key);
    if (!answer) {
      answer = await optionMatcher({
        label: label(element),
        value,
        candidates: labels,
      });
      if (answer) optionCache.set(key, answer);
    }
    const matches = items.filter((item) => optionText(item) === answer);
    return matches.length === 1 ? matches[0] : null;
  }
  function panelOptions(panel) {
    let items = [...panel.querySelectorAll(options)].filter(
      (item) => visible(item) && !item.closest(disabled) && ![...ancestors(item, panel)].some((parent) => {
        const style = getComputedStyle(parent);
        return /hidden|clip/.test(style.overflow) && (parent.clientWidth === 0 || parent.clientHeight === 0);
      }),
    );
    if (!items.length)
      items = [
        ...panel.querySelectorAll(
          '[data-value], [aria-selected], [class*="option"], [class*="Option"]',
        ),
      ].filter((item) => visible(item) && !item.closest(disabled));
    return items.filter(
      (item) =>
        optionText(item) &&
        !/^(暂无数据|无匹配数据|No data|请选择|请输入)/i.test(
          optionText(item),
        ) &&
        !items.some(
          (child) =>
            child !== item &&
            item.contains(child) &&
            optionText(child) === optionText(item),
        ),
    );
  }
  function* ancestors(element, stop) { for (let parent = element.parentElement; parent && parent !== stop; parent = parent.parentElement) yield parent; }
  async function findOption(getPanel, value, element) {
    const seen = new Set();
    const expanded = new Set();
    const observedLabels = new Set();
    let targetValue = value;
    const deadline = Date.now() + 6000;
    let semanticAttempted = false;
    while (Date.now() < deadline) {
      const panel = getPanel();
      if (!panel) {
        await pause(80);
        continue;
      }
      const items = panelOptions(panel);
      for (const item of items) if (observedLabels.size < 200) observedLabels.add(optionText(item));
      const exact = items.filter(
        (item) => optionText(item) === normalize(targetValue),
      );
      if (exact.length > 1) throw new Error("ambiguous_option");
      if (exact.length === 1) return exact[0];
      const switchers = usable(
        panel,
        ".ant-select-tree-switcher, .ant-tree-switcher, .atsx-tree-switcher, .atsx-select-tree-switcher, .ud__expandButton, .ud__tree__node__expandIcon, .el-tree-node__expand-icon",
      );
      const nextBranch = switchers.find(
        (item) =>
          !expanded.has(item) &&
          item.closest("[aria-expanded]")?.getAttribute("aria-expanded") !==
            "true" &&
          !item.matches('.is-leaf, [class*="noop"]'),
      );
      if (nextBranch && expanded.size < 80) {
        expanded.add(nextBranch);
        nextBranch.click();
        await pause(100);
        continue;
      }
      const scroll = [panel, ...panel.querySelectorAll("*")].find(
        (item) =>
          visible(item) &&
          item.scrollHeight > item.clientHeight + 4 &&
          /auto|scroll/.test(getComputedStyle(item).overflowY),
      );
      if (
        scroll &&
        scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 2 &&
        seen.size < 40
      ) {
        const position = scroll.scrollTop;
        if (!seen.has(position)) {
          seen.add(position);
          scroll.scrollTop += Math.max(30, scroll.clientHeight * 0.8);
          scroll.dispatchEvent(new Event("scroll", { bubbles: true }));
          await pause(100);
          continue;
        }
      }
      if (items.length && !semanticAttempted) {
        semanticAttempted = true;
        if (optionMatcher && observedLabels.size > items.length) {
          const answer = await optionMatcher({ label: label(element), value, candidates: [...observedLabels] });
          if (answer && observedLabels.has(answer)) {
            targetValue = answer;
            if (scroll) { scroll.scrollTop = 0; scroll.dispatchEvent(new Event('scroll', { bubbles: true })); seen.clear(); }
            await pause(100);
            continue;
          }
        }
        const result = await matchOption(items, value, element);
        if (result) return result;
      }
      await pause(100);
    }
    throw new Error("option_not_found");
  }
  async function confirmPanel(panel) {
    if (!panel || !visible(panel)) return;
    const buttons = [
      ...panel.querySelectorAll(
        'button, [role="button"], .s-cascader__footer-button, .phoenix-button--primary, .phoenix-button__wraper--primary',
      ),
    ].filter(
      (item) =>
        visible(item) &&
        !item.closest(disabled) &&
        /^(确定|确认|完成选择|OK|Confirm)$/i.test(normalize(item.textContent)),
    );
    if (buttons.length === 1) {
      buttons[0].click();
      await pause(120);
    }
  }
  async function choose(element, value, type) {
    const widget = root(element);
    const isMultiple = multiple(element);
    const previous = new Set(
      [...document.querySelectorAll(panels)].filter(visible),
    );
    const observer = observePanels(element, previous);
    let userEdited = false;
    const onInput = (event) => {
      if (event.isTrusted) userEdited = true;
    };
    element.addEventListener("input", onInput);
    const paths = isMultiple
      ? value.split(/\s*[,，;；]\s*/).filter(Boolean)
      : [value];
    const chosen = [];
    const getPanel = () => {
      const active = associatedPanels(element, previous);
      if (active.length === 1 && active[0].id && previous.discovered?.has(active[0])) {
        if (learnedPanels.size >= 50) learnedPanels.delete(learnedPanels.keys().next().value);
        const key = ruleKey(element), selector = `#${CSS.escape(active[0].id)}`;
        if (learnedPanels.get(key) !== selector) { learnedPanels.set(key, selector); saveRules(); }
      }
      return active.length === 1 ? active[0] : null;
    };
    activate(widget.querySelector('.ant-select-selector, .el-select__wrapper') || widget);
    try {
      await pause(100);
      if (!getPanel()) {
        element.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
          }),
        );
        await pause(150);
      }
      for (const path of paths) {
        if (userEdited) throw new Error("value_changed");
        if (chosen.length && !getPanel()) activate(widget);
        if (isMultiple && selectedLabels(widget).includes(path)) { chosen.push(path); continue; }
        const parts = /\s[/>→]\s|\//.test(path)
          ? path.split(/\s*[/>→]\s*/).filter(Boolean)
          : [path];
        const search =
          element.matches("input") && !element.readOnly
            ? element
            : widget.querySelector(
                'input:not([readonly]):not([type="hidden"])',
              ) ||
              getPanel()?.querySelector(
                'input:not([readonly]):not([type="hidden"])',
              );
        const alreadyVisible = getPanel() && panelOptions(getPanel()).some((item) => optionText(item) === normalize(path));
        if (parts.length === 1 && search && !alreadyVisible) {
          setValue(search, path);
          await pause(300);
        }
        for (let index = 0; index < parts.length; index++) {
          const panel = getPanel();
          if (
            platform().id === "zhilian" &&
            panel?.querySelector(".s-cascader")
          ) {
            const currentItems = panelOptions(panel);
            if (
              !currentItems.some(
                (item) => optionText(item) === normalize(parts[index]),
              )
            ) {
              const popular = currentItems.filter(
                (item) => optionText(item) === "热门",
              );
              if (popular.length === 1) {
                popular[0].click();
                await pause(150);
              }
            }
          }
          const option = await findOption(getPanel, parts[index], element);
          if (userEdited) throw new Error("value_changed");
          const text = optionText(option);
          const expand = option.querySelector(
            ".ant-select-tree-switcher, .ant-tree-switcher, .atsx-tree-switcher, .atsx-select-tree-switcher, .el-tree-node__expand-icon, .ud__expandButton, .ud__tree__node__expandIcon, .area-icon-right",
          );
          if (index < parts.length - 1 && expand) expand.click();
          else if (
            option.getAttribute("aria-selected") !== "true" &&
            option.getAttribute("aria-checked") !== "true"
          ) {
            (
              option.querySelector(
                ".ant-select-tree-title, .ant-tree-title, .atsx-tree-title, .ud__tree__node__label, .area-text-label",
              ) || option
            ).click();
          }
          if (index === parts.length - 1)
            chosen.push(parts.length > 1 ? parts.join(" / ") : text);
          await pause(150);
        }
      }
      await confirmPanel(getPanel());
      await waitFor(
        () =>
          associatedPanels(element, previous).length === 0 ||
          (isMultiple
            ? chosen.every((item) => selectedLabels(widget).includes(item))
            : selectedLabels(widget).includes(chosen[0])),
      );
      return chosen.join(",");
    } catch (error) {
      if (
        !userEdited &&
        element.matches("input") &&
        !element.readOnly &&
        normalize(element.value) === normalize(value) &&
        !widget.querySelector(selected)
      )
        setValue(element, "");
      throw error;
    } finally {
      observer.disconnect();
      element.removeEventListener("input", onInput);
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
      element.blur();
    }
  }
  async function chooseDate(element, value) {
    const preset = dateAdapter(element);
    const selector =
      preset?.panel ||
      '.ant-picker-dropdown, .el-picker-panel, [role="dialog"]';
    const previous = new Set(
      [...document.querySelectorAll(selector)].filter(visible),
    );
    const ids =
      `${element.getAttribute("aria-controls") || ""} ${element.getAttribute("aria-owns") || ""}`
        .split(/\s+/)
        .filter(Boolean);
    element.click();
    const panel = await waitFor(() => {
      const opened = [...document.querySelectorAll(selector)].filter(
        (item) =>
          visible(item) &&
          (ids.length ? ids.includes(item.id) : !previous.has(item)),
      );
      const outer = opened.filter(
        (item) =>
          !opened.some((other) => item !== other && other.contains(item)),
      );
      return outer.length === 1 ? outer[0] : null;
    });
    try {
      if (preset && (await calendar(panel, value, preset))) return;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const cells = [
          ...panel.querySelectorAll("[title], [aria-label], [data-date]"),
        ].filter(
          (item) =>
            visible(item) &&
            !item.closest(
              '[aria-disabled="true"], .disabled, .is-disabled, .ant-picker-cell-disabled',
            ) &&
            [
              item.title,
              item.getAttribute("aria-label"),
              item.getAttribute("data-date"),
            ].some((text) => normalize(text) === value),
        );
        if (cells.length === 1) {
          cells[0].click();
          return;
        }
        const header = panel.querySelector(
          ".ant-picker-header-view, .el-date-picker__header",
        );
        const text = normalize(header?.textContent);
        const year = text.match(/\b(\d{4})\b/)?.[1];
        const month =
          text.match(/(\d{1,2})\s*月/)?.[1] ||
          [
            "jan",
            "feb",
            "mar",
            "apr",
            "may",
            "jun",
            "jul",
            "aug",
            "sep",
            "oct",
            "nov",
            "dec",
          ].findIndex((name) => text.toLowerCase().includes(name)) + 1;
        if (!year || !month) throw new Error("unsupported_control");
        const [targetYear, targetMonth] = value.split("-").map(Number);
        const difference =
          (targetYear - Number(year)) * 12 + targetMonth - Number(month);
        if (!difference) throw new Error("option_not_found");
        const direction = difference < 0 ? "prev" : "next";
        const byYear = Math.abs(difference) >= 12;
        const button = panel.querySelector(
          byYear
            ? `.ant-picker-header-super-${direction}-btn, .el-date-picker__${direction}-btn .${direction}-year, .${direction}-year`
            : `.ant-picker-header-${direction}-btn, .${direction}-month`,
        );
        if (!button || !visible(button) || button.disabled)
          throw new Error("unsupported_control");
        button.click();
        await waitFor(() => normalize(header.textContent) !== text);
      }
      throw new Error("unsupported_control");
    } finally {
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    }
  }
  function usable(scope, selector) {
    return selector
      ? [...scope.querySelectorAll(selector)].filter(
          (item) => visible(item) && !item.closest(disabled),
        )
      : [];
  }
  const monthNames = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ];
  function monthNumber(text) {
    const clean = normalize(text).toLowerCase();
    const index = monthNames.indexOf(clean);
    if (index >= 0) return index + 1;
    const english = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].findIndex((name) => clean.startsWith(name));
    if (english >= 0) return english + 1;
    return /^\d{1,2}月?$/.test(clean) ? parseInt(clean, 10) : null;
  }
  async function calendar(panel, value, preset) {
    const [year, month, day] = value.split(/[-/]/).map(Number);
    const columns = usable(panel, ".atsx-date-picker-period-month-panel-list");
    if (columns.length === 2) {
      const yearItem = usable(
        columns[0],
        ".atsx-date-picker-period-month-panel-list-item",
      ).filter((item) => normalize(item.textContent) === String(year));
      if (yearItem.length !== 1 || !month) throw new Error("option_not_found");
      yearItem[0].click();
      await pause(100);
      const monthItem = usable(
        columns[1],
        ".atsx-date-picker-period-month-panel-list-item",
      ).filter((item) => monthNumber(item.textContent) === month);
      if (monthItem.length !== 1) throw new Error("option_not_found");
      monthItem[0].click();
      return true;
    }
    const exactCell = () =>
      usable(panel, "[title], [aria-label], [data-date]").filter((item) =>
        [
          item.title,
          item.getAttribute("aria-label"),
          item.getAttribute("data-date"),
        ].includes(value),
      );
    let cells = exactCell();
    if (cells.length === 1) {
      cells[0].click();
      return true;
    }
    // Switch to the year grid, then move through decades until the requested year exists.
    const opener = usable(panel, preset.yearOpen).find((item) =>
      /\d{4}|年/.test(item.textContent),
    );
    if (
      !opener &&
      !usable(panel, preset.year).some((item) =>
        /^\d{4}$/.test(normalize(item.textContent)),
      )
    ) {
      for (let count = 0; count < 240; count++) {
        cells = exactCell();
        if (cells.length === 1) {
          cells[0].click();
          return true;
        }
        const header = normalize(
          panel.querySelector(preset.header)?.textContent,
        );
        const currentYear = Number(header.match(/\d{4}/)?.[0]);
        const currentMonth = Number(header.match(/(\d{1,2})\s*月/)?.[1]);
        if (!currentYear) return false;
        const delta =
          (year - currentYear) * 12 + (month || 1) - (currentMonth || 1);
        if (delta === 0 || (!day && year === currentYear)) {
          const targets = usable(panel, day ? preset.day : preset.month).filter(
            (item) =>
              day
                ? normalize(item.textContent) === String(day)
                : monthNumber(item.textContent) === month,
          );
          if (targets.length !== 1) return false;
          targets[0].click();
          return true;
        }
        const yearNavigation = !day || !currentMonth || Math.abs(delta) >= 12;
        const direction = yearNavigation ? year - currentYear : delta;
        const button = usable(
          panel,
          yearNavigation
            ? direction < 0
              ? preset.prevYear
              : preset.nextYear
            : direction < 0
              ? preset.prev
              : preset.next,
        )[0];
        if (!button) return false;
        const before = panel.textContent;
        button.click();
        await waitFor(() => panel.textContent !== before);
      }
      throw new Error("date_navigation_limit");
    }
    if (opener && !opener.matches(".kuma-select2")) {
      opener.click();
      await pause(100);
    }
    if (opener?.matches(".kuma-select2")) {
      await choose(opener, String(year), "combobox");
    } else {
      let found = false;
      for (let round = 0; round < 60; round++) {
        const years = usable(panel, preset.year).filter((item) =>
          /^\d{4}$/.test(normalize(item.textContent)),
        );
        const targets = years.filter(
          (item) => Number(normalize(item.textContent)) === year,
        );
        if (targets.length === 1) {
          targets[0].click();
          found = true;
          await pause(100);
          break;
        }
        const shown = years.map((item) => Number(normalize(item.textContent)));
        const current = shown.length
          ? Math.min(...shown)
          : Number(
              normalize(panel.querySelector(preset.header)?.textContent).match(
                /\d{4}/,
              )?.[0],
            );
        if (!current) return false;
        const button = usable(
          panel,
          year < current ? preset.prevYear : preset.nextYear,
        )[0];
        if (!button) return false;
        const before = panel.textContent;
        button.click();
        await waitFor(() => panel.textContent !== before);
      }
      if (!found) throw new Error("date_navigation_limit");
    }
    if (!month) return true;
    let months = usable(panel, preset.month).filter(
      (item) => monthNumber(item.textContent) === month,
    );
    if (!months.length) {
      const monthOpener = usable(panel, preset.monthOpen).find((item) =>
        /月|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(
          item.textContent,
        ),
      );
      if (monthOpener?.matches(".kuma-select2"))
        await choose(monthOpener, `${month}月`, "combobox");
      else if (monthOpener) {
        monthOpener.click();
        await pause(100);
      }
      months = usable(panel, preset.month).filter(
        (item) => monthNumber(item.textContent) === month,
      );
    }
    if (months.length === 1) {
      months[0].click();
      await pause(100);
    } else if (visible(panel)) return false;
    if (!day) return true;
    cells = exactCell();
    if (cells.length === 1) {
      cells[0].click();
      return true;
    }
    const days = usable(panel, preset.day).filter(
      (item) => normalize(item.textContent) === String(day),
    );
    if (days.length !== 1) throw new Error("ambiguous_option");
    days[0].click();
    return true;
  }
  function dateValue(element, value) {
    if (platform().id === 'meituan' && element.closest('.mtd-date-picker') && /^\d{4}[-/]\d{1,2}$/.test(value)) {
      const [year, month] = value.split(/[-/]/);
      if (+month < 1 || +month > 12) throw new Error('date_format');
      return `${year}/${month.padStart(2,'0')}`;
    }
    const hint = `${element.placeholder || ""} ${element.getAttribute("data-format") || ""}`;
    if (/^(YYYY|年|年份)$/i.test(hint.trim()) && /^\d{4}$/.test(value))
      return value;
    const match = normalize(value).match(
      /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/,
    );
    if (!match) throw new Error("date_format");
    const [, year, month, day] = match;
    if (
      +month < 1 ||
      +month > 12 ||
      (day && (+day < 1 || +day > new Date(+year, +month, 0).getDate()))
    )
      throw new Error("date_format");
    const monthOnly =
      element.type === "month" ||
      (/YYYY[-/]MM(?![-/]DD)|年月|选择月份/i.test(hint) &&
        !/DD|日/i.test(hint)) ||
      !!element.closest(
        ".el-date-editor--monthrange, .md-date-editor--monthrange, .atsx-date-picker-period-month",
      );
    if (!monthOnly && !day) throw new Error("date_precision");
    const separator = hint.includes("/") ? "/" : "-";
    return [
      year,
      month.padStart(2, "0"),
      ...(!monthOnly ? [day.padStart(2, "0")] : []),
    ].join(
      element.type === "month" || element.type === "date" ? "-" : separator,
    );
  }
  async function fillRange(element, value) {
    const inputs = rangeInputs(element);
    const values = value
      .split(/\s+(?:\/|至|到|~|—)\s+|\s*[~至]\s*/)
      .filter(Boolean);
    if (values.length !== 2 || inputs.length !== 2)
      throw new Error("date_range_required");
    const formatted = inputs.map((input, index) =>
      dateValue(input, values[index]),
    );
    if (formatted[0] > formatted[1]) throw new Error("date_range_order");
    if (inputs.some((input, index) => input.value && normalize(input.value) !== formatted[index])) throw new Error("value_changed");
    const preset = dateAdapter(element);
    if (inputs.every((input) => !input.readOnly)) {
      for (let index = 0; index < 2; index++) {
        if (normalize(inputs[index].value) === formatted[index]) continue;
        inputs[index].focus();
        setValue(inputs[index], formatted[index]);
      }
      inputs[1].blur();
    } else {
      const previous = new Set(
        [...document.querySelectorAll(preset.panel)].filter(visible),
      );
      inputs[0].click();
      const panel = await waitFor(() =>
        [...document.querySelectorAll(preset.panel)].find(
          (item) => visible(item) && !previous.has(item),
        ),
      );
      const innerInputs = [...panel.querySelectorAll("input")].filter(
        (input) => visible(input) && !input.readOnly && input.type !== "hidden",
      );
      if (innerInputs.length === 2) {
        for (let index = 0; index < 2; index++)
          setValue(innerInputs[index], formatted[index]);
        innerInputs[1].blur();
      } else {
        for (let index = 0; index < 2; index++) {
          const halves = usable(
            panel,
            ".el-date-range-picker__content, .md-date-range-picker__content, .ant-calendar-range-part, .ant-calendar-range-left, .ant-calendar-range-right, .ant-picker-panel, .next-calendar",
          );
          const scope = halves[index] || panel;
          if (!(await calendar(scope, formatted[index], preset)))
            throw new Error("unsupported_control");
        }
      }
      await confirmPanel(panel);
    }
    return formatted.join(" / ");
  }
  async function applyOnce(snapshot, requestedValue) {
    let elements = resolve(snapshot);
    let element = elements[0];
    if (
      elements.some(
        (item) =>
          !(visible(item) || (['combobox','cascader'].includes(kind(item)) && visible(root(item)))) ||
          item.matches(":disabled") ||
          item.closest('[aria-disabled="true"], .mtd-select-disabled, .mtd-date-picker-disabled'),
      )
    )
      throw new Error("field_unavailable");
    if (read(elements) !== (snapshot.checkpoint ?? snapshot.before) || (snapshot.before && snapshot.checkpoint === undefined))
      throw new Error("value_changed");
    const type = kind(element);
    let value = String(requestedValue ?? "").trim();
    if (!value) throw new Error("empty_value");
    if (
      ["hidden", "password", "file", "submit", "button", "reset"].includes(type)
    )
      throw new Error("unsupported_control");
    element.scrollIntoView({ block: "center" });
    element.focus();
    if (type === "combobox" || type === "cascader")
      value = await choose(element, value, type);
    else if (type === "daterange") value = await fillRange(element, value);
    else if (
      type === "datepicker" &&
      (element.readOnly || !element.matches("input"))
    ) {
      value = dateValue(element, value);
      await chooseDate(element, value);
    } else if (element.readOnly) throw new Error("unsupported_control");
    else if (["radio", "checkbox", "switch"].includes(type)) {
      const values =
        type === "checkbox" ? value.split(",").map(normalize) : [value];
      if (
        values.some(
          (item) => !elements.some((target) => optionValue(target) === item),
        )
      )
        throw new Error("option_not_found");
      for (const target of elements)
        if (
          (target.checked || target.getAttribute("aria-checked") === "true") !==
          values.includes(optionValue(target))
        )
          target.click();
      value = values.sort().join(",");
    } else if (type === "select") {
      const values = element.multiple
        ? value.split(",").map(normalize)
        : [value];
      if (
        values.some(
          (item) =>
            ![...element.options].some(
              (option) =>
                option.value === item &&
                !option.disabled &&
                !option.parentElement.disabled,
            ),
        )
      )
        throw new Error("option_not_found");
      if (element.multiple) {
        for (const option of element.options)
          option.selected = values.includes(option.value);
        events(element);
      } else setValue(element, value);
      value = values.sort().join(",");
    } else if (
      ["slider", "spinbutton"].includes(type) &&
      !element.matches("input")
    ) {
      const target = Number(value);
      const min = Number(element.getAttribute("aria-valuemin"));
      const max = Number(element.getAttribute("aria-valuemax"));
      if (!Number.isFinite(target) || target < min || target > max)
        throw new Error("validation_failed");
      for (
        let count = 0;
        count < 1000 &&
        Number(element.getAttribute("aria-valuenow")) !== target;
        count++
      ) {
        const before = element.getAttribute("aria-valuenow");
        element.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: Number(before) < target ? "ArrowRight" : "ArrowLeft",
            bubbles: true,
          }),
        );
        await pause(10);
        if (before === element.getAttribute("aria-valuenow"))
          throw new Error("unsupported_control");
      }
    } else {
      if (["date", "month", "datepicker"].includes(type))
        value = dateValue(element, value);
      else if (element.matches("input")) {
        const date = value.match(
          /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?$/,
        );
        if (date && /^(年|年份|YYYY)$/i.test(element.placeholder))
          value = date[1];
        if (date && /^(月|月份|MM)$/i.test(element.placeholder))
          value = String(Number(date[2]));
      }
      setValue(element, value);
    }
    element.blur();
    element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    // Require a stable readback after framework updates and asynchronous validation.
    let stableSince = 0;
    const deadline = Date.now() + 2200;
    while (Date.now() < deadline) {
      await pause(100);
      elements = resolve(snapshot);
      element = elements[0];
      const actual = read(elements);
      const equal = multiple(element)
        ? actual.split(",").sort().join(",") ===
          normalize(value).split(",").sort().join(",")
        : type === "cascader"
          ? actual.replace(/\s*[/>→]\s*/g, "/") ===
            normalize(value).replace(/\s*[/>→]\s*/g, "/")
          : actual === normalize(value);
      const open =
        root(element).getAttribute("aria-expanded") === "true" ||
        element.getAttribute("aria-expanded") === "true";
      if (
        equal &&
        !validationError(elements) &&
        !(["combobox", "cascader"].includes(type) && open)
      ) {
        stableSince ||= Date.now();
        if (Date.now() - stableSince >= 600) return { value: actual, elements };
      } else stableSince = 0;
    }
    throw new Error(
      validationError(elements) ? "validation_failed" : "write_not_persisted",
    );
  }
  // Checkpoints belong to this exact plan and value. Never adopt arbitrary page edits.
  const attempts = new WeakMap();
  async function apply(snapshot, requestedValue) {
    const previous = attempts.get(snapshot);
    const elements = resolve(snapshot);
    const before = read(elements);
    if (previous && (previous.value !== requestedValue || previous.actual !== before || previous.userEdited)) throw new Error('value_changed');
    if (previous?.rounds >= 3) throw new Error('retry_limit');
    let userEdited = false;
    const captureEdit = (event) => {
      if (event.isTrusted && elements.some((element) => root(element).contains(event.target) || rangeInputs(element).includes(event.target))) userEdited = true;
    };
    document.addEventListener('input', captureEdit, true);
    document.addEventListener('change', captureEdit, true);
    try {
      const recoverable = previous && !snapshot.before && (multiple(elements[0]) || kind(elements[0]) === 'daterange');
      if (recoverable) snapshot.checkpoint = previous.actual;
      return await applyOnce(snapshot, requestedValue);
    } catch (error) {
      let actual;
      try { actual = read(resolve(snapshot)); } catch { actual = null; }
      attempts.set(snapshot, { value: requestedValue, actual, userEdited, rounds: (previous?.rounds || 0) + 1, code: error.message });
      throw error;
    } finally {
      delete snapshot.checkpoint;
      document.removeEventListener('input', captureEdit, true);
      document.removeEventListener('change', captureEdit, true);
    }
  }
  const messages = {
    field_changed: "页面字段已变化，请重新分析",
    retry_limit: "此计划已重试三次，请重新分析",
    field_unavailable: "字段不可操作",
    value_changed: "字段已有内容或已被修改，已保留",
    option_not_found: "未找到唯一可选项，请手动选择",
    unsupported_control: "此控件暂需手动填写",
    region_path_required: "地区需要完整的省 / 市 / 区路径",
    date_format: "日期格式无效",
    date_precision: "简历日期缺少日，请手动补充",
    empty_value: "没有可填写的值",
    validation_failed: "网站校验未通过",
    write_not_persisted: "填写结果未能稳定保留，请检查",
    ambiguous_option: "候选项不唯一，请确认后选择",
    date_range_required: "日期区间需要起止日期，以 / 分隔",
    date_range_order: "结束日期早于开始日期",
    date_navigation_limit: "日期导航超过上限",
  };
  window.__OFFERPILOT_FORM__ = {
    configureRules: (rules, persist) => {
      for (const rule of (rules || []).slice(-50)) {
        if (typeof rule.key === 'string' && /^#(?:[\w-]|\\.)+$/.test(rule.selector)) learnedPanels.set(rule.key, rule.selector);
      }
      persistRules = persist;
    },
    candidates,
    kind,
    root,
    read,
    snapshot,
    resolve,
    apply,
    platform,
    group,
    label,
    heading,
    visible,
    multiple,
    rangeInputs,
    optionValue,
    validationError,
    setOptionMatcher: (matcher) => {
      optionMatcher = matcher;
    },
    message: (error) => messages[error.message] || error.message,
  };
})();
