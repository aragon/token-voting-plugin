# Token Voting Plugin artifacts

This package contains the ABI of the TokenVoting Plugin for OSx, as well as the address of its plugin repository on each supported network. Install it with:

```sh
yarn add @aragon/token-voting-plugin-artifacts
```

## Usage

```typescript
// ABI definitions
import {
    IMajorityVotingABI,
    TokenVotingABI,
    TokenVotingSetupABI,
    TokenVotingSetupZkSyncABI,
    VotingPowerConditionABI,
    GovernanceERC20ABI,
    GovernanceWrappedERC20ABI,
    IGovernanceWrappedERC20ABI
} from "@aragon/token-voting-plugin-artifacts";

// Plugin Repository addresses per-network
import { addresses } from "@aragon/token-voting-plugin-artifacts";
```

You can also open [addresses.json](https://github.com/aragon/token-voting-plugin/blob/main/packages/artifacts/src/addresses.json) directly.

## Development

### Building the package

Install the dependencies and generate the local ABI definitions.

```sh
yarn --ignore-scripts
yarn build
```

The `build` script will:
1. Move to `packages/contracts`.
2. Install its dependencies.
3. Compile the contracts using Hardhat.
4. Generate their ABI.
5. Extract their ABI and embed it into on `src/abi.ts`.

### Syncing the deployment addresses

Clone [OSx Commons](https://github.com/aragon/osx-commons) in a folder next to this repo.

```sh
# cd packages/artifacts
yarn sync-addresses
```

### Publishing

- Access the repo's GitHub Actions panel
- Click on "Publish Artifacts"
- Select the corresponding `release-v*` branch as the source

This action will:
- Create a git tag like `v1.2`, following [package.json](./package.json)'s version field
- Publish the package to NPM

## Documentation

You can find all documentation regarding how to use this plugin in [Aragon's documentation here](https://docs.aragon.org/token-voting/1.x/index.html).

## Contributing

If you like what we're doing and would love to support, please review our `CONTRIBUTING_GUIDE.md` [here](https://github.com/aragon/token-voting-plugin/blob/main/CONTRIBUTIONS.md). We'd love to build with you.

## Security

If you believe you've found a security issue, we encourage you to notify us. We welcome working with you to resolve the issue promptly.

Security Contact Email: sirt@aragon.org

Please do not use the issue tracker for security issues.
