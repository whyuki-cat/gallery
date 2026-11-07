---
name: git-commit-message
description: Inspect the current code changes and produce a ready-to-use English git commit message that follows the repository's conventions. Use when the user asks for a commit message, asks what to commit changes as, or says "生成 commit message", "写提交信息", "帮我写 commit".
---

# Git Commit Message

Inspect the working tree, understand the intent of the change, and output a commit message the user can paste directly. **Do not create the commit** unless the user explicitly asks for it.

## Workflow

### 1. Read the repository state

Run these first (they are safe and read-only):

```bash
git rev-parse --is-inside-work-tree
git status --porcelain=v1 -uall
git branch --show-current
git rev-parse --verify HEAD
git log -n 30 --pretty=format:%s
```

- If this is not a git repository, say so and stop.
- `git status` columns tell you what is staged (`X`) and what is not (`Y`). Remember both.
- `git log` fails when there are no commits yet. That is fine: note it and skip convention detection.
- Note the branch name; it may contain an issue key such as `ABC-123`, but only use it if the match is unambiguous.

### 2. Choose the diff scope

Pick the scope in this order:

1. **User-specified scope** — if the user names paths, a commit, or a range, use exactly that.
2. **Staged changes** — if anything is staged, the message describes the staged changes (`git diff --cached`). Mention that unstaged/untracked files were excluded.
3. **All changes** — otherwise use tracked changes plus untracked files:
   - With a HEAD: `git diff HEAD`
   - Without a HEAD: `git diff --cached` plus `git diff` plus the contents of untracked files.

If the working tree is clean, report that there is nothing to describe and stop.

If the user's wording implies "everything", combine staged + unstaged + untracked and say so. Do not silently include unstaged work when a staged scope was chosen.

### 3. Gather evidence

- `git diff --stat` and `git diff --name-status` for the chosen scope.
- Review the full diff. If it is large or truncated, inspect it per file instead of guessing:
  `git diff --cached -- <path>` or `git diff -- <path>`.
- Read new untracked files directly; they have no diff until staged.
- For binary or renamed files, rely on `--name-status` (`R100`, `A`, `D`, `M`).

Ignore noise when describing intent: lockfiles, build output, formatting-only churn, generated assets. Mention them only when they matter to the change.

Never print secrets, credentials, or `.env` contents in the message or in the conversation.

### 4. Analyze the change

Answer these before writing:

- **What is the primary intent?** New capability, bug fix, refactor, performance, tests, docs, build/CI, or maintenance?
- **What area does it touch?** Derive a short scope from the directories/modules involved (for example `gallery`, `api`, `auth`).
- **Is it one logical change?** If the diff bundles unrelated work, say so and propose a split: group the files and give one message per group. Then still provide a message for the scope actually selected.
- **Is it breaking?** Removed/renamed public APIs, changed config schema, changed defaults, or DB migrations usually are.
- **Why was it needed?** Infer only from the code and context. Do not invent a motivation.

### 5. Match the repository's conventions

**Always write the commit message in English**, regardless of the repository's history or the language of the conversation.

From recent `git log`, determine:

- Whether Conventional Commits (`type(scope): summary`) are used
- Capitalization, imperative mood, emoji usage, punctuation
- Typical subject length, whether bodies and footers are used
- Issue-reference format (`Refs: #123`, `Closes #123`, `ABC-123`, ...)

Follow the existing convention when it is clear. If history is empty or inconsistent, default to Conventional Commits.

### 6. Write the message

Rules:

- Write the subject, body, and footer in English, even when the user writes in another language.
- Subject line: `<type>(<scope>): <summary>` when using Conventional Commits, otherwise a plain imperative summary.
- Keep the subject at or under 72 characters; no trailing period. Only exceed this if the repository's history consistently does.
- Use imperative mood: "add", "fix", "remove", not "added" or "fixes".
- Body (when useful): explain **what changed and why**, wrapped at 72 characters. Do not narrate the diff file by file.
- Footer: `BREAKING CHANGE:` for incompatible changes; issue references only when they are verifiable from the branch, diff, or user context.
- Never fabricate issue numbers, reviewers, co-authors, or test results.
- Do not claim tests pass unless the user or the diff supports it.

### 7. Output

Give one primary recommendation in a fenced code block, ready to copy:

````markdown
## Commit message

```text
feat(gallery): add lazy loading for album covers

Load cover images only when they enter the viewport, reducing the initial
payload for albums with many photos.

Refs: #123
```
````

Then add a very short rationale:

- **Scope:** which changes were inspected (staged / all / user-specified)
- **Why this type and subject:** one or two bullets, not a file-by-file recap

If useful, add a shorter alternative for repositories that use one-line commits. If the diff is ambiguous or bundles unrelated changes, ask before inventing a summary.

## Guardrails

- Read-only by default. Never run `git add`, `git commit`, `git push`, or `git reset` unless the user explicitly asks.
- Always output the commit message in English, never translate it into the conversation's language.
- Do not include secrets, tokens, or credentials from the diff.
- Do not describe files that were not in the chosen scope.
- Do not pad the message with filler such as "update files" or "various improvements".
- When the diff is too large or unclear to summarize confidently, state what was inspected and ask for clarification rather than guessing.
