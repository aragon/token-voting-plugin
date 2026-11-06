// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.28;

// Rehearsal of publishing the current build and updating live DAOs to it, on a Polygon fork.
//
//   just switch polygon
//   just test-fork --match-contract PublishAndUpdateForkTest
//
// setUp deploys the plugin setup with the deploy script's own code, then publishes it as the next build
// of release 1 with the exact action of the management DAO proposal (`just upgrade-proposal`), executed
// by the management DAO's multisig plugin. Each test then updates a DAO through the live
// PluginSetupProcessor, acting as the DAO the way an update proposal does, and checks that an outsider's
// `initializeFrom` reverts and that a proposal still executes.
//
// Build 4: a live DAO whose plugin came from build 3 and has since run `initializeFrom(3, "")` on-chain.
// On that DAO, a proposal created and partly voted on before the update also takes its last votes and
// executes after it.
// Builds 3 and 2: a new DAO from the live DAOFactory, with the live build installed through the PSP.

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {DAOFactory} from "@aragon/osx/framework/dao/DAOFactory.sol";
import {PermissionManager} from "@aragon/osx/core/permission/PermissionManager.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginSetupRef, hashHelpers} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";

import {TokenVoting} from "../../src/TokenVoting.sol";
import {MajorityVotingBase} from "../../src/base/MajorityVotingBase.sol";
import {IMajorityVoting} from "../../src/base/IMajorityVoting.sol";
import {TokenVotingSetup} from "../../src/TokenVotingSetup.sol";
import {GovernanceERC20} from "../../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../../src/erc20/GovernanceWrappedERC20.sol";
import {DeployTokenVotingScript} from "../../script/DeployTokenVoting.s.sol";
import {EncodeUpgradeProposalScript} from "../../script/EncodeUpgradeProposal.s.sol";
import {PluginSettings} from "../../script/PluginSettings.sol";

import {ForkTestBase} from "../lib/ForkTestBase.sol";

/// @dev The harmless target of the proposal each test passes after the update.
contract ForkSink {
    uint256 public hits;

    function ping() external {
        hits++;
    }
}

