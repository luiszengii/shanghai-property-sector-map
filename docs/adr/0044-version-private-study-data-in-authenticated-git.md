# Version private study data in authenticated Git

The repository owner needs a new authenticated device to continue map preview,
sector editing, and project research without manually transferring archives.
On 2026-07-30 the owner explicitly authorized the existing Anjuke, Fang,
HFWGSJ, RealtyNavi, project-research, source-ledger, and topology working files
to be stored in private Git for personal study and cross-device continuity.

The data will live in the private repository
`luiszengii/shanghai-property-sector-map-private-data`. The public application
repository records only a `.private-data` submodule pointer. A local setup
command links the private repository's `outputs/` directory into the ignored
public-checkout path.

This decision changes storage, not publication:

- the public repository still does not track private `outputs/` files;
- production and CI do not initialize the private submodule;
- commercial-map snapshots remain private study material and are not
  publishable geometry or evidence of official boundaries;
- the private source ledger still requires field-level review and governed
  public projection;
- cookies, sessions, tokens, passwords, private keys, CAPTCHA material, XHS
  data, PDF caches, MediaCrawler, and large OSM working downloads remain
  excluded.

The two browser-exposed AMap development values are stored as Repository
Variables in the private repository so an authenticated owner can generate
`.env.local`. Production continues to use Actions Secrets in the public
repository. Secrets that must remain unreadable, including SSH keys and login
credentials, are never stored as retrievable Repository Variables.

## Consequences

An authenticated owner can run `git clone --recurse-submodules`, `pnpm
install --frozen-lockfile`, and `pnpm setup:local` before starting development.
Public contributors can clone without submodules and configure their own map
key. Loss of private-repository access must fail closed: public development may
continue, but no private data or values are substituted or fetched from
production.
