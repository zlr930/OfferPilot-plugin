import { parseResumeProfile } from './openai-client.js';

// Run in the trusted options document. A long parse must not depend on a
// service-worker sendResponse channel remaining open across several API calls.
export async function runResumeTask(request, config, onProgress, {
  fetchImpl = fetch,
  parse = parseResumeProfile,
  skillUrl = new URL('./skills/resume-experience-star/SKILL.md', import.meta.url).href,
} = {}) {
  const response = await fetchImpl(skillUrl);
  if (!response.ok) throw new Error('无法读取内置简历处理规则，请重新加载扩展');
  const experienceSkill = await response.text();
  return parse({ ...request, experienceSkill }, config, fetchImpl, onProgress);
}
