# Token Voting Plugin artifacts

This package contains the ABI of the TokenVoting Plugin for OSx, as well as the address of its plugin repository on each network. Install it with:

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
    VotingPowerConditionABI
} from "@aragon/token-voting-plugin-artifacts";

// Plugin Repository addresses per-network
import { addresses } from "@aragon/token-voting-plugin-artifacts";
```

You can also open [addresses.json](./src/addresses.json) directly.

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

### Publish to NPM

Ensure the package `version` is up to date within `package.json` before publishing.

Check that only the intended files will be published:
```sh
yarn publish --dry-run
```

To publish the package to NPM, run:
```sh
yarn publish --access public
```
