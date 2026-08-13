---
name: resume-experience-star
description: Extract and polish resume internships, employment, projects, research, campus work, and open-source contributions into evidence-preserving STAR records. Use when converting a resume into structured profile experiences, repairing keyword-like or overly compressed descriptions, preserving metrics and technical actions, or deduplicating partial mentions of the same experience.
---

# Resume Experience STAR

Transform source evidence into complete application-ready records without inventing facts.

## Workflow

1. Read the complete resume before drafting records.
2. Build an evidence ledger for each distinct experience:
   - entity and role
   - dates and context
   - problem, constraint, or goal
   - personally performed actions
   - technical implementation and architecture
   - scale, latency, throughput, quality, adoption, PR count, or other metrics
   - outcome and verification boundary
   - individual contribution versus team outcome
3. Merge headings, date lines, compact bullets, and detailed bullets that refer to the same entity and overlapping dates.
4. Classify each canonical record as internship, project, research, campus, or award.
5. Draft description and achievements from the ledger.
6. Translate each record through: action -> system capability -> practical value -> result evidence -> individual boundary.
7. Audit each strong claim as: source wording -> proposed wording -> supporting evidence -> individual boundary -> risk or missing fact.
8. Audit every source metric and named technical action before submission.

## STAR Output Contract

- Put situation, task, actions, technical path, and constraints in `description`.
- Put quantified results, shipped artifacts, accepted PRs, benchmarks, validation, and impact in `achievements`.
- Write concrete Chinese prose suitable for a job application. Preserve standard English technical terms.
- Write descriptions and achievements primarily in Chinese. English may appear only for proper nouns, APIs, repositories, commands, metrics, and standard technical terminology.
- Prefer 2-4 dense sentences or semicolon-separated clauses per field when the source supports them.
- Preserve causal order: problem -> action -> implementation -> result.
- Preserve all supported metrics with their units and comparison baseline.
- Preserve source URLs. When PDF link evidence provides multiple URLs, bind each URL only to the project named by its anchor or same-line context; prefer a repository URL as the project link and keep PR/query URLs as supporting evidence rather than the primary link.
- Preserve ownership wording exactly. Do not turn participation into leadership.
- Keep uncertainty explicit. Never repair an unreadable number by guessing.
- Prefer verifiable qualitative outcomes when no reliable number exists.
- Add at most five high-value missing facts or risky claims to top-level `warnings`; do not put placeholders into application-ready descriptions.

## Rejection Conditions

Reject and revise a record when any condition applies:

- It is only a list of technologies or nouns.
- It drops a supported metric, scale, latency, PR count, benchmark, or outcome.
- It replaces concrete actions with vague words such as participated, responsible for, empowered, or optimized.
- It invents business impact, leadership, causality, or a missing number.
- It uses strong ownership words such as led, owned, or designed without evidence of decision, delivery, and result ownership.
- It presents a team outcome as the candidate's individual result.
- It creates separate records for a heading and its detailed bullets.
- It treats a role, technology, association abbreviation, or section label as a company or school.
- It collapses distinct projects into one record.

## Fidelity Check

For each canonical experience, compare the draft to its evidence ledger. The draft must retain every high-value fact that fits the profile schema. When space is limited, remove adjectives and generic context before removing actions, architecture, metrics, or results.

For open-source work, preserve repository, merged/pending status, actual change, validation method, review/CI result, and contribution count. Never describe a pending contribution as adopted.
