---
description: server, data and API work - handlers, storage, jobs and their errors
---
- Check every input at the edge (types, ranges, missing values) and return clear errors.
- Handle failures of disks, networks and other services; never swallow an error silently.
- Keep data changes safe: no lost writes, migrations that can run twice, nothing half done.
- Keep API shapes backward compatible unless the task says otherwise.
- Add tests for the main path and the error paths, and run them before finishing.
- Say in your answer what changed for callers of the code.
