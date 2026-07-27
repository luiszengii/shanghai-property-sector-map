# Keep the private ledger separate and generate the public projection

The private source ledger, its revisions, research batches, and snapshots will live under ignored local output storage, while a generated, reviewed public projection is the only source-derived data committed for production. Existing sector source and boundary-evidence files remain readable during a gradual migration, avoiding an unsafe all-at-once rewrite of the established boundary provenance.
