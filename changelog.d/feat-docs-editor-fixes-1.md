- Document editor, first pass: **Link** in the selection bar (and in the
  context menu and the phone Format sheet) now links the selected text, with
  **Mod+K**; the Link block is only used when nothing is selected. The `/` menu
  opens at the start of any word, not only in an empty line, and says "No
  blocks match" instead of vanishing. Images can be pasted or dropped into a
  page (same upload as the Image block). `/pages/<id>#<blockId>` now scrolls to
  and marks that block. Tables (and special blocks) keep a stable `blockId`
  between saves, and a table is stored as type `TABLE`.
