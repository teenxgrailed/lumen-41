- Live tables: Claude can build a table on a page through the Needt MCP
  (`needt_create_table`, `needt_add_table_rows`, `needt_update_table_row`,
  `needt_get_table`) with text, number, dropdown, checkbox, date and link
  columns. The open page shows the header first and each row as it arrives;
  cells are editable in place and the table downloads as .xlsx with its
  dropdowns kept. The same tables are reachable at `/api/live-tables`.
