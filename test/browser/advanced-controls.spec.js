import { test, expect } from "@playwright/test";
import path from "node:path";

async function setup(page, html) {
  await page.setContent(html);
  for (const file of ["control-adapters.js", "form-engine.js"])
    await page.addScriptTag({ path: path.resolve("extension", file) });
}
async function apply(page, value, selector = "#target") {
  return page.evaluate(
    async ({ value, selector }) => {
      const engine = window.__OFFERPILOT_FORM__;
      try {
        const result = await engine.apply(
          engine.snapshot([...document.querySelectorAll(selector)]),
          value,
        );
        return { value: result.value };
      } catch (error) {
        return { error: error.message };
      }
    },
    { value, selector },
  );
}

const families = [
  [
    "ATSX",
    "atsx-select",
    "atsx-select-dropdown",
    "atsx-select-dropdown-menu-item",
  ],
  ["iView", "ivu-select", "ivu-select-dropdown", "ivu-select-item"],
  ["MTD", "mtd-select", "mtd-select-dropdown", "mtd-select-option"],
  [
    "Kuma",
    "kuma-select2",
    "kuma-select2-dropdown",
    "kuma-select2-dropdown-menu-item",
  ],
  ["Feishu", "ud__select", "ud__select__dropdown", "ud__select__list__item"],
  ["Zhilian", "lxselect-box", "lxselect-list", "lxselect-item"],
  ["Brick", "brick-select", "brick-select-dropdown", "brick-select-item"],
  [
    "Phoenix",
    "phoenix-select",
    "common-unmodeled-layer",
    "list-item-container",
  ],
];
for (const [name, wrapper, panel, option] of families) {
  test(`${name} discovers a non-ARIA portal and commits a readonly selection`, async ({
    page,
  }) => {
    await setup(
      page,
      `<div class="${wrapper}"><input id="target" readonly></div><div id="popup" class="${panel}" hidden><div class="${option}">本科</div></div>`,
    );
    await page.evaluate(() => {
      const popup = document.querySelector("#popup");
      const input = document.querySelector("input");
      input.parentElement.onclick = () => {
        popup.hidden = false;
      };
      popup.firstChild.onclick = () => {
        input.value = "本科";
        popup.hidden = true;
      };
    });
    expect(await apply(page, "本科")).toEqual({ value: "本科" });
  });
}

for (const family of ["ant", "el", "ivu"]) {
  test(`${family} multi-select persists two chips while search input is cleared`, async ({
    page,
  }) => {
    const classes =
      family === "ant"
        ? "ant-select ant-select-multiple"
        : family === "el"
          ? "el-select el-select--multiple"
          : "ivu-select ivu-select-multiple";
    await setup(
      page,
      `<div class="${classes}"><input id="target" aria-controls="popup"></div><div id="popup" role="listbox" hidden><div role="option">Java</div><div role="option">Go</div></div>`,
    );
    await page.evaluate(() => {
      const input = document.querySelector("input");
      const popup = document.querySelector("#popup");
      input.parentElement.onclick = () => {
        popup.hidden = false;
      };
      for (const option of popup.children)
        option.onclick = () => {
          const tag = document.createElement("span");
          tag.dataset.selectedLabel = option.textContent;
          tag.textContent = option.textContent;
          input.parentElement.append(tag);
          input.value = "";
          option.setAttribute("aria-selected", "true");
        };
      input.onkeydown = (event) => {
        if (event.key === "Escape") popup.hidden = true;
      };
    });
    expect(await apply(page, "Java,Go")).toEqual({ value: "Java,Go" });
    await expect(page.locator("[data-selected-label]")).toHaveCount(2);
  });
}

test("ATSX tree expands only the requested ancestor before selecting its child", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="atsx-select"><input id="target" readonly aria-controls="popup"></div><div id="popup" class="atsx-select-dropdown" hidden><ul><li role="treeitem"><button class="atsx-tree-switcher">+</button><span class="atsx-tree-title">技术</span><ul hidden><li role="treeitem"><span class="atsx-tree-title">研发</span></li></ul></li></ul></div>',
  );
  await page.evaluate(() => {
    const input = document.querySelector("input");
    const popup = document.querySelector("#popup");
    input.parentElement.onclick = () => {
      popup.hidden = false;
    };
    document.querySelector(".atsx-tree-switcher").onclick = () => {
      popup.querySelector("ul ul").hidden = false;
    };
    popup.querySelector("ul ul .atsx-tree-title").onclick = () => {
      input.value = "技术 / 研发";
      popup.hidden = true;
    };
  });
  expect(await apply(page, "技术 / 研发")).toEqual({ value: "技术 / 研发" });
});

