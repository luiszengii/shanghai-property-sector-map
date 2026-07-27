# Keep the source ledger local until authenticated

The source ledger will first exist only in local development and will not be included in production artifacts. It may contain private research snapshots, excerpts, notes, and not-yet-cleared sources; the public site receives only a deliberately selected public projection. If cross-device access becomes necessary, an authenticated internal service must be designed before any ledger data is deployed.

## Considered Options

- Put the ledger behind an unprotected production route.
- Include the ledger in the public application and hide private fields in the UI.
- Keep the ledger local until an authenticated internal surface exists.

## Consequences

The implementation must maintain a strict data and build boundary: private ledger files and local routes cannot be imported by production code, and public output is generated only from records with a `可公开投射` publication status.