contract PublishAndUpdateForkTest is ForkTestBase {
    bytes32 internal constant ROOT_PERMISSION_ID = keccak256("ROOT_PERMISSION");
    bytes32 internal constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");
    bytes32 internal constant CREATE_PROPOSAL_PERMISSION_ID = keccak256("CREATE_PROPOSAL_PERMISSION");

    /// Polygon DAO whose TokenVoting plugin went from build 3 to 4 through the PSP, then ran `initializeFrom(3, "")`.
    address internal constant LIVE_BUILD_4_DAO = 0xebe597480A414AA717c1C2f7797aa20a32572617;
    address internal constant LIVE_BUILD_4_PLUGIN = 0x34A2D5B8a6404DE9C1b22084c623ab88201c5c33;

    /// The mint settings of builds 1 to 3, before `ensureDelegationOnMint` was added.
    struct OldMintSettings {
        address[] receivers;
        uint256[] amounts;
    }

    PluginRepo internal repo;
    address internal newSetup;
    uint16 internal newBuild;
    address internal outsider = makeAddr("outsider");
    address internal voter = makeAddr("voter");

    function setUp() public {
        require(block.chainid == 137, "Rehearsal for Polygon: run it after `just switch polygon`");
        repo = PluginRepo(vm.envAddress("TOKEN_VOTING_PLUGIN_REPO_ADDRESS"));
        DAO managementDao = DAO(payable(vm.envAddress("MANAGEMENT_DAO_ADDRESS")));
        address managementMultisig = vm.envAddress("MANAGEMENT_DAO_MULTISIG_ADDRESS");

        // 1. Deploy, with the code `just deploy` runs.
        newSetup = new DeployTokenVotingScript().deployPluginSetup();

        // 2. Publish, with the action of the proposal `just upgrade-proposal` prints. The build metadata is
        //    pinned later, so a placeholder stands in.
        Action[] memory actions = new EncodeUpgradeProposalScript().publishActions(
            newSetup, repo, bytes("ipfs://build-metadata-not-pinned-yet"), PluginSettings.releaseMetadataUri()
        );
        uint256 buildsBefore = repo.buildCount(1);
        vm.prank(managementMultisig);
        managementDao.execute(bytes32(uint256(0xc01)), actions, 0);

        newBuild = uint16(repo.buildCount(1));
        assertEq(newBuild, buildsBefore + 1, "published as a new build");
        assertEq(repo.getVersion(_tag(newBuild)).pluginSetup, newSetup, "the new build is the deployed setup");
    }

    function test_updateFromBuild4_liveDao() public {
        assertEq(_initializedOf(LIVE_BUILD_4_PLUGIN), 3, "the live proxy is at version 3");

        _updateThroughPSP(LIVE_BUILD_4_DAO, LIVE_BUILD_4_PLUGIN, 4, new address[](0), "");

        _checkUpdated(LIVE_BUILD_4_DAO, LIVE_BUILD_4_PLUGIN);
        _checkAProposalExecutes(LIVE_BUILD_4_DAO, LIVE_BUILD_4_PLUGIN);
    }

    /// A proposal created and partly voted on at build 4 keeps its dates, votes and actions across the
    /// update, takes the remaining votes at the new build and executes once it ends.
    function test_proposalInFlightSurvivesTheUpdate_liveBuild4Dao() public {
        TokenVoting tokenVoting = TokenVoting(LIVE_BUILD_4_PLUGIN);
        address token = address(tokenVoting.getVotingToken());
        bytes memory settingsBefore = _settingsOf(tokenVoting);

        // Three voters well above the existing supply: first 1 part, then 1/100 of a part against, then 2 parts.
        uint256 part = IERC20Upgradeable(token).totalSupply() * 10 + 1e24;
        address first = makeAddr("first voter");
        address against = makeAddr("voter against");
        address last = makeAddr("last voter");
        _giveVotingPower(LIVE_BUILD_4_DAO, token, first, part);
        _giveVotingPower(LIVE_BUILD_4_DAO, token, against, part / 100);
        _giveVotingPower(LIVE_BUILD_4_DAO, token, last, 2 * part);
        vm.prank(LIVE_BUILD_4_DAO);
        DAO(payable(LIVE_BUILD_4_DAO)).grant(LIVE_BUILD_4_PLUGIN, first, CREATE_PROPOSAL_PERMISSION_ID);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);

        ForkSink sink = new ForkSink();
        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: address(sink), value: 0, data: abi.encodeCall(ForkSink.ping, ())});
        vm.prank(first);
        uint256 proposalId =
            tokenVoting.createProposal("in flight", actions, 0, 0, 0, IMajorityVoting.VoteOption.None, false);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);
        vm.prank(first);
        tokenVoting.vote(proposalId, IMajorityVoting.VoteOption.Yes, false);
        vm.prank(against);
        tokenVoting.vote(proposalId, IMajorityVoting.VoteOption.No, false);
        bytes memory proposalBefore = _proposalOf(tokenVoting, proposalId);

        _updateThroughPSP(LIVE_BUILD_4_DAO, LIVE_BUILD_4_PLUGIN, 4, new address[](0), "");
        _checkUpdated(LIVE_BUILD_4_DAO, LIVE_BUILD_4_PLUGIN);

        assertEq(_proposalOf(tokenVoting, proposalId), proposalBefore, "proposal unchanged by the update");
        assertEq(_settingsOf(tokenVoting), settingsBefore, "settings unchanged by the update");
        assertEq(address(tokenVoting.getVotingToken()), token, "same voting token");
        assertEq(uint8(tokenVoting.getVoteOption(proposalId, first)), uint8(IMajorityVoting.VoteOption.Yes));
        assertEq(uint8(tokenVoting.getVoteOption(proposalId, against)), uint8(IMajorityVoting.VoteOption.No));

        // The remaining vote, at the new build.
        vm.prank(last);
        tokenVoting.vote(proposalId, IMajorityVoting.VoteOption.Yes, false);
        (bool open,, MajorityVotingBase.ProposalParameters memory parameters, MajorityVotingBase.Tally memory tally,,,)
        = tokenVoting.getProposal(proposalId);
        assertTrue(open, "still open");
        assertEq(tally.yes, 3 * part, "yes = first + last");
        assertEq(tally.no, part / 100, "no = the vote against");
        assertEq(tally.abstain, 0);

        vm.warp(parameters.endDate);
        vm.roll(block.number + 1);
        tokenVoting.execute(proposalId);
        (, bool executed,,,,,) = tokenVoting.getProposal(proposalId);
        assertTrue(executed, "executed");
        assertEq(sink.hits(), 1, "the approved action ran");
    }

    function test_updateFromBuild3_newDao() public {
        address dao = _newDao();
        bytes memory installData = abi.encode(
            _votingSettings(),
            TokenVotingSetup.TokenSettings({addr: address(0), name: "Rehearsal", symbol: "RHS"}),
            OldMintSettings(new address[](0), new uint256[](0)),
            IPlugin.TargetConfig({target: dao, operation: IPlugin.Operation.Call}),
            uint256(0),
            bytes("")
        );
        (address plugin, address[] memory helpers) = _installThroughPSP(dao, 3, installData);
        assertEq(_initializedOf(plugin), 2, "build 3 leaves the proxy at version 2");

        _updateThroughPSP(dao, plugin, 3, helpers, "");

        _checkUpdated(dao, plugin);
        _checkAProposalExecutes(dao, plugin);
    }

    function test_updateFromBuild2_newDao() public {
        address dao = _newDao();
        bytes memory installData = abi.encode(
            _votingSettings(),
            TokenVotingSetup.TokenSettings({addr: address(0), name: "Rehearsal", symbol: "RHS"}),
            OldMintSettings(new address[](0), new uint256[](0))
        );
        (address plugin, address[] memory helpers) = _installThroughPSP(dao, 2, installData);

        bytes memory updateData =
            abi.encode(uint256(0), IPlugin.TargetConfig({target: dao, operation: IPlugin.Operation.Call}), bytes(""));
        _updateThroughPSP(dao, plugin, 2, helpers, updateData);

        _checkUpdated(dao, plugin);
        _checkAProposalExecutes(dao, plugin);
    }

    // --- Steps ---

    /// A DAO from the live DAOFactory, with no plugin. The DAO holds ROOT on itself.
    function _newDao() internal returns (address) {
        (DAO dao,) = daoFactory.createDao(
            DAOFactory.DAOSettings({trustedForwarder: address(0), daoURI: "", subdomain: "", metadata: ""}),
            new DAOFactory.PluginSettings[](0)
        );
        return address(dao);
    }

    /// Installs `build` of the live repo on `dao` through the PSP, acting as the DAO.
    function _installThroughPSP(address dao, uint16 build, bytes memory data)
        internal
        returns (address plugin, address[] memory helpers)
    {
        IPluginSetup.PreparedSetupData memory prepared;
        (plugin, prepared) = pluginSetupProcessor.prepareInstallation(
            dao, PluginSetupProcessor.PrepareInstallationParams({pluginSetupRef: _ref(build), data: data})
        );
        vm.startPrank(dao);
        DAO(payable(dao)).grant(dao, address(pluginSetupProcessor), ROOT_PERMISSION_ID);
        pluginSetupProcessor.applyInstallation(
            dao,
            PluginSetupProcessor.ApplyInstallationParams({
                pluginSetupRef: _ref(build),
                plugin: plugin,
                permissions: prepared.permissions,
                helpersHash: hashHelpers(prepared.helpers)
            })
        );
        DAO(payable(dao)).revoke(dao, address(pluginSetupProcessor), ROOT_PERMISSION_ID);
        vm.stopPrank();
        helpers = prepared.helpers;
    }

    /// Updates `plugin` from `fromBuild` to the new build through the PSP, with the temporary permissions
    /// an update proposal grants and revokes around `applyUpdate`, acting as the DAO.
    function _updateThroughPSP(
        address dao,
        address plugin,
        uint16 fromBuild,
        address[] memory currentHelpers,
        bytes memory data
    ) internal {
        vm.roll(block.number + 1); // the PSP refuses a setup prepared in the block of the last applied one

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) = pluginSetupProcessor.prepareUpdate(
            dao,
            PluginSetupProcessor.PrepareUpdateParams({
                currentVersionTag: _tag(fromBuild),
                newVersionTag: _tag(newBuild),
                pluginSetupRepo: repo,
                setupPayload: IPluginSetup.SetupPayload({plugin: plugin, currentHelpers: currentHelpers, data: data})
            })
        );

        vm.startPrank(dao);
        DAO(payable(dao)).grant(plugin, address(pluginSetupProcessor), UPGRADE_PLUGIN_PERMISSION_ID);
        DAO(payable(dao)).grant(dao, address(pluginSetupProcessor), ROOT_PERMISSION_ID);
        pluginSetupProcessor.applyUpdate(
            dao,
            PluginSetupProcessor.ApplyUpdateParams({
                plugin: plugin,
                pluginSetupRef: _ref(newBuild),
                initData: initData,
                permissions: prepared.permissions,
                helpersHash: hashHelpers(prepared.helpers)
            })
        );
        DAO(payable(dao)).revoke(dao, address(pluginSetupProcessor), ROOT_PERMISSION_ID);
        DAO(payable(dao)).revoke(plugin, address(pluginSetupProcessor), UPGRADE_PLUGIN_PERMISSION_ID);
        vm.stopPrank();
    }

    // --- Checks ---

    /// The plugin runs the new build, its reinitializer is used up, and an outsider can't call
    /// `initializeFrom`.
    function _checkUpdated(address dao, address plugin) internal {
        assertEq(TokenVoting(plugin).implementation(), IPluginSetup(newSetup).implementation(), "on the new build");
        assertEq(_initializedOf(plugin), 3, "the reinitializer is used up");

        bytes memory foreignInitData = abi.encode(
            uint256(0), IPlugin.TargetConfig({target: outsider, operation: IPlugin.Operation.DelegateCall}), ""
        );
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(DaoUnauthorized.selector, dao, plugin, outsider, UPGRADE_PLUGIN_PERMISSION_ID)
        );
        TokenVoting(plugin).initializeFrom(1, foreignInitData);
    }

    /// A voter given most of the voting power creates a proposal, it passes, and its action runs.
    function _checkAProposalExecutes(address dao, address plugin) internal {
        TokenVoting tokenVoting = TokenVoting(plugin);
        _giveMostVotingPower(dao, address(tokenVoting.getVotingToken()));
        vm.prank(dao);
        DAO(payable(dao)).grant(plugin, voter, CREATE_PROPOSAL_PERMISSION_ID);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);

        ForkSink sink = new ForkSink();
        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: address(sink), value: 0, data: abi.encodeCall(ForkSink.ping, ())});
        vm.prank(voter);
        uint256 proposalId = tokenVoting.createProposal("", actions, 0, 0, 0, IMajorityVoting.VoteOption.Yes, false);

        vm.roll(block.number + 1);
        vm.warp(block.timestamp + tokenVoting.minDuration() + 1);
        tokenVoting.execute(proposalId);
        assertEq(sink.hits(), 1, "the approved action ran");
    }

    /// Gives the voter most of the supply.
    function _giveMostVotingPower(address dao, address token) internal {
        _giveVotingPower(dao, token, voter, IERC20Upgradeable(token).totalSupply() * 10 + 1e24);
    }

    /// Mints to `account` when the DAO can (a GovernanceERC20), or wraps underlying tokens for it (a
    /// GovernanceWrappedERC20), then self-delegates.
    function _giveVotingPower(address dao, address token, address account, uint256 amount) internal {
        (bool wrapped, bytes memory result) = token.staticcall(abi.encodeWithSignature("underlying()"));
        if (wrapped && result.length == 32) {
            address underlying = abi.decode(result, (address));
            deal(underlying, account, amount);
            vm.startPrank(account);
            IERC20Upgradeable(underlying).approve(token, amount);
            GovernanceWrappedERC20(token).depositFor(account, amount);
            vm.stopPrank();
        } else {
            vm.prank(dao);
            GovernanceERC20(token).mint(account, amount);
        }
        vm.prank(account);
        IVotesUpgradeable(token).delegate(account);
    }

    // --- Helpers ---

    /// Every voting setting the plugin exposes, encoded for comparison.
    function _settingsOf(TokenVoting tokenVoting) internal view returns (bytes memory) {
        return abi.encode(
            tokenVoting.votingMode(),
            tokenVoting.supportThreshold(),
            tokenVoting.minParticipation(),
            tokenVoting.minApproval(),
            tokenVoting.minDuration(),
            tokenVoting.minProposerVotingPower(),
            tokenVoting.getTargetConfig()
        );
    }

    /// Everything `getProposal` returns, encoded for comparison.
    function _proposalOf(TokenVoting tokenVoting, uint256 proposalId) internal view returns (bytes memory) {
        (
            bool open,
            bool executed,
            MajorityVotingBase.ProposalParameters memory parameters,
            MajorityVotingBase.Tally memory tally,
            Action[] memory actions,
            uint256 allowFailureMap,
            IPlugin.TargetConfig memory targetConfig
        ) = tokenVoting.getProposal(proposalId);
        return abi.encode(open, executed, parameters, tally, actions, allowFailureMap, targetConfig);
    }

    function _votingSettings() internal pure returns (MajorityVotingBase.VotingSettings memory) {
        return MajorityVotingBase.VotingSettings({
            votingMode: MajorityVotingBase.VotingMode.Standard,
            supportThreshold: 500_000,
            minParticipation: 100_000,
            minDuration: 1 hours,
            minProposerVotingPower: 0
        });
    }

    function _tag(uint16 build) internal pure returns (PluginRepo.Tag memory) {
        return PluginRepo.Tag({release: 1, build: build});
    }

    function _ref(uint16 build) internal view returns (PluginSetupRef memory) {
        return PluginSetupRef({versionTag: _tag(build), pluginSetupRepo: repo});
    }

    /// OpenZeppelin 4.9 `Initializable` keeps `_initialized` in the lowest byte of slot 0.
    function _initializedOf(address plugin) internal view returns (uint8) {
        return uint8(uint256(vm.load(plugin, 0)));
    }
}
