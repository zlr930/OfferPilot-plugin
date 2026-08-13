export const PROFILE_SCHEMA_VERSION = 1;

const EMPTY_PROFILE = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  basic: {
    fullName: "",
    preferredName: "",
    gender: "",
    birthDate: "",
    phone: "",
    email: "",
    wechat: "",
    currentCity: "",
    hometown: "",
    address: "",
    nationality: "",
    politicalStatus: "",
    idType: "",
    idNumber: "",
  },
  preferences: {
    targetRoles: "",
    targetCities: "",
    employmentType: "",
    earliestStartDate: "",
    expectedSalary: "",
    willingToRelocate: "",
  },
  education: [],
  internships: [],
  projects: [],
  campus: [],
  awards: [],
  skills: {
    technical: "",
    languages: "",
    certificates: "",
  },
  selfEvaluation: "",
  additionalNotes: "",
};

const RECORD_DEFAULTS = {
  education: {
    school: "",
    college: "",
    major: "",
    degree: "",
    educationType: "",
    startDate: "",
    endDate: "",
    gpa: "",
    rank: "",
    courses: "",
  },
  internships: {
    company: "",
    department: "",
    role: "",
    city: "",
    startDate: "",
    endDate: "",
    description: "",
    achievements: "",
  },
  projects: {
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    link: "",
    stack: "",
    description: "",
    achievements: "",
  },
  campus: {
    organization: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "",
    achievements: "",
  },
  awards: {
    name: "",
    level: "",
    issuer: "",
    date: "",
    description: "",
  },
};

const RECORD_IDENTITIES = {
  education: ["school", "major", "degree"],
  internships: ["company", "role"],
  projects: ["name", "role"],
  campus: ["organization", "role"],
  awards: ["name", "issuer"],
};

export function createEmptyProfile() {
  return structuredClone(EMPTY_PROFILE);
}

export function createEmptyRecord(section) {
  const defaults = RECORD_DEFAULTS[section];
  if (!defaults) throw new Error(`Unknown profile section: ${section}`);
  return { id: crypto.randomUUID(), ...structuredClone(defaults) };
}

export function normalizeProfile(input) {
  const profile = createEmptyProfile();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return profile;
  }

  copyStrings(profile.basic, input.basic);
  copyStrings(profile.preferences, input.preferences);
  copyStrings(profile.skills, input.skills);
  profile.selfEvaluation = toString(input.selfEvaluation);
  profile.additionalNotes = toString(input.additionalNotes);

  for (const section of Object.keys(RECORD_DEFAULTS)) {
    if (!Array.isArray(input[section])) continue;
    profile[section] = input[section].slice(0, 50).map((record) => {
      const normalized = createEmptyRecord(section);
      copyStrings(normalized, record);
      normalized.id = toString(record?.id) || normalized.id;
      return normalized;
    });
  }

  return profile;
}

export function compactProfile(profile) {
  return compactValue(normalizeProfile(profile));
}

export function mergeProfile(existing, imported) {
  return mergeProfiles(existing, imported, false);
}

export function mergeParsedResume(existing, imported) {
  return mergeProfiles(existing, imported, true);
}

function mergeProfiles(existing, imported, replaceParsedFields) {
  const target = normalizeProfile(existing);
  const source = normalizeProfile(imported);

  for (const section of Object.keys(RECORD_DEFAULTS)) {
    target[section] = coalesceRecords(section, target[section]);
    source[section] = coalesceRecords(section, source[section]);
  }

  fillEmptyStrings(target.basic, source.basic);
  fillEmptyStrings(target.preferences, source.preferences);
  if (replaceParsedFields) replaceNonEmptyStrings(target.skills, source.skills);
  else fillEmptyStrings(target.skills, source.skills);
  if (!target.selfEvaluation.trim()) {
    target.selfEvaluation = source.selfEvaluation;
  }
  if (replaceParsedFields && source.additionalNotes.trim()) {
    target.additionalNotes = source.additionalNotes;
  } else if (!target.additionalNotes.trim()) {
    target.additionalNotes = source.additionalNotes;
  } else if (
    source.additionalNotes.trim() &&
    !target.additionalNotes.includes(source.additionalNotes.trim())
  ) {
    target.additionalNotes = `${target.additionalNotes.trim()}\n\n${source.additionalNotes.trim()}`;
  }

  for (const section of Object.keys(RECORD_DEFAULTS)) {
    for (const sourceRecord of source[section]) {
      if (!hasAnyRecordValue(sourceRecord)) continue;
      const match = target[section].find((record) =>
        recordsMatch(section, record, sourceRecord),
      );
      if (match) {
        if (replaceParsedFields) replaceNonEmptyStrings(match, sourceRecord);
        else fillEmptyStrings(match, sourceRecord);
      } else {
        const record = createEmptyRecord(section);
        fillEmptyStrings(record, sourceRecord);
        target[section].push(record);
      }
    }
  }

  return target;
}

