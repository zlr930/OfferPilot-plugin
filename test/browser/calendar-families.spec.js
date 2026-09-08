import { test, expect } from "@playwright/test";
import path from "node:path";

// Each fixture starts on a different year. Selecting the target date is possible only
// after the driver opens the year view and transitions to the month and day views.
const calendars = [
  {
    name: "Ant legacy",
    trigger: "ant-calendar-picker",
    panel: "ant-calendar-picker-container",
    open: "ant-calendar-year-select",
    year: "ant-calendar-year-panel-cell",
    month: "ant-calendar-month-panel-month",
    day: "ant-calendar-date",
  },
  {
    name: "Ant modern",
    trigger: "ant-picker",
    panel: "ant-picker-dropdown",
    open: "ant-picker-year-btn",
    year: "ant-picker-cell-in-view",
    yearParent: "ant-picker-year-panel",
    month: "ant-picker-cell-in-view",
    monthParent: "ant-picker-month-panel",
    day: "ant-picker-cell-in-view",
    dayParent: "ant-picker-date-panel",
  },
  {
    name: "Element",
    trigger: "el-date-editor",
    panel: "el-picker-panel",
    open: "el-date-picker__header-label",
    year: "cell",
    yearParent: "el-year-table",
    month: "cell",
    monthParent: "el-month-table",
    day: "available",
    dayParent: "el-date-table",
    dayTag: "td",
  },
  {
    name: "iView",
    trigger: "ivu-date-picker",
    panel: "ivu-date-picker-transfer",
    open: "ivu-date-picker-header-label",
    year: "ivu-date-picker-cells-cell",
    yearParent: "ivu-date-picker-cells-year",
    month: "ivu-date-picker-cells-cell",
    monthParent: "ivu-date-picker-cells-month",
    day: "ivu-date-picker-cells-cell",
    dayParent: "ivu-date-picker-cells",
  },
  {
    name: "MTD",
    trigger: "mtd-date-picker",
    panel: "mtd-datepicker-pop",
    open: "mtd-month-calendar-year-btn",
    year: "mtd-year-panel-list-data",
    month: "mtd-month-panel-list-data",
    day: "mtd-day-panel-list-data",
  },
  {
    name: "Kuma",
    trigger: "kuma-calendar-picker-input",
    panel: "kuma-calendar-picker",
    open: "kuma-calendar-year-select",
    year: "kuma-calendar-year-panel-cell",
    month: "kuma-calendar-month-panel-cell",
    day: "kuma-calendar-date",
  },
  {
    name: "Phoenix",
    trigger: "phoenix-date-picker",
    panel: "common-unmodeled-layer",
    open: "phoenix-calendar-year-select",
    year: "phoenix-calendar-year-panel-year",
    month: "phoenix-calendar-month-panel-month",
    day: "phoenix-calendar-date",
  },
  {
    name: "Moka",
    trigger: "sd-DatePicker",
    panel: "sd-panal-menu-wrapper-1",
    open: "sd-basic-selector-year-1",
    year: "sd-basic-year-item-1",
    month: "sd-basic-year-item-1",
    day: "sd-basic-date-item-1",
  },
  {
    name: "Feishu",
    trigger: "ud__picker-dateInput",
    panel: "ud__picker-dropdown",
    open: "ud__picker-panel-header-btn",
    year: "ud__picker__cell-interactive-area",
    month: "ud__picker__cell-interactive-area",
    day: "ud__picker__cell-interactive-area",
  },
  {
    name: "ATSX",
    trigger: "atsx-date-picker",
    panel: "atsx-date-picker-dropdown",
    open: "atsx-date-picker-panel-header-operator",
    year: "atsx-date-picker-panel-body-cell-content",
    yearParent: "atsx-date-picker-panel-body-year",
    month: "atsx-date-picker-panel-body-cell-content",
    day: "atsx-date-picker-panel-body-date-cell-inner-content",
  },
];
for (const config of calendars) {
  test(`${config.name} transitions year → month → day and rejects disabled duplicate dates`, async ({
    page,
  }) => {
    await page.setContent(
      `<div class="${config.trigger}"><input id="date" placeholder="YYYY-MM-DD" readonly></div><div id="panel" class="${config.panel}" hidden></div>`,
    );
    await page.evaluate((c) => {
      const input = document.querySelector("input");
      const panel = document.querySelector("#panel");
      const cell = (parent, className, text, action, tag = "button") => {
        panel.replaceChildren();
        const container = document.createElement("div");
        container.className = parent || "view";
        const node = document.createElement(tag);
        node.className = className;
        node.textContent = text;
        node.onclick = action;
        container.append(node);
        panel.append(container);
      };
      function day() {
        cell(
          c.dayParent,
          c.day,
          "15",
          () => {
            input.value = "2020-03-15";
            panel.hidden = true;
          },
          c.dayTag,
        );
        const disabled = document.createElement("button");
        disabled.className = c.day;
        disabled.textContent = "15";
        disabled.disabled = true;
        panel.firstChild.append(disabled);
      }
      function month() {
        cell(c.monthParent, c.month, "三月", day);
      }
      function year() {
        cell(c.yearParent, c.year, "2020", month);
      }
      input.onclick = () => {
        panel.hidden = false;
        cell("", c.open, "2026年", year);
        panel.querySelector("button").dataset.cy = "year";
      };
    }, config);
    for (const file of ["control-adapters.js", "form-engine.js"])
      await page.addScriptTag({ path: path.resolve("extension", file) });
    const result = await page.evaluate(async () => {
      const engine = window.__OFFERPILOT_FORM__;
      try {
        return (
          await engine.apply(
            engine.snapshot([document.querySelector("input")]),
            "2020-03-15",
          )
        ).value;
      } catch (error) {
        return error.message;
      }
    });
    expect(result).toBe("2020-03-15");
  });
}

