# Robinhood Mainnet Readiness Report

Status: **ready for a pinned mainnet-fork rehearsal; not approved for broadcast or public launch**.

This report covers the current 15-contract protocol, production web application, inventory service, admin controls, and no-broadcast release tooling. The contracts are not upgradeable, so a mainnet mistake requires a paused migration or redeployment rather than an in-place implementation upgrade.

## Verified Locally

- Clean Solidity compilation of 48 source files with optimizer enabled.
- 218 contract tests passing, including pull accounting, refunds, allowlists, wallet caps, escrow, marketplace credits, redemption custody, Dust conservation, Forge replay protection, recipe caps, pool solvency, role separation, pause behavior, and production release guards.
- Full local collector journey passing through all 15 deployments, seed, smoke, pull/reveal, Forge, marketplace, redemption, buyback, and final smoke.
- 155 web unit and component tests passing.
- 31 inventory tests and 4 shared-chain tests passing.
- 14 Playwright journeys passing on desktop and mobile across Gacha, Vault, Forge, Market, Redemption, and Admin.
- Next.js 15.5.18 and React 19.2.7 production build passing.
- Production dependency audit reports no known vulnerabilities.
- Slither static analysis reviewed. Reported ETH-transfer paths are credit- or role-gated and reentrancy-protected; the mock-only locked-ETH warning is not part of the deployment set. Static analysis is not an independent security audit.
- Deployed runtime bytecode for every contract remains below the EVM 24,576-byte limit. The largest current runtime is PackSale at approximately 19.6 KB.
- Mainnet deployment fails closed unless it uses distinct deployer, protocol-admin, operations, guardian, and treasury addresses, code-bearing role accounts, pinned coordinator bytecode, chain ID 4663, paused launch state, and complete deployer privilege revocation.
- PackSale limits a drop to 128 inventory items and uses linear reservation checks, bounding purchase/refund cleanup and removing the previous quadratic duplicate scan.

## Deployment Cost Baseline

The exact paused production branch was exercised locally with code-bearing role fixtures and a mock coordinator. Deployment, wiring, pausing, role handoff, and deployer revocation require approximately:

- 15 contract creations.
- 139 deployment and configuration transactions.
- 32,738,455 measured execution gas.
- 42,559,992 gas with a 30% gas-unit contingency.

At the sampled Robinhood mainnet gas price of 0.293194 gwei, measured execution is approximately 0.0096 ETH. Applying both the 30% gas contingency and a 2x fee contingency gives approximately 0.0250 ETH before any unexpected L1 data variation or retry. Fund a fresh deployment-only wallet with at least 0.05 ETH for the reviewed deployment window, then sweep the remainder after verification.

This estimate excludes production inventory anchoring, tier-pool onboarding, recipe configuration, randomness-provider request funding, buyback liquidity, and ongoing transactions.

## Broadcast Blockers

1. Select and independently review a production randomness coordinator available on Robinhood Chain. Record its address, runtime bytecode hash, callback semantics, request fee, timeout behavior, and funding model. The demo commit/reveal provider is blocked on mainnet.
2. Commission an independent smart-contract audit covering the exact compiler inputs and source commit intended for deployment. Resolve all accepted findings before generating the final release manifest.
3. Create distinct production accounts: a fresh deployment-only EOA or hardware signer, protocol-admin multisig, operations multisig, guardian multisig, and treasury multisig. The private key previously shared in chat must never be funded or reused.
4. Provide a dedicated authenticated Robinhood mainnet RPC, pin a block, and pass `rehearse:mainnet-fork`. A public-RPC rehearsal is development-only and cannot produce production-candidate evidence.
5. Provision PostgreSQL, set production admin secrets and wallet-role allowlists, run the four hashed migrations, test backup/restore, and verify the multisig operation queue. No live production database has been migrated yet.
6. Freeze real inventory IDs, custody evidence, metadata, valuation records, grail flags, tier policies, shipping/insurance procedures, and redemption terms. The tracked testnet registry is an older eight-contract deployment and does not represent the current 15-contract Forge V4 protocol.
7. Complete legal review for paid randomized physical collectibles, marketplace fees, custody/redemption, consumer disclosures, sanctions/geofencing, taxes, privacy, Pokemon and One Piece resale descriptors, and any stock-themed fantasy feature. Do not imply Robinhood, Pokemon, grading-company, or One Piece affiliation.
8. Configure production monitoring for RPC health, randomness latency, pending purchases, escrow balances, pool capacity, treasury credits, redemption aging, failed multisig operations, and pause events.
9. Verify every deployed contract on Robinhood Blockscout and archive the deployment registry, release manifest, compiler inputs, role assignments, coordinator pin, transaction receipts, and smoke results.

## Controlled Mainnet Sequence

1. Complete every blocker above and freeze the reviewed source commit.
2. Run the pinned production-candidate fork rehearsal and validate its manifest.
3. Recalculate fees immediately before deployment and fund only the fresh deployer.
4. Deploy all contracts in the paused state and verify bytecode, constructor wiring, roles, treasuries, coordinator pinning, and deployer revocation.
5. Anchor only low-value canary inventory and configure a private allowlisted drop with strict per-wallet limits.
6. Execute internal pull, reveal, Forge, marketplace, redemption-cancel, and accounting reconciliations.
7. Require an explicit multisig decision before unpausing any public surface.

No mainnet transaction should be signed until the production-candidate manifest and independent audit both pass review.
