// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IDAO} from "@aragon/osx/core/dao/DAO.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IPluginRepo} from "@aragon/osx/framework/plugin/repo/IPluginRepo.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// import {hashHelpers, PluginSetupRef} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";

/**
 * This script performs the following tasks:
 * - Deploys the plugin setup
 * - Encodes the calldata of the proposal to publish it as a new version
 */
contract DeployNewPluginVersionScript is Script {
    using stdJson for string;

    address deployer;
    PluginRepo pluginRepo;
    address mgmtDaoMultisig;
    bytes releaseMetadataUri;
    bytes buildMetadataUri;

    // Artifacts
    TokenVotingSetup pluginSetup;
    GovernanceERC20 governanceERC20;
    GovernanceWrappedERC20 governanceWrappedERC20;

    modifier broadcast() {
        uint256 privKey = vm.envUint("DEPLOYMENT_PRIVATE_KEY");
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
        mgmtDaoMultisig = vm.envAddress("MANAGEMENT_DAO_MULTISIG_ADDRESS");
        vm.label(address(mgmtDaoMultisig), "MgmtMultisig");

        releaseMetadataUri = vm.envOr("RELEASE_METADATA_URI", bytes(" "));
        buildMetadataUri = vm.envOr("BUILD_METADATA_URI", bytes(" "));
    }

    function run() public broadcast {
        deployPluginSetup();

        // Done
        printDeployment();

        printVersionPublishProposal();

        // Write the addresses to a JSON file
        if (!vm.envOr("SIMULATION", false)) {
            writeJsonArtifacts();
        }
    }

    function deployPluginSetup() public {
        // Dependencies
        governanceERC20 = new GovernanceERC20(
            IDAO(address(0)), "", "", GovernanceERC20.MintSettings(new address[](0), new uint256[](0), false)
        );
        governanceWrappedERC20 = new GovernanceWrappedERC20(IERC20Upgradeable(address(0)), "", "");

        // Plugin setup
        pluginSetup = new TokenVotingSetup(governanceERC20, governanceWrappedERC20);
    }

    function printDeployment() public view {
        console2.log("TokenVoting plugin:");
        console2.log("- PluginSetup:               ", address(pluginSetup));
        console2.log("- GovernanceERC20:           ", address(governanceERC20));
        console2.log("- GovernanceWrappedERC20:    ", address(governanceWrappedERC20));
        console2.log("");
    }

    function printVersionPublishProposal() public view {
        // Pick the .env contract addresses from:
        // https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json
        // https://github.com/aragon/token-voting-plugin/blob/main/artifacts/
        // https://github.com/aragon/token-voting-plugin-hardhat/blob/main/packages/artifacts/src/addresses.json

        bytes memory data =
            abi.encodeCall(IPluginRepo.createVersion, (1, address(pluginSetup), buildMetadataUri, releaseMetadataUri));

        console2.log("Version proposal:");
        console2.log("- Proposal created on:       ", address(mgmtDaoMultisig), " (Multisig)");
        console2.log("- Action to:                 ", address(pluginRepo), " (TokenVoting repo)");
        console2.log("");
        console2.log("Action signature:");
        console2.log("- createVersion(uint8 release, address pluginSetup, bytes buildMetadata, bytes releaseMetadata)");
        console2.log("");
        console2.log("Command:");
        console2.log(
            "$ cast send [--trezor] [--ledger] --from <your-address>",
            vm.toString(address(mgmtDaoMultisig)),
            vm.toString(data)
        );
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