test("Brick month-only calendar selects a year from its sidebar then a month", async ({
  page,
}) => {
  await page.setContent(
    '<div class="brick-date-picker"><input readonly placeholder="YYYY-MM"></div><div class="brick-date-picker-content-wrapper" hidden><button class="brick-aside-item">2020</button><div id="months"></div></div>',
  );
  await page.evaluate(() => {
    const input = document.querySelector("input");
    const popup = document.querySelector(".brick-date-picker-content-wrapper");
    input.onclick = () => {
      popup.hidden = false;
    };
    popup.querySelector("button").onclick = () => {
      document.querySelector("#months").innerHTML =
        '<button class="brick-content-item">3月</button>';
      document.querySelector("#months button").onclick = () => {
        input.value = "2020-03";
        popup.hidden = true;
      };
    };
  });
  for (const file of ["control-adapters.js", "form-engine.js"])
    await page.addScriptTag({ path: path.resolve("extension", file) });
  expect(
    await page.evaluate(async () => {
      const engine = window.__OFFERPILOT_FORM__;
      try {
        return (
          await engine.apply(
            engine.snapshot([document.querySelector("input")]),
            "2020-03",
          )
        ).value;
      } catch (error) {
        return error.message;
      }
    }),
  ).toBe("2020-03");
});

test("ATSX non-input month label uses two independent year and month columns", async ({
  page,
}) => {
  await page.setContent(
    '<div class="atsx-date-picker-period-month"><span id="target" class="atsx-date-picker-period-month-label" style="display:block;height:30px;width:100px"></span></div><div class="atsx-date-picker-dropdown" hidden><ul class="atsx-date-picker-period-month-panel-list"><li class="atsx-date-picker-period-month-panel-list-item">2020</li></ul><ul class="atsx-date-picker-period-month-panel-list"><li class="atsx-date-picker-period-month-panel-list-item">三月</li></ul></div>',
  );
  await page.evaluate(() => {
    const target = document.querySelector("#target");
    const popup = document.querySelector(".atsx-date-picker-dropdown");
    let year;
    target.onclick = () => {
      popup.hidden = false;
    };
    popup.querySelectorAll("li")[0].onclick = () => {
      year = "2020";
    };
    popup.querySelectorAll("li")[1].onclick = () => {
      target.textContent = `${year}-03`;
      popup.hidden = true;
    };
  });
  for (const file of ["control-adapters.js", "form-engine.js"])
    await page.addScriptTag({ path: path.resolve("extension", file) });
  expect(
    await page.evaluate(async () => {
      const engine = window.__OFFERPILOT_FORM__;
      try {
        return (
          await engine.apply(
            engine.snapshot([document.querySelector("#target")]),
            "2020-03",
          )
        ).value;
      } catch (error) {
        return error.message;
      }
    }),
  ).toBe("2020-03");
});

test("MD month range navigates two independent year headers and commits both months", async ({
  page,
}) => {
  await page.setContent(
    '<div class="md-date-editor--monthrange"><input id="target" readonly><input readonly></div><div class="md-picker-panel md-date-range-picker" hidden><div class="md-date-range-picker__content is-left"></div><div class="md-date-range-picker__content is-right"></div></div>',
  );
  await page.evaluate(() => {
    const inputs = document.querySelectorAll("input");
    const popup = document.querySelector(".md-picker-panel");
    inputs[0].onclick = () => {
      popup.hidden = false;
    };
    popup
      .querySelectorAll(".md-date-range-picker__content")
      .forEach((half, index) => {
        let year = 2024;
        function render() {
          half.innerHTML = `<div class="md-date-range-picker__header">${year}年</div><button class="d-arrow-left">Back</button><div class="md-month-table"><button class="cell">3月</button></div>`;
          half.querySelector(".d-arrow-left").onclick = () => {
            year--;
            render();
          };
          half.querySelector(".cell").onclick = () => {
            inputs[index].value = `${year}-03`;
            if (index === 1) popup.hidden = true;
          };
        }
        render();
      });
  });
  for (const file of ["control-adapters.js", "form-engine.js"])
    await page.addScriptTag({ path: path.resolve("extension", file) });
  expect(
    await page.evaluate(async () => {
      const engine = window.__OFFERPILOT_FORM__;
      try {
        return (
          await engine.apply(
            engine.snapshot([document.querySelector("#target")]),
            "2020-03 / 2023-03",
          )
        ).value;
      } catch (error) {
        return error.message;
      }
    }),
  ).toBe("2020-03 / 2023-03");
});
