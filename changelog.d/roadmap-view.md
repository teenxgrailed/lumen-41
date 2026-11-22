- Projects have a Roadmap: a project's tasks as a metro map, with what is done,
  what you are on now, what comes next and what is waiting on something. A
  station opens its task. Agents has a Roadmap tab that also shows which agent
  works on each milestone.
- The roadmap can be read through the API: `GET /api/projects/<id>/roadmap`
  returns the same map (stations, their state, the waits between them and the
  agent on each milestone; `?hub=0` leaves the agents out).
