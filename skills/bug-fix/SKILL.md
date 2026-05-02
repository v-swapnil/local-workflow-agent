---
name: bug-fix
description: Diagnose and fix a bug given a failing test, error message, or stack trace.
when_to_use: When the user reports incorrect behaviour, a crash, a stack trace, or a failing test that should pass.
tags: [debugging, fix, regression]
---

# Bug Fix

Follow this loop. Do not skip steps.

1. **Reproduce first.** Use `run_tests` (or `run_shell` with the exact command the user
   gave) to see the failure with your own eyes. Do not guess from the prompt alone.
2. **Locate.** Use `grep` on the error message, function name, or symbol from the stack
   trace. Read the _full_ relevant file with `read_file` before editing.
3. **Understand.** State the root cause in one sentence in your `thought` before you
   propose a patch. If you can't explain why the bug happens, keep investigating —
   don't paper over it.
4. **Minimal patch.** Use `apply_patch` for changes inside existing files. Touch only what
   is necessary to fix the root cause. Do not refactor unrelated code.
5. **Add a regression test.** If a test for this bug doesn't exist, add one that fails
   without your fix and passes with it. (Combine with the `node-testing` skill if the
   project is JS/TS.)
6. **Re-run tests.** Confirm the originally failing case now passes AND no other test
   broke.

## Anti-patterns to avoid

- Catching exceptions to silence them.
- Adding `if (x == null) return` without understanding why `x` is null.
- Disabling/deleting failing tests instead of fixing the code.
- "Fixing" by reformatting or renaming.
