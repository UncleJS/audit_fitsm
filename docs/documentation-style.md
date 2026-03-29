# Documentation Style

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Docs](https://img.shields.io/badge/docs-standardized-blue)

Standard rules for project documentation pages.

## Table of Contents

- [Overview](#overview)
- [Details](#details)
- [References](#references)
- [License footer](#license-footer)

## Overview

Use this standard for all `.md` pages in this repository (root docs and `docs/` pages):

1. Add at least one shields.io badge at the top.
2. Include a **Table of Contents** section near the top.
3. Add a **[Go to TOC](#table-of-contents)** link at the end of each major section.
4. End with a **License footer** section.
5. Keep language direct, concise, and operational.

[Go to TOC](#table-of-contents)

## Details

### Required page structure

- `# Title`
- badges
- short purpose sentence
- `## Table of Contents`
- content sections
- `## License footer`

### Writing and formatting rules

- Use sentence case headings.
- Prefer short paragraphs and bullet lists.
- Use code fences for commands.
- Use backticks for paths, env vars, and endpoint names.
- Prefer active voice and imperative instructions for runbooks.

### Badge policy

- Minimum: 1 badge.
- Recommended set:
  - license badge
  - topic badge (e.g., API, docs, deployment)
  - environment/runtime badge when relevant

### TOC and section footer policy

- Every top-level doc section should end with:

```markdown
[Go to TOC](#table-of-contents)
```

- Keep anchor names consistent with section headings.

### Link and path rules

- Prefer relative links inside the repo.
- External links should be stable canonical URLs.
- File paths should be repo-root relative where possible.

### Pre-merge doc checklist

- [ ] Badges present
- [ ] TOC present and accurate
- [ ] Go-to-TOC links at section ends
- [ ] License footer present
- [ ] Commands tested or clearly marked example-only
- [ ] No secrets or credential values in examples

[Go to TOC](#table-of-contents)

## References

- Template source: `docs/TEMPLATE.md`
- Docs index: `docs/README.md`
- Generator: `scripts/new-doc.sh <relative-path.md> <title>`
- License text: `LICENSE.md`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

[Go to TOC](#table-of-contents)
