/* Project lookup + duration label (09.10.26). What is left of the Columns
 * view and the Rich block, which no live screen renders any more (their full
 * sources are in _archive/port-prune/): cvProject resolves a task's project
 * (colour + icon) from a projectId or a name, with the neutral for "no
 * project"; cvDur formats minutes. Port both into the data layer
 * (src/data/projects.ts, src/lib/format.ts). RB_NEUTRAL is also read by
 * task.jsx (tkNeutral). */

/* No project is a state, and it has a colour of its own: an opaque grey mixed
   against the surface, never a level of the text ladder — a ladder token is an
   alpha, and mixing one with transparent multiplies the two until the edge
   disappears. */
const RB_NEUTRAL = { name: null, icon: "list-checks",
  color: "color-mix(in oklab, var(--foreground) 42%, var(--surface-raised))" };

/* A view of the one registry in Data.js, keyed the way blocks refer to it. */
const RB_PROJECTS = {};
window.NEEDT.projects.forEach((p) => { RB_PROJECTS[p.id] = p; });

/* A project owns a colour and an icon — the same map the grid block uses,
   resolved from a projectId or a name by the one registry in Data.js. */
function cvProject(ref) {
  const n = ref && window.NEEDT ? window.NEEDT.project(ref) : null;
  const p = n ? RB_PROJECTS[n.id] : null;
  return p || RB_NEUTRAL;
}

function cvDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!min) return "0 min";
  return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min";
}

Object.assign(window, { cvProject, cvDur, RB_NEUTRAL });
