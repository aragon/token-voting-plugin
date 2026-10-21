// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {VmSafe} from "forge-std/Vm.sol";

/// @notice Fallback values for the deployment scripts. A non-empty env var of the same name overrides them.
/// @dev `just upgrade-proposal` reads the constants below with sed: keep each one on a single line.
library PluginSettings {
    VmSafe private constant vm = VmSafe(address(uint160(uint256(keccak256("hevm cheat code")))));

    string internal constant RELEASE_METADATA_URI = "ipfs://QmWjZArvePnMPgbfKAMW3TidbqHEy68UV6SvRBhiaygGta";
    string internal constant BUILD_METADATA_URI = "ipfs://QmdLJo4VqwN8jPFf2svZpG5i5kVZX61s8w519qxUXM7X7g";

    function releaseMetadataUri() internal view returns (bytes memory) {
        return resolve("RELEASE_METADATA_URI", RELEASE_METADATA_URI);
    }

    function buildMetadataUri() internal view returns (bytes memory) {
        return resolve("BUILD_METADATA_URI", BUILD_METADATA_URI);
    }

    /// @dev An empty env var counts as unset, since `.env.example` declares the overrides empty.
    function resolve(string memory envName, string memory fallbackValue) internal view returns (bytes memory value) {
        value = bytes(vm.envOr(envName, string("")));
        if (value.length == 0) value = bytes(fallbackValue);
        if (value.length == 0) {
            revert(string.concat(envName, " is empty in both the env and script/PluginSettings.sol"));
        }
    }
}
