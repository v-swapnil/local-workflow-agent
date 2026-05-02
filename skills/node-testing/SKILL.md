---
name: node-testing
description: Generate and run Vitest tests for Node.js / TypeScript projects.
when_to_use: When the user asks to add tests, increase coverage, verify a function works, or validate changes for a JS/TS project.
tags: [testing, node, vitest, typescript]
---

# Node Testing

When applying this skill:

1. **Detect the runner.** Check `package.json` for `vitest` or `jest` in deps. If neither
   is present, prefer **vitest** and add it to `devDependencies` along with a minimal
   `"test": "vitest run"` script.
2. **Place tests beside the code** as `<name>.test.ts` (or `.test.js` if the project is
   JS). Avoid creating a separate `tests/` folder unless one already exists.
3. **One behaviour per `test()` block.** Cover:
   - happy path
   - empty / null / undefined inputs
   - boundary conditions (0, negative, very long strings)
   - any unicode / locale concerns the function touches
4. **Imports** — use ESM (`import { describe, it, expect } from 'vitest'`). The project
   `package.json` likely has `"type": "module"`; if not, add it when creating new files.
5. **Don't create a vitest config** unless the defaults won't work. Vitest auto-discovers
   `*.test.ts` and supports TS out of the box.
6. **Run tests** as the final step using `run_tests`. If they fail, read the failure log
   carefully and patch the implementation — not the test — unless the test is clearly wrong.

## Minimal vitest setup (only if missing)

```jsonc
{
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2.0.0" },
}
```

After modifying `package.json` you must run `npm install` (or `pnpm install`) before tests.
