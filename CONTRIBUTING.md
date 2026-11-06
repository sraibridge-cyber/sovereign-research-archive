# Contributing

This project is built for permanence. Every contribution should reflect that.

## Principles

1. **No duct tape** — every solution should be maintainable years from now
2. **No shortcuts on truth** — data integrity and provenance come before convenience
3. **Sovereign first** — never introduce a runtime dependency on a cloud service
4. **No internet permissions** — the Android app must never phone home
5. **Test the ingest path** — the corpus pipeline is the gateway; if it breaks, nothing works

## Getting Started

- Fork the repo
- Create a feature branch from `main`
- Make your changes
- Run the ingestion test: `cd tools && python -m pytest`
- Open a PR with a clear description of what changed and why

## Code Style

- Kotlin: Follow Android Kotlin Style Guide
- Python: Black formatter, line length 100
- XML: 4-space indentation
- Markdown: Wrap at 80 characters for readability

## Commit Messages

Use conventional commits:
- `feat:` new capability
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring
- `perf:` performance improvement
- `test:` adding or fixing tests
- `chore:` build config, dependencies

## Questions

Open an issue. This is a public project.
