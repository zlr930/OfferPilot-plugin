import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCompleteness,
  compactProfile,
  createEmptyProfile,
  mergeProfile,
  mergeParsedResume,
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

test("mergeProfile coalesces existing partial duplicate records", () => {
  const existing = createEmptyProfile();
  existing.education = [
    {
      school: "中国科学院大学", college: "", major: "计算机技术", degree: "硕士",
      educationType: "", startDate: "2024-09", endDate: "2027-06", gpa: "3.75",
      rank: "", courses: "",
    },
    {
      school: "中国科学院大学", college: "杭州高等研究院", major: "计算机技术", degree: "硕士",
      educationType: "", startDate: "2024-09", endDate: "2027-06", gpa: "",
      rank: "", courses: "并行计算",
    },
  ];
  const merged = mergeProfile(existing, createEmptyProfile());
  assert.equal(merged.education.length, 1);
  assert.equal(merged.education[0].college, "杭州高等研究院");
  assert.equal(merged.education[0].courses, "并行计算");
});

test("mergeParsedResume updates matching experience text without erasing manual blanks", () => {
  const existing = createEmptyProfile();
  existing.internships = [{
    company: "Bybit", department: "风控", role: "Agent", city: "杭州",
    startDate: "2025-12", endDate: "2026-06",
    description: "5 OI Pipeline；12 Tool；40；4。",
    achievements: "356 Spark/Presto。",
  }];
  existing.additionalNotes = "旧解析内容\n\n旧解析内容 2";
  const parsed = createEmptyProfile();
  parsed.internships = [{
    company: "Bybit", department: "", role: "Agent", city: "",
    startDate: "2025-12", endDate: "2026-06",
    description: "从零设计 5 阶段 OI 排查 Pipeline，开发 12 个 Tool 对接 Hive/Presto。",
    achievements: "将 40 分钟人工流程压缩至 4 分钟，并自动编排 356 个计算任务。",
  }];
  parsed.additionalNotes = "本次规范提取内容";
  const merged = mergeParsedResume(existing, parsed);
  assert.equal(merged.internships.length, 1);
  assert.match(merged.internships[0].description, /从零设计/);
  assert.match(merged.internships[0].achievements, /40 分钟人工流程压缩至 4 分钟/);
  assert.equal(merged.internships[0].department, "风控");
  assert.equal(merged.additionalNotes, "本次规范提取内容");
});
