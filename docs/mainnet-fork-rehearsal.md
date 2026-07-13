# Robinhood Mainnet-Fork Rehearsal

This path rehearses the full local protocol journey against a pinned snapshot of Robinhood mainnet. It requires no testnet ETH and never sends a transaction to Robinhood mainnet.

The rehearsal is evidence of deployment compatibility and end-to-end behavior. It does not replace legal approval, custody readiness, production operations, a contract audit, or a reviewed production randomness coordinator.

## Safety Model

The command fails closed unless all of the following are true:

- `ROBINHOOD_MAINNET_FORK_RPC_URL` is an explicit HTTPS endpoint.
- The endpoint is dedicated/authenticated rather than Robinhood's public default RPC.
- `ROBINHOOD_MAINNET_FORK_BLOCK` is a positive pinned block number, not `latest`.
- The endpoint reports Robinhood mainnet chain ID `4663` and serves the pinned block.
- The reviewed randomness coordinator exists at that block and its bytecode hash matches the configured hash.
- The tracked Git worktree is clean.
- Public deployer, admin, treasury, and randomness inputs are all explicit and valid.
- `ALLOW_OPERATOR_RANDOMNESS_ON_MAINNET_FORK_ONLY=true` is present. This authorizes the demo commit/reveal adapter only for the separate disposable collector journey after exact production verification.
- The dedicated loopback port is free.

The runner starts Hardhat on `127.0.0.1:18545` by default with local chain ID `31337`. Every child script is hardcoded to `--network localhost`, while `GACHA_MAINNET_FORK_REHEARSAL=true` selects the exact mainnet deployment configuration without enabling a remote network. The production RPC and any authentication header are supplied only to the fork node.

The command removes production private-key variables from child environments. Do not set or provide `DEPLOYER_PRIVATE_KEY`; the fork uses only Hardhat's disposable local signer.

## Required Inputs

Use a dedicated authenticated mainnet RPC and public addresses only:

```bash
unset DEPLOYER_PRIVATE_KEY

export ROBINHOOD_MAINNET_FORK_RPC_URL='https://your-dedicated-provider.example/v2/credential'
export ROBINHOOD_MAINNET_FORK_BLOCK='12345678'

export MAINNET_RELEASE_DEPLOYER_ADDRESS='0x...'
export MAINNET_RELEASE_ADMIN_ADDRESS='0x...'
export MAINNET_RELEASE_OPERATIONS_ADDRESS='0x...'
export MAINNET_RELEASE_GUARDIAN_ADDRESS='0x...'
export MAINNET_RELEASE_TREASURY_ADDRESS='0x...'

export ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS='0x...'
export ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH='0x...'
export ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI='0'

export ALLOW_OPERATOR_RANDOMNESS_ON_MAINNET_FORK_ONLY='true'
```

For providers that authenticate with an HTTP header instead of the endpoint URL, set both values without committing them:

```bash
export ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME='Authorization'
export ROBINHOOD_MAINNET_FORK_RPC_HEADER_VALUE='Bearer ...'
```

Optional non-secret settings:

```bash
export MAINNET_FORK_LOCAL_PORT='18545'
export MAINNET_RELEASE_MANIFEST_PATH='/absolute/path/robinhood-mainnet-plan.json'
```

## Run

From the repository root:

```bash
pnpm --filter @gacha/contracts build
pnpm --filter @gacha/contracts rehearse:mainnet-fork
pnpm --filter @gacha/contracts validate:mainnet-manifest -- /absolute/path/robinhood-mainnet-plan.json
```

The runner performs these steps in order:

1. Validate the explicit RPC, pinned block, source chain, coordinator code hash, public release inputs, and clean source commit.
2. Acquire an exclusive rehearsal lock and verify the loopback port is free.
3. Start a child-originated Hardhat node pinned to the reviewed mainnet block.
4. Verify the local node is chain `31337` and reproduces the pinned block hash.
5. Deploy all 15 contracts through the exact mainnet branch with `CoordinatorRandomnessProvider`, production constructor treasuries, role handoff, deployer revocation, and paused launch state.
6. Run production smoke against the fork, including coordinator pinning, role-holder contract code, treasury wiring, every pause state, and absence of residual deployer privileges.
7. Record production deploy/smoke transaction count, contract creations, gas used, and calldata bytes.
8. Hash the exact compiler inputs and fork/mainnet target artifacts.
9. Stop the fork node, release its lock, and restore any pre-existing `deployments/localhost.json` byte-for-byte.
10. Run the existing deploy, seed, smoke, collector rehearsal, and final smoke on a second disposable localhost node with demo commit/reveal randomness.
11. Atomically write the secret-free release manifest only after both paths and all cleanup succeed.

No testnet or mainnet deployment registry is modified.

## Eligibility Boundary

The production fork executes the same coordinator, treasury, role-handoff, deployer-revocation, and paused-launch logic used by the mainnet deployment branch. With a dedicated authenticated RPC, the manifest is marked:

```json
{
  "releaseEligibility": "production-candidate",
  "developmentOverrides": []
}
```

Expected deployer, role, treasury, and coordinator values are recorded with `executionStatus: "verified-by-production-fork"`. The separate commit/reveal journey is supplemental gameplay evidence and is never used as production randomness evidence.

The production fork remains paused. Activating a private canary is a separate reviewed multisig operation and is never performed by this command.

## Public RPC Development Override

Robinhood's public RPC is rejected by default. A local diagnostic may explicitly set:

```bash
export ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT='true'
```

A manifest created with that override remains `development-only` and adds `public-mainnet-rpc` to `developmentOverrides`. It is not a production release candidate.

## Failure Recovery

The node is terminated and `deployments/localhost.json` is restored when deployment, seed, smoke, rehearsal, metric collection, artifact hashing, or manifest validation fails. A stale lock is never deleted automatically; verify that no rehearsal process is running before manually removing `deployments/.mainnet-fork-rehearsal.lock`.

RPC URLs, authentication headers, private keys, mnemonics, transaction calldata, and environment dumps are never included in the manifest. Fork-node failure output is redacted before it is displayed.
