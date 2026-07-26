# Pre-production promotion branch

The repository uses `pre-prod` as its single integration and online-acceptance branch. It deploys to an independently running, password-protected pre-production site on the existing Seoul instance; production can only be reached by a `pre-prod` to `main` pull request after manual acceptance. This keeps the existing single-server cost profile while making release promotion explicit and auditable.
