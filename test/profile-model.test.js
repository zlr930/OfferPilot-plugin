import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCompleteness,
  compactProfile,
  createEmptyProfile,
  mergeProfile,
  normalizeProfile,
} from "../extension/profile-model.js";

test("normalizeProfile keeps known fields and drops unknown fields", () => {
  const profile = normalizeProfile({
    basic: { fullName: "张三", unknown: "discard me" },
    education: [{ id: "education-1", school: "示例大学", extra: "drop" }],
  });
  assert.equal(profile.basic.fullName, "张三");
  assert.equal(profile.basic.unknown, undefined);
  assert.equal(profile.education[0].id, "education-1");
  assert.equal(profile.education[0].extra, undefined);
});

test("compactProfile removes blanks and editor IDs", () => {
  const profile = createEmptyProfile();
  profile.basic.fullName = "  张三  ";
  profile.education.push({ id: "local-id", school: "示例大学" });
  const compact = compactProfile(profile);
  assert.deepEqual(compact.basic, { fullName: "张三" });
  assert.deepEqual(compact.education, [{ school: "示例大学" }]);
});

test("calculateCompleteness scores core facts", () => {
  const profile = createEmptyProfile();
  profile.basic.fullName = "张三";
  profile.basic.phone = "13800000000";
  profile.basic.email = "zhangsan@example.com";
  const result = calculateCompleteness(profile);
  assert.deepEqual(result, { completed: 3, total: 11, percent: 27 });
});

test("mergeProfile fills blanks without overwriting existing values", () => {
  const existing = createEmptyProfile();
  existing.basic.fullName = "已有姓名";
  existing.education.push({
    id: "existing-education",
    school: "示例大学",
    major: "计算机科学",
    degree: "本科",
    startDate: "2020-09",
  });
  const imported = createEmptyProfile();
  imported.basic.fullName = "解析姓名";
  imported.basic.email = "candidate@example.com";
  imported.education.push({
    school: "示例大学",
    college: "软件学院",
    major: "计算机科学",
    degree: "本科",
    endDate: "2024-06",
  });
  const merged = mergeProfile(existing, imported);
  assert.equal(merged.basic.fullName, "已有姓名");
  assert.equal(merged.basic.email, "candidate@example.com");
  assert.equal(merged.education.length, 1);
  assert.equal(merged.education[0].college, "软件学院");
});
