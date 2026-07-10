# Mainnet Release Manifest

`rehearse:mainnet-fork` emits a deterministic JSON release plan for a pinned Robinhood mainnet block and committed source tree. It is an evidence artifact, not a deployment command or authorization to broadcast.

## Recorded Evidence

The schema records:

- Robinhood mainnet chain ID, pinned block number, block hash, and block timestamp.
- Git commit and tree hashes.
- Solidity compiler versions and canonical compiler-input SHA-256 hashes.
- Artifact, creation-bytecode, and runtime-bytecode SHA-256 hashes for the 15 production contracts plus the collector-only `CommitRevealRandomnessProvider`.
- Expected mainnet deployer, protocol admin, operations signer, guardian, constructor treasuries, coordinator address, coordinator code hash, and maximum request fee.
- Fork-local production contract addresses plus explicit local-only commit/reveal collector evidence.
- Per-stage and total transaction count, contract creations, gas used, and calldata bytes.
- A deployment-and-role-wiring gas budget with 30% gas-unit contingency and 2x pinned-block base-fee contingency.
- Exact production coordinator, all nine pause states, multisig role assignments and code hashes, treasury wiring, deployer revocation, and separate collector-rehearsal evidence.
- Any development override that prevents production-candidate eligibility.
- A SHA-256 integrity hash over the canonical manifest body.

The pinned fork deploys `CoordinatorRandomnessProvider` through the exact production branch and measures that deployment and handoff. After the fork is stopped, a second disposable localhost environment uses the demo commit/reveal provider solely to execute seed and collector gameplay. The measured deployment gas is therefore based on the production contract set and role wiring.

The validator requires pinned-coordinator randomness, paused launch state, verified role handoff, `executionStatus: "verified-by-production-fork"`, the exact deploy/smoke stage sequence, and a passed separate collector rehearsal. A public-RPC development override forces `development-only` eligibility.

## Deliberately Excluded

The schema rejects secret-bearing field names and URL values. It does not record:

- RPC URLs or provider hostnames.
- Authentication headers or API credentials.
- Private keys, mnemonics, passwords, or environment snapshots.
- Raw transaction calldata or transaction hashes.
- A mainnet signer or signed transaction.

## Validation

Validate a generated file before review:

```bash
pnpm --filter @gacha/contracts validate:mainnet-manifest -- /absolute/path/robinhood-mainnet-plan.json
```

Validation fails if the target is not Robinhood mainnet, the fork is not chain `31337`, the source or artifact hashes are malformed, the exact artifact/deployment sets are incomplete, fewer than 15 contract creations were observed, addresses are invalid or duplicated, sensitive fields are present, development-override state is inconsistent, gas values are malformed, or the canonical integrity hash does not match.

A `development-only` manifest cannot satisfy the release gate. Reviewers must independently compare a production-candidate manifest's commit, compiler inputs, artifacts, operational inputs, coordinator pin, paused state, and gas budget with the approved release record. Private canary activation remains a later multisig operation.