test("Phoenix region confirms only after all explicit levels have been selected", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="phoenix-select"><input id="target" readonly></div><div id="popup" class="common-unmodeled-layer" hidden><div class="area-data-container"></div><button class="phoenix-button--primary">确定</button></div>',
  );
  await page.evaluate(() => {
    const input = document.querySelector("input");
    const popup = document.querySelector("#popup");
    const levels = ["广东省", "深圳市", "南山区"];
    let count = 0;
    function render() {
      popup.firstChild.innerHTML = `<div class="area-item-name"><span class="area-text-label">${levels[count]}</span></div>`;
      popup.firstChild.firstChild.onclick = () => {
        count++;
        if (count < 3) render();
      };
    }
    input.parentElement.onclick = () => {
      popup.hidden = false;
      render();
    };
    popup.querySelector("button").onclick = () => {
      if (count === 3) {
        input.value = levels.join(" / ");
        popup.hidden = true;
      }
    };
  });
  expect(await apply(page, "广东省 / 深圳市 / 南山区")).toEqual({
    value: "广东省 / 深圳市 / 南山区",
  });
});

test("school modal searches, selects a school, then confirms inside that modal", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="ant-select"><input id="target" readonly></div><div class="ant-modal" hidden><div class="school-form"><input id="search"><div id="schools"></div></div><footer><button>确定</button></footer></div>',
  );
  await page.evaluate(() => {
    const input = document.querySelector("#target");
    const modal = document.querySelector(".ant-modal");
    let chosen = "";
    input.parentElement.onclick = () => {
      modal.hidden = false;
    };
    document.querySelector("#search").oninput = (event) => {
      const list = document.querySelector("#schools");
      list.innerHTML = '<div class="school-item">测试大学</div>';
      list.firstChild.onclick = () => {
        chosen = "测试大学";
      };
    };
    modal.querySelector("button").onclick = () => {
      input.value = chosen;
      modal.hidden = true;
    };
  });
  expect(await apply(page, "测试大学")).toEqual({ value: "测试大学" });
});

test("virtual list is scrolled until an offscreen exact option is rendered", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="ant-select"><input id="target" readonly aria-controls="popup"></div><div id="popup" role="listbox" hidden style="height:80px;overflow-y:auto"><div style="height:800px"><div role="option">Other</div></div></div>',
  );
  await page.evaluate(() => {
    const popup = document.querySelector("#popup");
    const input = document.querySelector("input");
    input.parentElement.onclick = () => {
      popup.hidden = false;
    };
    popup.onscroll = () => {
      if (popup.scrollTop > 200) {
        const item = popup.querySelector('[role="option"]');
        item.textContent = "Target";
        item.style.marginTop = `${popup.scrollTop}px`;
        item.onclick = () => {
          input.value = "Target";
          popup.hidden = true;
        };
      }
    };
  });
  expect(await apply(page, "Target")).toEqual({ value: "Target" });
});

test("semantic resolver may select an existing equivalent but never invent an option", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="ant-select"><input id="target" readonly aria-controls="popup"></div><div id="popup" role="listbox" hidden><div role="option">Bachelor</div></div>',
  );
  await page.evaluate(() => {
    const popup = document.querySelector("#popup");
    const input = document.querySelector("input");
    input.parentElement.onclick = () => {
      popup.hidden = false;
    };
    popup.firstChild.onclick = () => {
      input.value = "Bachelor";
      popup.hidden = true;
    };
    window.__OFFERPILOT_FORM__.setOptionMatcher(async () => "Bachelor");
  });
  expect(await apply(page, "本科")).toEqual({ value: "Bachelor" });
});

test("editable date range is atomic and never accepts a partial source", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="el-range-editor el-date-editor--monthrange"><input id="target" placeholder="YYYY-MM"><input placeholder="YYYY-MM"></div>',
  );
  expect(
    await page.evaluate(() => window.__OFFERPILOT_FORM__.candidates().length),
  ).toBe(1);
  expect(await apply(page, "2020-01")).toEqual({
    error: "date_range_required",
  });
  expect(await apply(page, "2024-01 / 2020-01")).toEqual({
    error: "date_range_order",
  });
  expect(await apply(page, "2020-01 / 2024-01")).toEqual({
    value: "2020-01 / 2024-01",
  });
});

