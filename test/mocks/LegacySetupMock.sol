// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.8;

import {PluginUpgradeableSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/PluginUpgradeableSetup.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";
import {ProxyLib} from "@aragon/osx-commons-contracts/src/utils/deployment/ProxyLib.sol";

/// @notice Test stand-in for the setup of an old plugin build, so the real PluginSetupProcessor can
///         install that build. It deploys a UUPS proxy of the given implementation with `_data` as
///         the initialization calldata and asks for no permissions: the test grants what it needs.
///         Its `prepareUpdate` is never reached, because the PluginSetupProcessor calls the setup of
///         the build being updated to.
contract LegacySetupMock is PluginUpgradeableSetup {
    constructor(address _implementation) PluginUpgradeableSetup(_implementation) {}

    function prepareInstallation(address, bytes calldata _data)
        external
        returns (address plugin, PreparedSetupData memory preparedSetupData)
    {
        plugin = ProxyLib.deployUUPSProxy(IMPLEMENTATION, _data);
    }

    function prepareUpdate(address, uint16, SetupPayload calldata)
        external
        pure
        returns (bytes memory, PreparedSetupData memory)
    {
        revert("LegacySetupMock: not an update target");
    }

    function prepareUninstallation(address, SetupPayload calldata)
        external
        pure
        returns (PermissionLib.MultiTargetPermission[] memory permissions)
    {}
}
