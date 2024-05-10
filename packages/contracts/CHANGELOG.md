# TokenVoting Plugin

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to the [Aragon OSx Plugin Versioning Convention](https://devs.aragon.org/docs/osx/how-to-guides/plugin-development/publication/versioning).

## v1.3

### Added

- Copied files from [aragon/osx commit 1130df](https://github.com/aragon/osx/commit/1130dfce94fd294c4341e91a8f3faccc54cf43b7)

### Changed

- Bumped OpenZepplin to `4.9.6`.
- Used `ProxyLib` from `osx-commons-contracts` for the UUPS proxy deployment in `TokenVotingSetup`.
- Hard-coded the `bytes32 internal constant EXECUTE_PERMISSION_ID` constant in `TokenVotingSetup` until it is available in `PermissionLib`.
- Changed the `prepareInstallation` function in `TokenVotingSetup` to not unnecessarily grant the `UPGRADE_PLUGIN_PERMISSION_ID` permission to the installing DAO.
- Changed the `prepareUpdate` function in `TokenVotingSetup` to revoke the previously unnecessarily granted `UPGRADE_PLUGIN_PERMISSION_ID` permission from the installing DAO.
- Changed the `prepareUninstallation` function in `TokenVotingSetup` to not revoke the `MINT_PERMISSION_ID` to the Dao when the plugin is uninstalled.
