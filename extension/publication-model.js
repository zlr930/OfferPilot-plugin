const normalizeName = (name) => String(name || '').normalize('NFKC').toLowerCase().replace(/[\s.,，;；]/g, '');

export function normalizePublication(paper) {
  const result = { ...paper };
  const venue = String(paper.venue || '');
  if (/\b(conference|symposium|workshop|congress)\b|会议|研讨会/i.test(venue)) result.publicationType = '会议论文';
  else if (/\b(journal|transactions|periodical)\b|期刊|学报/i.test(venue)) result.publicationType = '期刊论文';
  else if (/^(期刊|journal)$/i.test(paper.publicationType || '')) result.publicationType = '期刊论文';
  else if (/^(会议|conference)$/i.test(paper.publicationType || '')) result.publicationType = '会议论文';
  else if (/^(论文|paper)$/i.test(paper.publicationType || '')) result.publicationType = '';

  // Match the explicitly extracted applicant signature. Commas inside "Ran, X."
  // are not author separators. An omission AFTER that signature does not hide rank.
  const signature = normalizeName(paper.applicantAuthor);
  const authors = String(paper.authors || '').split(/[;；]/).map(item => item.trim()).filter(Boolean);
  const matches = authors.map((author, index) => normalizeName(author) === signature && signature ? index : -1).filter(index => index >= 0);
  if (matches.length === 1 && authors.length > 1) {
    const position = matches[0];
    const preceding = authors.slice(0, position);
    if (!preceding.some(author => /et\s*al|\.\.\.|…|等/i.test(author))) {
      // Preserve explicitly stated equal-contribution/corresponding-author roles.
      if (!/共同|通讯|co[- ]?first|corresponding/i.test(result.authorOrder || '')) {
        result.authorOrder = ['一作', '二作', '三作', '四作', '五作'][position] || `第${position + 1}作者`;
      }
    }
  }
  return result;
}
