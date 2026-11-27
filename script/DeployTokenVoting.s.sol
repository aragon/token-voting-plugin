// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IDAO} from "@aragon/osx/core/dao/DAO.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {TokenVoting} from "../src/TokenVoting.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {TokenVotingSetupZkSync} from "../src/TokenVotingSetupZkSync.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IPluginRepo} from "@aragon/osx/framework/plugin/repo/IPluginRepo.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * This script performs the following tasks:
 * - Deploys the plugin setup
 * It deploys the build in src/, so the next build needs no new script. Publishing the setup as a new
 * version is the management DAO proposal printed by `just upgrade-proposal`.
 */
contract DeployTokenVotingScript is Script {
    using stdJson for string;

    address deployer;
    PluginRepo pluginRepo;

    // Artifacts
    address pluginSetup;
    GovernanceERC20 governanceERC20;
    GovernanceWrappedERC20 governanceWrappedERC20;

    modifier broadcast() {
        uint256 privKey = vm.envUint("DEPLOYER_KEY");
        vm.startBroadcast(privKey);

        deployer = vm.addr(privKey);
        console2.log("General");
        console2.log("- Deploying from:   ", deployer);
        console2.log("- Chain ID:         ", block.chainid);
        console2.log("");

        _;

        vm.stopBroadcast();
    }

    function setUp() public {
        // Pick the contract addresses from
        // https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json

        pluginRepo = PluginRepo(vm.envAddress("TOKEN_VOTING_PLUGIN_REPO_ADDRESS"));
        vm.label(address(pluginRepo), "PluginRepo");
    }

    function run() public broadcast {
        deployPluginSetup();

        // Done
        printDeployment();

        // Write the addresses to a JSON file
        if (!vm.envOr("SIMULATION", false)) {
            writeJsonArtifacts();
        }
    }

    /// @notice Deploys the token bases and the plugin setup of this network (the zkSync setup on zkSync).
    /// @return The plugin setup address.
    function deployPluginSetup() public returns (address) {
        // Dependencies
        governanceERC20 = new GovernanceERC20(
            IDAO(address(0)), "", "", GovernanceERC20.MintSettings(new address[](0), new uint256[](0), false)
        );
        governanceWrappedERC20 = new GovernanceWrappedERC20(IERC20Upgradeable(address(0)), "", "");

        // Plugin setup (the installer)
        if (block.chainid != 300 && block.chainid != 324) {
            pluginSetup = address(new TokenVotingSetup(new TokenVoting(), governanceERC20, governanceWrappedERC20));
        } else {
            console2.log("Using TokenVotingSetupZkSync\n");
            pluginSetup = address(new TokenVotingSetupZkSync(new TokenVoting()));
        }
        return pluginSetup;
    }

    function printDeployment() public view {
        console2.log("TokenVoting plugin:");
        console2.log("- PluginSetup:               ", address(pluginSetup));
        console2.log("- GovernanceERC20:           ", address(governanceERC20));
        console2.log("- GovernanceWrappedERC20:    ", address(governanceWrappedERC20));
        console2.log("");
    }

    function writeJsonArtifacts() internal {
        string memory artifacts = "output";
        artifacts.serialize("pluginRepo", address(pluginRepo));
        artifacts.serialize("pluginSetup", address(pluginSetup));
        artifacts.serialize("governanceERC20", address(governanceERC20));
        artifacts = artifacts.serialize("governanceWrappedERC20", address(governanceWrappedERC20));

        string memory networkName = vm.envString("NETWORK_NAME");
        string memory filePath = string.concat(
            vm.projectRoot(), "/artifacts/deployment-", networkName, "-", vm.toString(block.timestamp), ".json"
        );
        artifacts.write(filePath);

        console2.log("Deployment artifacts written to", filePath);
    }
}
