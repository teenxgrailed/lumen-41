- Ask now acts through the same operations as the MCP connector. It can create,
  change, move, complete and delete tasks, add and change calendar events,
  create and append to pages, and log habits; each change is recorded and listed
  under the reply with Undo, plus Undo all for the whole reply. Deleting asks
  first. Replies stream with a progress line while a tool runs, and can take
  several steps. New operations `event.create`, `event.update`, `event.delete`,
  `page.create` and `page.append` are available to connectors as well, and
  `task.create` accepts `entry`, `subtasks` and `dependsOnId`. Providers that
  cannot stream tool calls keep the previous single-step behaviour.