function replaceNonEmptyStrings(target, source) {
  if (!source || typeof source !== "object") return;
  for (const key of Object.keys(target)) {
    if (key === "id" || typeof target[key] !== "string") continue;
    const value = toString(source[key]).trim();
    if (value) target[key] = value;
  }
}

function coalesceRecords(section, records) {
  const result = [];
  for (const record of records) {
    if (!hasAnyRecordValue(record)) continue;
    const match = result.find((candidate) => recordsMatch(section, candidate, record));
    if (match) fillEmptyStrings(match, record);
    else result.push(record);
  }
  return result;
}

export function calculateCompleteness(profile) {
  const normalized = normalizeProfile(profile);
  const checks = [
    normalized.basic.fullName,
    normalized.basic.phone,
    normalized.basic.email,
    normalized.basic.currentCity,
    normalized.preferences.targetRoles,
    normalized.preferences.targetCities,
    hasRecord(normalized.education, ["school", "major", "degree"]),
    hasRecord(normalized.internships, ["company", "role", "description"]),
    hasRecord(normalized.projects, ["name", "role", "description"]),
    normalized.skills.technical || normalized.skills.languages,
    normalized.selfEvaluation,
  ];
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
  };
}

function copyStrings(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return;
  for (const key of Object.keys(target)) {
    if (key === "id") continue;
    target[key] = toString(source[key]);
  }
}

function fillEmptyStrings(target, source) {
  if (!source || typeof source !== "object") return;
  for (const key of Object.keys(target)) {
    if (key === "id" || typeof target[key] !== "string") continue;
    if (!target[key].trim()) target[key] = toString(source[key]);
  }
}

function hasAnyRecordValue(record) {
  return Object.entries(record).some(
    ([key, value]) => key !== "id" && typeof value === "string" && value.trim(),
  );
}

function recordsMatch(section, left, right) {
  const keys = RECORD_IDENTITIES[section];
  const comparable = keys.filter(
    (key) => normalizeIdentity(left[key]) && normalizeIdentity(right[key]),
  );
  if (!comparable.length) return false;
  const identityMatches = comparable.filter((key) => identitiesMatch(left[key], right[key]));
  if (!identityMatches.length) return false;
  const dates = ["startDate", "endDate"].filter(
    (key) => normalizeIdentity(left[key]) && normalizeIdentity(right[key]),
  );
  return !dates.length || dates.some((key) => normalizeIdentity(left[key]) === normalizeIdentity(right[key]));
}

function identitiesMatch(left, right) {
  const normalizedLeft = normalizeIdentity(left);
  const normalizedRight = normalizeIdentity(right);
  return (
    normalizedLeft === normalizedRight ||
    (Math.min(normalizedLeft.length, normalizedRight.length) >= 6 &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)))
  );
}

function normalizeIdentity(value) {
  return toString(value)
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s·()（）,，.。\-—_]/g, "");
}

function toString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function hasRecord(records, keys) {
  return records.some((record) => keys.every((key) => record[key].trim()));
}

function compactValue(value) {
  if (Array.isArray(value)) {
    return value.map(compactValue).filter((item) => {
      if (item && typeof item === "object") return Object.keys(item).length;
      return item !== "";
    });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id")
        .map(([key, child]) => [key, compactValue(child)])
        .filter(([, child]) => {
          if (Array.isArray(child)) return child.length;
          if (child && typeof child === "object") return Object.keys(child).length;
          return child !== "";
        }),
    );
  }
  return typeof value === "string" ? value.trim() : value;
}