test("Fusion readonly range edits popup inputs and confirms both dates together", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="next-range-picker"><input id="target" readonly placeholder="YYYY-MM"><input readonly placeholder="YYYY-MM"></div><div class="next-range-picker-body" hidden><input><input><button>确定</button></div>',
  );
  await page.evaluate(() => {
    const outer = document.querySelector(".next-range-picker");
    const popup = document.querySelector(".next-range-picker-body");
    outer.querySelector("input").onclick = () => {
      popup.hidden = false;
    };
    popup.querySelector("button").onclick = () => {
      [...outer.querySelectorAll("input")].forEach((input, index) => {
        input.value = popup.querySelectorAll("input")[index].value;
      });
      popup.hidden = true;
    };
  });
  expect(await apply(page, "2020-01 / 2024-01")).toEqual({
    value: "2020-01 / 2024-01",
  });
});

test("Feishu editor receives cancellable beforeinput and preserves multiline text", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="bitable-text-editor"><div id="target" class="adit-container" contenteditable="true" style="height:80px"></div></div>',
  );
  await page.evaluate(() => {
    const editor = document.querySelector("#target");
    editor.addEventListener("beforeinput", (event) => {
      event.preventDefault();
      editor.textContent = event.data;
      editor.dataset.modelValue = event.data;
    });
  });
  expect(await apply(page, "第一行\n第二行")).toEqual({
    value: "第一行 第二行",
  });
  await expect(page.locator("#target")).toHaveAttribute(
    "data-model-value",
    "第一行\n第二行",
  );
});

test("a dynamically created unnamed popup can be discovered by its selectable content", async ({
  page,
}) => {
  await setup(page, '<div role="combobox"><input id="target" readonly></div>');
  await page.evaluate(() => {
    const input = document.querySelector("input");
    input.parentElement.onmousedown = () => {
      const popup = document.createElement("div");
      popup.style.position = "absolute";
      popup.innerHTML = '<div data-value="Degree">Degree</div>';
      popup.firstChild.onclick = () => {
        input.value = "Degree";
        popup.remove();
      };
      document.body.append(popup);
    };
  });
  expect(await apply(page, "Degree")).toEqual({ value: "Degree" });
});

test("ambiguous options and disabled ancestors never cause a click", async ({
  page,
}) => {
  await setup(
    page,
    '<div role="combobox"><input id="target" readonly aria-controls="popup"></div><div id="popup" role="listbox" hidden><div role="option">Degree</div><div role="option">Degree</div></div>',
  );
  await page.evaluate(() => {
    document.querySelector("input").parentElement.onclick = () => {
      document.querySelector("#popup").hidden = false;
    };
    window.clicked = false;
    document.querySelector("#popup").onclick = () => {
      window.clicked = true;
    };
  });
  expect(await apply(page, "Degree")).toEqual({ error: "ambiguous_option" });
  expect(await page.evaluate(() => window.clicked)).toBe(false);
});

test("Zhilian hot-category modal expands and confirms a matching city", async ({
  page,
}) => {
  await setup(
    page,
    '<div class="lxselect-box" hidden></div><div class="el-input"><input id="target" readonly></div><div class="s-dialog__wrapper" hidden><div class="s-cascader"><ul><li>热门</li></ul><button>确定</button></div></div>',
  );
  await page.evaluate(() => {
    const input = document.querySelector("input");
    const popup = document.querySelector(".s-dialog__wrapper");
    let chosen = "";
    input.onclick = () => {
      popup.hidden = false;
    };
    popup.querySelector("li").onclick = () => {
      const city = document.createElement("li");
      city.textContent = "深圳市";
      city.onclick = () => {
        chosen = "深圳市";
      };
      popup.querySelector("ul").append(city);
    };
    popup.querySelector("button").onclick = () => {
      input.value = chosen;
      popup.hidden = true;
    };
  });
  expect(await apply(page, "深圳市")).toEqual({ value: "深圳市" });
});

test("ARIA checkbox uses its real click handler and confirms aria-checked", async ({
  page,
}) => {
  await setup(
    page,
    '<div id="target" role="checkbox" tabindex="0" aria-checked="false" data-value="Go">Go</div>',
  );
  await page.evaluate(
    () =>
      (document.querySelector("#target").onclick = (event) =>
        event.target.setAttribute("aria-checked", "true")),
  );
  expect(await apply(page, "Go")).toEqual({ value: "Go" });
});
