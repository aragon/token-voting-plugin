# Token Voting Plugin [![Foundry][foundry-badge]][foundry] [![License: AGPL v3][license-badge]][license]

[foundry]: https://getfoundry.sh/
[foundry-badge]: https://img.shields.io/badge/Built%20with-Foundry-FFDB1C.svg
[license]: https://opensource.org/licenses/AGPL-v3
[license-badge]: https://img.shields.io/badge/License-AGPL_v3-blue.svg

## Audit

### v1.4

**Halborn**: [audit report](./audits/halborn-audit-1-4-remediated.pdf)

- Commit ID: [590ebd8d5931cb6811ea55ca9e6e3f96df6969b3](https://github.com/aragon/token-voting-plugin/commit/590ebd8d5931cb6811ea55ca9e6e3f96df6969b3)
- Started: July 11th, 2025
- Finished: July 14th, 2025
- Updated: September 29th, 2025

### v1.3

TokenVoting v1.4 has been ported to Foundry.

The HardHat codebase of version 1.3 and earlier can be found [in this repo](https://github.com/aragon/token-voting-plugin-hardhat).

**Halborn**: [audit report](https://github.com/aragon/osx/tree/main/audits/Halborn_AragonOSx_v1_4_Smart_Contract_Security_Assessment_Report_2025_01_03.pdf)

- Commit ID: [02a7dbb95c42ebd2226117bf85a0fe330c788948](https://github.com/aragon/token-voting-plugin-hardhat/commit/02a7dbb95c42ebd2226117bf85a0fe330c788948)
- Started: 2024-11-18
- Finished: 2025-02-13

## ABI and artifacts

Check out the [artifacts folder](./npm-artifacts/README.md) to get the deployed addresses and the contract ABI's.


## Features

TokenVoting is an Aragon OSx Plugin, designed to conduct governance processes where the voting power of each member is determined by an [IVotes compatible token](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/utils/IVotes.sol).

Three voting modes:
- Early execution: Execute when there's mathematical certainty that the proposal can't be defeated
- Vote replacement: Allow to change votes until the proposal ends
- Standard mode: No vote replacement or early execution.

Two token contracts are provided for convenience:
- GovernanceERC20: Mint a new token with a predefined set of addresses to mint for
- GovernanceWrappedERC20: Wrap an existing token that does not support [IVotes](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/governance/utils/IVotes.sol) by itself

If you already have an IVotes compatible token, you can simply import it.

Other features:
- Excluding balances from certain accounts (non-circulating supply, e.g. vaults, the DAO's own holdings, etc)
- Mint freezing
- Granular permission management for proposal creation, proposal execution, token minting
- Minimum balance requirements for proposers

> **⚠️ Excluding accounts (for airdrop vaults / distribution contracts).** This feature targets contracts holding supply not yet in the hands of real stakeholders. Two rules apply, neither enforced on-chain: **(1)** an excluded account must **delegate to itself** — otherwise its voting power reads as zero and nothing is subtracted from the total (the exclusion silently does nothing); **(2)** it must be **unable to vote** — its self-delegated balance is removed from the participation/approval denominator, so any vote it (or a delegate holding its tokens) could cast would count against a reduced supply and could skew or single-handedly decide the outcome. Only exclude addresses that cannot vote, e.g. a distribution contract with no voting logic.

## Project structure

```
├── justfile              # task launcher (imports lib/just-foundry)
├── foundry.toml
├── remappings.txt
├── lib
│   └── just-foundry      # shared just recipes + network configs (submodule)
├── npm-artifacts
│   └── src
│       ├── abi.ts
│       └── addresses.json
├── script
│   ├── DeployNewTokenVotingRepo.s.sol
│   ├── DeployTokenVoting_1_4.s.sol
│   ├── EncodeUpgradeProposal.sol
│   └── verify-contracts.sh
├── src
│   ├── TokenVoting.sol
│   ├── TokenVotingSetup.sol
│   ├── TokenVotingSetupZkSync.sol
│   ├── base
│   │   ├── IMajorityVoting.sol
│   │   └── MajorityVotingBase.sol
│   ├── condition
│   │   └── VotingPowerCondition.sol
│   └── erc20
│       ├── GovernanceERC20.sol
│       ├── GovernanceWrappedERC20.sol
│       ├── IERC20MintableUpgradeable.sol
│       └── IGovernanceWrappedERC20.sol
└── test
```

## Prerequisites
- [Foundry](https://getfoundry.sh/)
- [just](https://github.com/casey/just)

Optional:

- [Docker](https://www.docker.com) (recommended for deploying)

## Getting Started

Clone the repository with submodules and initialize it for a network:

```bash
git clone --recurse-submodules <repo-url>
just init          # defaults to mainnet, e.g. `just init sepolia`
```

`just init` fetches submodules, creates `.env` from `.env.example`, and selects the network. Edit `.env` to add your secrets (`DEPLOYER_KEY`, `ETHERSCAN_API_KEY`, `PINATA_JWT`, …). Alternatively, resolve them with the [`vars`](https://github.com/vars-cli/vars) secret manager — the keys this project needs are declared in [`.vars.yaml`](./.vars.yaml), and just-foundry's recipes call `vars resolve` automatically when `vars` is installed.

Network settings (RPC URL, chain id, verifier, and the Aragon OSx addresses) come from `lib/just-foundry/networks/<network>.env` — switch with `just switch <network>`, inspect the resolved values with `just env`, and create a local editable copy with `just switch <network> override`.

### Using just

`just` is the task launcher for the project; the generic recipes are imported from [`lib/just-foundry`](https://github.com/aragon/just-foundry). Run `just` (or `just help`) to list them:

```
$ just
[setup]
init network="mainnet"       Fetch submodules, scaffold .env and select the network
switch network override=""   Select the active network
setup                        Install Foundry

[metadata]
pin-metadata                 Pin the release & build metadata to IPFS
upgrade-proposal             Encode & print the calldata to create the upgrade proposal

[script]
predeploy                    Dry-run the deploy script (no broadcast)
deploy *args                 Run tests, then broadcast + verify

[test]
test *args                   Run unit tests (fork tests excluded)
test-fork *args              Run fork tests (requires RPC_URL)
test-coverage                Generate an HTML coverage report under ./report

[verification]
verify type="" script=""     Verify the latest broadcast (etherscan|blockscout|sourcify)

[develop]
clean                        Clean build artifacts and reports
storage-info contract        Show a contract's storage layout
check-upgrade from to        Check storage-layout upgrade compatibility

[helpers]
env                          Show the resolved environment (values + sources)
```

There are also `balance`, `refund`, `gas-price`, `nonce` and `clean-nonce` deployer helpers (run `just <name>`).

## Testing

Run the suites with `just`:

```sh
just test          # unit tests (fork tests excluded)
just test-fork     # fork tests (requires a reachable RPC_URL for the active network)
just test-coverage # HTML coverage report under ./report
```

`just test` checks the logic's accordance to the specs; `just test-fork` additionally requires `RPC_URL` (from the selected network or `.env`).

## Deployment 🚀

Select the target network, then simulate and deploy:

```sh
just switch <network>
just predeploy     # simulate (no broadcast)
just deploy        # run tests, then broadcast + verify; logs to ./logs
```

### Deployment Checklist

When running a production deployment ceremony, you can use these steps as a reference:

- [ ] I have cloned the official repository on my computer and I have checked out the `main` branch
- [ ] I am using the latest official docker engine, running a Debian Linux (stable) image
  - [ ] I have run `docker run --rm -it -v .:/deployment debian:bookworm-slim`
  - [ ] I have run `apt update && apt install -y curl git vim neovim bc`
  - [ ] I have installed `just` (`curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin`)
  - On **standard EVM networks**:
    - [ ] I have run `curl -L https://foundry.paradigm.xyz | bash`
    - [ ] I have run `source /root/.bashrc`
    - [ ] I have run `foundryup`
  - On **ZkSync networks**:
    - [ ] I have run `curl -L https://raw.githubusercontent.com/matter-labs/foundry-zksync/main/install-foundry-zksync | bash`
    - [ ] I have run `source /root/.bashrc`
    - [ ] I have run `foundryup-zksync`
  - [ ] I have run `cd /deployment`
  - [ ] I have run `just init <network>`
- [ ] I am opening an editor on the `/deployment` folder, within the Docker container
- [ ] The `.env` file contains the correct parameters for the deployment
  - [ ] I have created a new burner wallet with `cast wallet new` and copied the private key to `DEPLOYER_KEY` within `.env`
  - [ ] I have selected the correct network with `just switch <network>` (this sets RPC_URL, CHAIN_ID and the verifier)
  - [ ] I have set `ETHERSCAN_API_KEY` or `BLOCKSCOUT_HOST_NAME` (when relevant to the target network)
  - [ ] (TO DO: Add a step to check your own variables here)
  - [ ] I have run `just env` and confirmed the resolved values
  - [ ] I am the only person of the ceremony that will operate the deployment wallet
- [ ] All the tests run clean (`just test`)
- My computer:
  - [ ] Is running in a safe location and using a trusted network
  - [ ] It exposes no services or ports
    - MacOS: `sudo lsof -iTCP -sTCP:LISTEN -nP`
    - Linux: `netstat -tulpn`
    - Windows: `netstat -nao -p tcp`
  - [ ] The wifi or wired network in use does not expose any ports to a WAN
- [ ] I have run `just predeploy` and the simulation completes with no errors
- [ ] The deployment wallet has sufficient native token for gas
  - At least, 15% more than the amount estimated during the simulation
- [ ] `just test` still runs clean
- [ ] I have run `git status` and it reports no local changes
- [ ] The current local git branch (`main`) corresponds to its counterpart on `origin`
  - [ ] I confirm that the rest of members of the ceremony pulled the last git commit on `main` and reported the same commit hash as my output for `git log -n 1`
- [ ] I have initiated the production deployment with `just deploy`

### Post deployment checklist

- [ ] The deployment process completed with no errors
- [ ] The factory contract was deployed by the deployment address
- [ ] All the project's smart contracts are correctly verified on the reference block explorer of the target network.
- [ ] The output of the latest `logs/<script>-<network>-<timestamp>.log` file corresponds to the console output
- [ ] A file called `artifacts/deployment-<network>-<timestamp>.json` has been created, and the addresses match those logged to the screen
- [ ] I have uploaded the following files to a shared location:
  - `logs/<script>-<network>-<timestamp>.log` (the last one)
  - `artifacts/deployment-<network>-<timestamp>.json`  (the last one)
  - `broadcast/DeployTokenVoting_*.s.sol/<chain-id>/run-<timestamp>.json` (the last one, or `run-latest.json`)
- [ ] The rest of members confirm that the values are correct
- [ ] I have transferred the remaining funds of the deployment wallet to the address that originally funded it
  - `just refund`

This concludes the deployment ceremony.

## Contract source verification

When running a deployment with `just deploy`, Foundry will attempt to verify the contracts on the corresponding block explorer.

If you need to verify on multiple explorers or the automatic verification did not work, use the `verify` recipe with the desired verifier:

```sh
just verify etherscan   # or: blockscout, sourcify
just verify blockscout
just verify sourcify
```

These use the last deployment data under `broadcast/DeployTokenVoting_*.s.sol/<chain-id>/run-latest.json`.
- Ensure that the required variables are set within the `.env` file (or the active network).

This flow will attempt to verify all the contracts in one go, but you may still need to issue additional manual verifications, depending on the circumstances.

### Routescan verification (manual)

```sh
$ forge verify-contract <address> <path/to/file.sol>:<contract-name> --verifier-url 'https://api.routescan.io/v2/network/<testnet|mainnet>/evm/<chain-id>/etherscan' --etherscan-api-key "verifyContract" --num-of-optimizations 200 --compiler-version 0.8.28 --constructor-args <args>
```

Where:
- `<address>` is the address of the contract to verify
- `<path/to/file.sol>:<contract-name>` is the path of the source file along with the contract name
- `<testnet|mainnet>` the type of network
- `<chain-id>` the ID of the chain
- `<args>` the constructor arguments
  - Get them with `$(cast abi-encode "constructor(address param1, uint256 param2,...)" param1 param2 ...)`

## Security 🔒

If you believe you've found a security issue, we encourage you to notify us. We welcome working with you to resolve the issue promptly.

Security Contact Email: sirt@aragon.org

Please do not use the public issue tracker to report security issues.

## Contributing 🤝

Contributions are welcome! Please read our contributing guidelines to get started.

## License 📄

This project is licensed under AGPL-3.0-or-later.

## Support 💬

For support, join our Discord server or open an issue in the repository.
