---
every_minutes: 1440
model: sonnet
---
Check the project's dependencies for new versions and security notices.
Find the dependency files (package.json, requirements.txt, pyproject.toml, go.mod,
Cargo.toml, Gemfile, ...) and read the versions in use. For the main dependencies,
search the web for their latest release and for security advisories (for example
GitHub advisories or the package registry page). You may run commands that only look,
like `npm outdated` or `pip list --outdated`, but never install or update anything.
Report only what matters: a security notice that affects the version in use, or a new
major version worth moving to. One line each: the package, the version in use, the new
version or the notice, and a link.
