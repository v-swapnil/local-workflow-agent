# Notes / Notebooks — Product Requirements Document

> Status: Draft v1 · Owner: TBD · Last updated: 2026-07-12

## 1. Summary

A dedicated **Notes** page for storing and editing markdown documents (personal notes,
prompt snippets, scratchpads). Documents live in **collections** and carry **tags**.
Editing happens in a Lexical-based editor with two switchable modes: a **WYSIWYG** rich-text
mode and a raw **Markdown** mode. Notes are **global** (app-wide, not tied to a workspace).

## 2. Goals

- Give the user a first-class place to keep reusable markdown (notes, prompts, etc.).
- Organize documents into collections and label them with tags.
- Provide a comfortable authoring experience (WYSIWYG) plus direct markdown control.
- Match the existing app's design system, theming, and interaction patterns.

## 3. Non-Goals (v1)

Explicitly out of scope for the first version:

- ❌ Export / sharing / publishing
- ❌ Images and file attachments
- ❌ Markdown tables
- ❌ Version history / revisions
- ❌ AI / session / agent integration (inserting a note into a run, etc.)
- ❌ Full-text search index
- ❌ Nested collections (folders within folders)
- ❌ Multi-collection membership (a note belongs to exactly one collection)
- ❌ Moving a note between collections after creation
- ❌ Renaming collections
- ❌ Collaboration / sync

These are candidate follow-ups, not v1 commitments.

## 4. Users & Use Cases

- **Prompt library**: keep reusable prompts grouped in a collection, copy from them.
- **Scratch notes**: jot down markdown notes while working.
- **Reference docs**: store personal cheatsheets and snippets.

## 5. Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Single SQLite table, content = markdown string | Matches every other feature; simplest |
| Scope | Global / app-wide (no `workspace_id`) | Personal library usable everywhere |
| Organization | Collections (containers) + tags (labels) | Requested; folders + cross-cutting labels |
| Collection cardinality | One collection per note | Simple folder-like mental model |
| Collection nesting | Single-level (flat) | Avoid tree UI complexity in v1 |
| Default collections | `User` and `System`, both non-removable, both fully editable | Always-present buckets |
| Extra collections | User can **create** and **delete** (no rename) | Minimal management surface |
| Delete collection | Deletes the collection **and its notes** (with confirm) | Predictable; no orphan handling |
| Move note between collections | Not supported in v1 | Collection fixed at creation |
| Editor | Lexical for both modes | Requested; single dependency family |
| Modes | WYSIWYG (rich text) ⇄ Markdown (raw source) | Toggle in editor header |
| Markdown mode impl | Lexical **plain-text** editor showing raw markdown | Uses Lexical; minimal deps |
| Source of truth | Markdown string | Both modes serialize to/from it |
| Toggle behavior | Round-trip through markdown on every switch | Single source of truth; no divergence |
| Markdown features | Lexical default `TRANSFORMERS` | Headings, bold/italic/inline-code, lists, quote, code block, link |
| WYSIWYG shortcuts | `MarkdownShortcutPlugin` enabled | Typing `# `, `- `, `**x**` works |
| Save model | Debounced autosave (~600ms) + "saved" indicator | Notes-app feel; no lost work |
| Title | Separate editable title field | Explicit and simple |
| Tags | Editable chips in editor header | Add/remove per note |
| Theming | Light + dark via existing theme system | Consistency |

## 6. Data Model (conceptual)

```
Collection
  id            string
  name          string
  kind          'default' | 'user'      // 'default' = User/System, non-deletable
  createdAt     number (epoch ms)
  updatedAt     number (epoch ms)

Note
  id            string
  collectionId  string  -> Collection.id
  title         string
  content       string  // markdown, canonical source of truth
  tags          string[] // stored as JSON array
  createdAt     number (epoch ms)
  updatedAt     number (epoch ms)
```

Seed on first run: two collections `User` and `System` (`kind = 'default'`), both empty.

## 7. UX Overview

**Page**: new top-level "Notes" entry in the left app nav; route `/notes`. Wrapped in the
standard `PageShell` header. Master-detail layout: a collections/notes tree on the left,
the editor on the right.

**Left panel — grouped tree**
- Collections render as **collapsible headers**, notes nested beneath each.
- Each collection header has a **"+ note"** action that creates an *Untitled* note **in that
  collection** and selects it (title focused).
- A top-level **"+ New collection"** action creates a new user collection.
- Notes within a collection are sorted by **last updated (desc)**.
- Each note row shows its title; a **delete** action appears on hover.
- Deleting a **note** → `AlertDialog` confirm.
- Deleting a **user collection** → `AlertDialog` warning that its notes will be deleted.
- `User` / `System` collections cannot be deleted (no delete affordance).
- No search box in v1.

**Right panel — editor**
- Editable **title** field at top.
- **Mode toggle** (`ToggleGroup`: "Editor" / "Markdown") top-right.
- Editable **tag chips** (add/remove) in the header.
- Body: Lexical editor rendering the selected mode.
- Subtle **"saved"** indicator reflecting autosave state.
- Empty state when no note is selected.

## 8. Acceptance Criteria

1. A "Notes" nav item routes to `/notes`.
2. On first run, `User` and `System` collections exist and are non-deletable.
3. User can create a new user collection and delete it (deleting removes its notes after confirm).
4. User can create a note inside a specific collection; it appears immediately, selected, title focused.
5. User can edit a note's title, body, and tags; changes autosave (~600ms) with a visible saved indicator.
6. User can toggle between WYSIWYG and Markdown modes; content round-trips through markdown with no data loss for supported features.
7. Supported markdown: headings, bold, italic, inline code, code block, blockquote, ordered/unordered lists, links.
8. Typing markdown shortcuts in WYSIWYG (`# `, `- `, `1. `, `> `, `` ` ``, `**`) produces the corresponding formatting.
9. User can delete a note (with confirm).
10. Everything renders correctly in both light and dark themes.

## 9. Future Enhancements (post-v1)

- Search / filter box and tag-based filtering.
- Move notes between collections; rename collections; nested collections.
- Markdown tables, images/attachments, export.
- Syntax highlighting in Markdown mode (Lexical `CodeNode`).
- Version history; AI/session integration (use a note as a prompt).
