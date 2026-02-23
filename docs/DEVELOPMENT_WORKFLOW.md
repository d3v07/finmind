# Development Workflow

## Branching
- Use short-lived branches.
- Prefixes:
  - `feature/<name>` for new features
  - `fix/<name>` for bug fixes
  - `chore/<name>` for tooling/refactor
  - `hotfix/<name>` for urgent production fixes

## Pull Requests
- Keep PRs under ~400 lines changed when possible.
- Include a clear scope and rollout notes.
- Link related issue/task in PR description.
- Require at least one reviewer before merge.

## PR Checklist
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] No secrets added to source control
- [ ] Migration notes included for schema changes

## Hook Setup
Enable repo hooks once git is initialized:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```
