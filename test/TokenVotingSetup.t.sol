// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {TestBase} from "./lib/TestBase.sol";

import {SimpleBuilder} from "./builders/SimpleBuilder.sol";
import {TokenVotingSetup as PluginSetupContract} from "../src/TokenVotingSetup.sol";
import {TokenVoting} from "../src/TokenVoting.sol";
import {MajorityVotingBase} from "../src/base/MajorityVotingBase.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {PermissionLib} from "@aragon/osx-commons-contracts/src/permission/PermissionLib.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract TokenVotingSetupTest is TestBase {
    // Permission IDs
    bytes32 constant UPDATE_VOTING_SETTINGS_PERMISSION_ID = keccak256("UPDATE_VOTING_SETTINGS_PERMISSION");
    bytes32 constant CREATE_PROPOSAL_PERMISSION_ID = keccak256("CREATE_PROPOSAL_PERMISSION");
    bytes32 constant EXECUTE_PROPOSAL_PERMISSION_ID = keccak256("EXECUTE_PROPOSAL_PERMISSION");
    bytes32 constant MINT_PERMISSION_ID = keccak256("MINT_PERMISSION");
    bytes32 constant SET_METADATA_PERMISSION_ID = keccak256("SET_METADATA_PERMISSION");
    bytes32 constant SET_TARGET_CONFIG_PERMISSION_ID = keccak256("SET_TARGET_CONFIG_PERMISSION");

    address private constant ANY_ADDR = address(type(uint160).max);

    PluginSetupContract internal pluginSetup;
    GovernanceERC20 internal governanceERC20Base;
    GovernanceWrappedERC20 internal governanceWrappedERC20Base;
    DAO internal dao;

    // Default settings
    MajorityVotingBase.VotingSettings internal defaultVotingSettings;
    PluginSetupContract.TokenSettings internal defaultTokenSettings;
    GovernanceERC20.MintSettings internal defaultMintSettings;
    IPlugin.TargetConfig internal defaultTargetConfig;
    uint256 internal defaultMinApproval;
    bytes internal defaultMetadata;
    address[] defaultExcludedAccounts;

    function setUp() public {
        // Deploy DAO
        (dao,,,) = new SimpleBuilder().withDaoOwner(address(this)).build();

        // Deploy base contracts
        governanceERC20Base = new GovernanceERC20(
            IDAO(address(0)),
            "G",
            "G",
            GovernanceERC20.MintSettings(new address[](0), new uint256[](0)),
            new address[](0)
        );
        governanceWrappedERC20Base = new GovernanceWrappedERC20(IERC20Upgradeable(address(0x1)), "WG", "WG");

        // Deploy PluginSetup
        pluginSetup = new PluginSetupContract(governanceERC20Base, governanceWrappedERC20Base);

        // Default settings
        defaultVotingSettings = MajorityVotingBase.VotingSettings({
            votingMode: MajorityVotingBase.VotingMode.EarlyExecution,
            supportThreshold: 500_000,
            minParticipation: 200_000,
            minDuration: 1 hours,
            minProposerVotingPower: 0
        });
        defaultTokenSettings = PluginSetupContract.TokenSettings({addr: address(0), name: "MyToken", symbol: "TKN"});
        defaultMintSettings = GovernanceERC20.MintSettings({receivers: new address[](0), amounts: new uint256[](0)});
        defaultTargetConfig = IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call});
        defaultMinApproval = 300_000;
        defaultMetadata = "0x11";
        defaultExcludedAccounts = new address[](0);
    }

    function _getInstallationData() internal view returns (bytes memory) {
        return abi.encode(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata
        );
    }

    function _assertPermission(
        PermissionLib.MultiTargetPermission memory p,
        PermissionLib.Operation op,
        address where,
        address who,
        address condition,
        bytes32 permissionId
    ) internal pure {
        assertEq(uint8(p.operation), uint8(op), "permission op mismatch");
        assertEq(p.where, where, "permission where mismatch");
        assertEq(p.who, who, "permission who mismatch");
        assertEq(p.condition, condition, "permission condition mismatch");
        assertEq(p.permissionId, permissionId, "permissionId mismatch");
    }

    function test_WhenCallingSupportsInterface0xffffffff() external view {
        // It does not support the empty interface
        assertFalse(pluginSetup.supportsInterface(0xffffffff));
    }

    function test_WhenCallingGovernanceERC20BaseAndGovernanceWrappedERC20BaseAfterInitialization() external view {
        // It stores the bases provided through the constructor
        assertEq(pluginSetup.governanceERC20Base(), address(governanceERC20Base));
        assertEq(pluginSetup.governanceWrappedERC20Base(), address(governanceWrappedERC20Base));
    }

    modifier givenTheContextIsPrepareInstallation() {
        _;
    }

    function test_WhenCallingPrepareInstallationWithDataThatIsEmptyOrNotOfMinimumLength()
        external
        givenTheContextIsPrepareInstallation
    {
        // It fails if data is empty, or not of minimum length
        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), "");

        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), "0x1234");

        // And it should not revert with correct data
        pluginSetup.prepareInstallation(address(dao), _getInstallationData());
    }

    function test_WhenCallingPrepareInstallationIfMintSettingsArraysDoNotHaveTheSameLength()
        external
        givenTheContextIsPrepareInstallation
    {
        // It fails if `MintSettings` arrays do not have the same length
        defaultMintSettings.receivers = new address[](1);
        defaultMintSettings.amounts = new uint256[](0);

        vm.expectRevert(abi.encodeWithSelector(GovernanceERC20.MintSettingsArrayLengthMismatch.selector, 1, 0));
        pluginSetup.prepareInstallation(address(dao), _getInstallationData());
    }

    function test_WhenCallingPrepareInstallationIfPassedTokenAddressIsNotAContract()
        external
        givenTheContextIsPrepareInstallation
    {
        // It fails if passed token address is not a contract
        defaultTokenSettings.addr = alice; // EOA is not a contract

        vm.expectRevert(abi.encodeWithSelector(PluginSetupContract.TokenNotContract.selector, alice));
        pluginSetup.prepareInstallation(address(dao), _getInstallationData());
    }

    function test_WhenCallingPrepareInstallationIfPassedTokenAddressIsNotERC20()
        external
        givenTheContextIsPrepareInstallation
    {
        // It fails if passed token address is not ERC20
        defaultTokenSettings.addr = address(dao); // DAO is a contract but not ERC20

        vm.expectRevert(abi.encodeWithSelector(PluginSetupContract.TokenNotERC20.selector, address(dao)));
        pluginSetup.prepareInstallation(address(dao), _getInstallationData());
    }

    function test_WhenCallingPrepareInstallationAndAnERC20TokenAddressIsSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        // It correctly returns plugin, helpers and permissions, when an ERC20 token address is supplied
        ERC20Mock erc20 = new ERC20Mock("Mock Token", "MTK");
        defaultTokenSettings.addr = address(erc20);
        bytes memory data = _getInstallationData();

        uint256 nonce = vm.getNonce(address(pluginSetup));
        address anticipatedWrappedTokenAddress = vm.computeCreateAddress(address(pluginSetup), nonce);
        address anticipatedPluginAddress = vm.computeCreateAddress(address(pluginSetup), nonce + 1);
        address anticipatedCondition = vm.computeCreateAddress(address(pluginSetup), nonce + 2);

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), data);

        assertEq(plugin, anticipatedPluginAddress);
        assertEq(prepared.helpers.length, 2);
        assertEq(prepared.helpers[0], anticipatedCondition);
        assertEq(prepared.helpers[1], anticipatedWrappedTokenAddress);

        assertEq(prepared.permissions.length, 6);
        _assertPermission(
            prepared.permissions[0],
            PermissionLib.Operation.Grant,
            plugin,
            address(dao),
            address(0),
            TokenVoting(plugin).UPDATE_VOTING_SETTINGS_PERMISSION_ID()
        );
        _assertPermission(
            prepared.permissions[1],
            PermissionLib.Operation.Grant,
            address(dao),
            plugin,
            address(0),
            dao.EXECUTE_PERMISSION_ID()
        );
        _assertPermission(
            prepared.permissions[2],
            PermissionLib.Operation.GrantWithCondition,
            plugin,
            ANY_ADDR,
            anticipatedCondition,
            TokenVoting(plugin).CREATE_PROPOSAL_PERMISSION_ID()
        );
        _assertPermission(
            prepared.permissions[3],
            PermissionLib.Operation.Grant,
            plugin,
            address(dao),
            address(0),
            TokenVoting(plugin).SET_TARGET_CONFIG_PERMISSION_ID()
        );
        _assertPermission(
            prepared.permissions[4],
            PermissionLib.Operation.Grant,
            plugin,
            address(dao),
            address(0),
            TokenVoting(plugin).SET_METADATA_PERMISSION_ID()
        );
        _assertPermission(
            prepared.permissions[5],
            PermissionLib.Operation.Grant,
            plugin,
            ANY_ADDR,
            address(0),
            TokenVoting(plugin).EXECUTE_PROPOSAL_PERMISSION_ID()
        );
    }

    function test_WhenCallingPrepareInstallationAndAnERC20TokenAddressIsSupplied2()
        external
        givenTheContextIsPrepareInstallation
    {
        // It correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied
        ERC20Mock erc20 = new ERC20Mock("Mock Token", "MTK");
        defaultTokenSettings.addr = address(erc20);
        defaultTokenSettings.name = "My Wrapped Token";
        defaultTokenSettings.symbol = "wTKN";

        (, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), _getInstallationData());

        GovernanceWrappedERC20 wrappedToken = GovernanceWrappedERC20(prepared.helpers[1]);

        assertEq(wrappedToken.name(), "My Wrapped Token");
        assertEq(wrappedToken.symbol(), "wTKN");
        assertEq(address(wrappedToken.underlying()), address(erc20));
        assertTrue(wrappedToken.supportsInterface(type(IVotesUpgradeable).interfaceId));
    }

    function test_WhenCallingPrepareInstallationAndAGovernanceTokenAddressIsSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        // It correctly returns plugin, helpers and permissions, when a governance token address is supplied
        GovernanceERC20 govToken =
            new GovernanceERC20(IDAO(address(dao)), "Test", "TST", defaultMintSettings, defaultExcludedAccounts);
        defaultTokenSettings.addr = address(govToken);
        bytes memory data = _getInstallationData();

        uint256 nonce = vm.getNonce(address(pluginSetup));
        address anticipatedPluginAddress = vm.computeCreateAddress(address(pluginSetup), nonce);
        address anticipatedCondition = vm.computeCreateAddress(address(pluginSetup), nonce + 1);

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), data);

        assertEq(plugin, anticipatedPluginAddress);
        assertEq(prepared.helpers.length, 2);
        assertEq(prepared.helpers[0], anticipatedCondition);
        assertEq(prepared.helpers[1], address(govToken));
        assertEq(prepared.permissions.length, 6);
    }

    function test_WhenCallingPrepareInstallationAndATokenAddressIsNotSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        // It correctly returns plugin, helpers and permissions, when a token address is not supplied
        defaultTokenSettings.addr = address(0);
        bytes memory data = _getInstallationData();

        uint256 nonce = vm.getNonce(address(pluginSetup));
        address anticipatedTokenAddress = vm.computeCreateAddress(address(pluginSetup), nonce);
        address anticipatedPluginAddress = vm.computeCreateAddress(address(pluginSetup), nonce + 1);
        address anticipatedCondition = vm.computeCreateAddress(address(pluginSetup), nonce + 2);

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), data);

        assertEq(plugin, anticipatedPluginAddress);
        assertEq(prepared.helpers.length, 2);
        assertEq(prepared.helpers[0], anticipatedCondition);
        assertEq(prepared.helpers[1], anticipatedTokenAddress);

        assertEq(prepared.permissions.length, 7);
        _assertPermission(
            prepared.permissions[6],
            PermissionLib.Operation.Grant,
            anticipatedTokenAddress,
            address(dao),
            address(0),
            MINT_PERMISSION_ID
        );
    }

    function test_WhenCallingPrepareInstallationAndATokenAddressIsNotPassed()
        external
        givenTheContextIsPrepareInstallation
    {
        // It correctly sets up the plugin and helpers, when a token address is not passed
        defaultTokenSettings.addr = address(0);
        (address pluginAddr, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), _getInstallationData());

        TokenVoting plugin = TokenVoting(pluginAddr);
        GovernanceERC20 token = GovernanceERC20(prepared.helpers[1]);

        assertEq(address(plugin.dao()), address(dao));
        assertEq(uint8(plugin.votingMode()), uint8(defaultVotingSettings.votingMode));
        assertEq(address(plugin.getVotingToken()), address(token));
        address target = plugin.getTargetConfig().target;
        assertEq(target, defaultTargetConfig.target);
        assertEq(address(token.dao()), address(dao));
        assertEq(token.name(), defaultTokenSettings.name);
        assertEq(token.symbol(), defaultTokenSettings.symbol);
    }

    modifier givenTheContextIsPrepareUpdate() {
        _;
    }

    function test_WhenCallingPrepareUpdateForAnUpdateFromBuild1() external givenTheContextIsPrepareUpdate {
        // It returns the permissions expected for the update from build 1
        TokenVoting plugin;
        (dao, plugin,,) = new SimpleBuilder().build();

        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload = IPluginSetup.SetupPayload({
            plugin: address(plugin),
            currentHelpers: new address[](2),
            data: updateInnerData
        });

        uint256 nonce = vm.getNonce(address(pluginSetup));
        address anticipatedCondition = vm.computeCreateAddress(address(pluginSetup), nonce);

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 1, updatePayload);

        assertEq(initData, abi.encodeWithSelector(TokenVoting.initializeFrom.selector, 1, updateInnerData));
        assertEq(prepared.helpers.length, 1);
        assertEq(prepared.helpers[0], anticipatedCondition);
        assertEq(prepared.permissions.length, 5);

        _assertPermission(
            prepared.permissions[0],
            PermissionLib.Operation.Revoke,
            address(plugin),
            address(dao),
            address(0),
            keccak256("UPGRADE_PLUGIN_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[1],
            PermissionLib.Operation.GrantWithCondition,
            address(plugin),
            ANY_ADDR,
            anticipatedCondition,
            keccak256("CREATE_PROPOSAL_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[2],
            PermissionLib.Operation.Grant,
            address(plugin),
            address(dao),
            address(0),
            keccak256("SET_TARGET_CONFIG_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[3],
            PermissionLib.Operation.Grant,
            address(plugin),
            address(dao),
            address(0),
            keccak256("SET_METADATA_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[4],
            PermissionLib.Operation.Grant,
            address(plugin),
            ANY_ADDR,
            address(0),
            keccak256("EXECUTE_PROPOSAL_PERMISSION")
        );
    }

    function test_WhenCallingPrepareUpdateForAnUpdateFromBuild2() external givenTheContextIsPrepareUpdate {
        // It returns the permissions expected for the update from build 2
        TokenVoting plugin;
        (dao, plugin,,) = new SimpleBuilder().build();

        uint256 nonce = vm.getNonce(address(pluginSetup));
        address anticipatedCondition = vm.computeCreateAddress(address(pluginSetup), nonce);

        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload = IPluginSetup.SetupPayload({
            plugin: address(plugin),
            currentHelpers: new address[](2),
            data: updateInnerData
        });

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 2, updatePayload);

        assertEq(initData, abi.encodeWithSelector(TokenVoting.initializeFrom.selector, 2, updateInnerData));
        assertEq(prepared.permissions.length, 5);

        _assertPermission(
            prepared.permissions[0],
            PermissionLib.Operation.Revoke,
            address(plugin),
            address(dao),
            address(0),
            keccak256("UPGRADE_PLUGIN_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[1],
            PermissionLib.Operation.GrantWithCondition,
            address(plugin),
            ANY_ADDR,
            anticipatedCondition,
            keccak256("CREATE_PROPOSAL_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[2],
            PermissionLib.Operation.Grant,
            address(plugin),
            address(dao),
            address(0),
            keccak256("SET_TARGET_CONFIG_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[3],
            PermissionLib.Operation.Grant,
            address(plugin),
            address(dao),
            address(0),
            keccak256("SET_METADATA_PERMISSION")
        );
        _assertPermission(
            prepared.permissions[4],
            PermissionLib.Operation.Grant,
            address(plugin),
            ANY_ADDR,
            address(0),
            keccak256("EXECUTE_PROPOSAL_PERMISSION")
        );
    }

    function test_WhenCallingPrepareUpdateForAnUpdateFromBuild3() external givenTheContextIsPrepareUpdate {
        // It returns the permissions expected for the update from build 3 (empty list)
        address pluginAddr = makeAddr("plugin");
        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: new address[](2), data: updateInnerData});

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 3, updatePayload);

        assertEq(initData.length, 0);
        assertEq(prepared.helpers.length, 0);
        assertEq(prepared.permissions.length, 0);
    }

    modifier givenTheContextIsPrepareUninstallation() {
        _;
    }

    function test_WhenCallingPrepareUninstallationAndHelpersContainAGovernanceWrappedERC20Token()
        external
        givenTheContextIsPrepareUninstallation
    {
        // It correctly returns permissions, when the required number of helpers is supplied
        address pluginAddr = makeAddr("plugin");
        address conditionAddr = makeAddr("condition");
        GovernanceWrappedERC20 wrappedToken =
            new GovernanceWrappedERC20(IERC20Upgradeable(makeAddr("underlying")), "W", "W");

        address[] memory helpers = new address[](2);
        helpers[0] = conditionAddr;
        helpers[1] = address(wrappedToken);

        IPluginSetup.SetupPayload memory payload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: helpers, data: ""});

        PermissionLib.MultiTargetPermission[] memory permissions =
            pluginSetup.prepareUninstallation(address(dao), payload);

        assertEq(permissions.length, 6);
        _assertPermission(
            permissions[0],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            address(dao),
            address(0),
            UPDATE_VOTING_SETTINGS_PERMISSION_ID
        );
        _assertPermission(
            permissions[1],
            PermissionLib.Operation.Revoke,
            address(dao),
            pluginAddr,
            address(0),
            dao.EXECUTE_PERMISSION_ID()
        );
        _assertPermission(
            permissions[2],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            address(dao),
            address(0),
            SET_TARGET_CONFIG_PERMISSION_ID
        );
        _assertPermission(
            permissions[3],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            address(dao),
            address(0),
            SET_METADATA_PERMISSION_ID
        );
        _assertPermission(
            permissions[4],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            ANY_ADDR,
            address(0),
            CREATE_PROPOSAL_PERMISSION_ID
        );
        _assertPermission(
            permissions[5],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            ANY_ADDR,
            address(0),
            EXECUTE_PROPOSAL_PERMISSION_ID
        );
    }

    function test_WhenCallingPrepareUninstallationAndHelpersContainAGovernanceERC20Token()
        external
        givenTheContextIsPrepareUninstallation
    {
        // It correctly returns permissions, when the required number of helpers is supplied
        address pluginAddr = makeAddr("plugin");
        address conditionAddr = makeAddr("condition");
        GovernanceERC20 govToken =
            new GovernanceERC20(IDAO(address(dao)), "G", "G", defaultMintSettings, defaultExcludedAccounts);

        address[] memory helpers = new address[](2);
        helpers[0] = conditionAddr;
        helpers[1] = address(govToken);

        IPluginSetup.SetupPayload memory payload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: helpers, data: ""});

        PermissionLib.MultiTargetPermission[] memory permissions =
            pluginSetup.prepareUninstallation(address(dao), payload);

        // The list of permissions to revoke is identical regardless of the token type.
        assertEq(permissions.length, 6);
        _assertPermission(
            permissions[0],
            PermissionLib.Operation.Revoke,
            pluginAddr,
            address(dao),
            address(0),
            UPDATE_VOTING_SETTINGS_PERMISSION_ID
        );
    }

    function _encodeInstallData(
        MajorityVotingBase.VotingSettings memory _votingSettings,
        PluginSetupContract.TokenSettings memory _tokenSettings,
        GovernanceERC20.MintSettings memory _mintSettings,
        IPlugin.TargetConfig memory _targetConfig,
        uint256 _minApproval,
        bytes memory _metadata,
        address[] memory _excludedAccounts
    ) internal pure returns (bytes memory) {
        return abi.encode(
            _votingSettings, _tokenSettings, _mintSettings, _targetConfig, _minApproval, _metadata, _excludedAccounts
        );
    }

    function test_whenCallingBasesAfterInitialization_itStoresTheBasesProvided() external view {
        assertEq(pluginSetup.governanceERC20Base(), address(governanceERC20Base));
        assertEq(pluginSetup.governanceWrappedERC20Base(), address(governanceWrappedERC20Base));
    }

    function test_failsIfDataIsEmptyOrNotOfMinLength() external givenTheContextIsPrepareInstallation {
        bytes memory data = "";
        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), data);

        data = hex"000000"; // not min length
        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), data);
    }

    function test_failsIfMintSettingsArraysDoNotHaveTheSameLength() external givenTheContextIsPrepareInstallation {
        address[] memory receivers = new address[](1);
        receivers[0] = alice;
        defaultMintSettings.receivers = receivers;
        defaultMintSettings.amounts = new uint256[](2); // Mismatch

        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                GovernanceERC20.MintSettingsArrayLengthMismatch.selector,
                receivers.length,
                defaultMintSettings.amounts.length
            )
        );
        pluginSetup.prepareInstallation(address(dao), installData);
    }

    function test_failsIfPassedTokenAddressIsNotAContract() external givenTheContextIsPrepareInstallation {
        defaultTokenSettings.addr = alice; // EOA, not a contract
        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), installData);
    }

    function test_failsIfPassedTokenAddressIsNotERC20() external givenTheContextIsPrepareInstallation {
        // DAO contract is not an ERC20 token
        defaultTokenSettings.addr = address(dao);
        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        vm.expectRevert();
        pluginSetup.prepareInstallation(address(dao), installData);
    }

    function test_correctlyReturnsPluginHelpersAndPermissions_whenAnERC20TokenAddressIsSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        ERC20Mock erc20 = new ERC20Mock("Test", "TST");
        defaultTokenSettings.addr = address(erc20);

        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), installData);

        assertTrue(plugin != address(0));
        assertEq(prepared.helpers.length, 2, "Should have 2 helpers (Condition, GovernanceWrappedERC20)");
        assertEq(prepared.permissions.length, 6, "Should have 6 permissions");
    }

    function test_correctlySetsUpGovernanceWrappedERC20Helper_whenAnERC20TokenAddressIsSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        ERC20Mock erc20 = new ERC20Mock("Test", "TST");
        defaultTokenSettings.addr = address(erc20);

        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (, IPluginSetup.PreparedSetupData memory prepared) = pluginSetup.prepareInstallation(address(dao), installData);

        assertEq(prepared.helpers.length, 2, "Should have 2 helpers (Condition, GovernanceWrappedERC20)");
        address helperAddr = prepared.helpers[1];
        GovernanceWrappedERC20 wrappedToken = GovernanceWrappedERC20(helperAddr);

        assertEq(address(wrappedToken.underlying()), address(erc20), "Underlying token should match");
        assertEq(wrappedToken.name(), defaultTokenSettings.name, "Wrapped token name should match");
        assertEq(wrappedToken.symbol(), defaultTokenSettings.symbol, "Wrapped token symbol should match");
    }

    function test_correctlyReturnsPluginHelpersAndPermissions_whenAGovernanceTokenAddressIsSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        (,, IVotesUpgradeable govToken,) = new SimpleBuilder().build();
        defaultTokenSettings.addr = address(govToken);

        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), installData);

        assertTrue(plugin != address(0));
        assertEq(prepared.helpers.length, 2, "Should have 2 helpers");
        assertEq(prepared.permissions.length, 6, "Should have 6 permissions");
    }

    function test_correctlyReturnsPluginHelpersAndPermissions_whenATokenAddressIsNotSupplied()
        external
        givenTheContextIsPrepareInstallation
    {
        defaultTokenSettings.addr = address(0);
        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), installData);

        assertTrue(plugin != address(0));
        assertEq(prepared.helpers.length, 2, "Should have 2 helpers");
        assertEq(prepared.permissions.length, 7, "Should have 7 permissions (including MINT)");
    }

    function test_correctlySetsUpThePluginAndHelpers_whenATokenAddressIsNotPassed()
        external
        givenTheContextIsPrepareInstallation
    {
        defaultTokenSettings.addr = address(0);
        address[] memory receivers = new address[](2);
        receivers[0] = alice;
        receivers[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100 ether;
        amounts[1] = 200 ether;
        defaultMintSettings.receivers = receivers;
        defaultMintSettings.amounts = amounts;

        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (address pluginAddr, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), installData);

        assertEq(prepared.helpers.length, 2, "Should have 2 helpers (Condition, GovernanceERC20)");

        address helperAddr = prepared.helpers[1];
        GovernanceERC20 newToken = GovernanceERC20(helperAddr);
        TokenVoting plugin = TokenVoting(pluginAddr);

        assertEq(newToken.name(), defaultTokenSettings.name, "New token name should match");
        assertEq(newToken.symbol(), defaultTokenSettings.symbol, "New token symbol should match");
        assertEq(address(plugin.getVotingToken()), helperAddr, "Plugin should point to the new token");
    }

    function test_returnsThePermissionsExpectedForTheUpdateFromBuild1() external givenTheContextIsPrepareUpdate {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: new address[](2), data: updateInnerData});

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 1, updatePayload);

        assertEq(initData.length, 260);
        assertEq(prepared.helpers.length, 1);
        assertEq(prepared.permissions.length, 5); // 1 revoke, 4 grants
    }

    function test_returnsThePermissionsExpectedForTheUpdateFromBuild2() external givenTheContextIsPrepareUpdate {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: new address[](2), data: updateInnerData});

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 2, updatePayload);

        assertTrue(initData.length > 0);
        assertEq(prepared.helpers.length, 1); // VotingPowerCondition
        assertEq(prepared.permissions.length, 5); // 1 revoke, 4 grants
    }

    function test_returnsThePermissionsExpectedForTheUpdateFromBuild3() external givenTheContextIsPrepareUpdate {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        bytes memory updateInnerData =
            abi.encode(uint256(0), IPlugin.TargetConfig(address(0), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: new address[](2), data: updateInnerData});

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 3, updatePayload);

        assertEq(initData.length, 0);
        assertEq(prepared.helpers.length, 0);
        assertEq(prepared.permissions.length, 0);
    }

    function test_correctlyReturnsPermissions_whenUninstallationAndHelpersContainGovernanceWrappedERC20()
        external
        givenTheContextIsPrepareUninstallation
    {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        address[] memory helpers = new address[](1);
        helpers[0] = address(governanceWrappedERC20Base);

        IPluginSetup.SetupPayload memory payload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: helpers, data: ""});

        PermissionLib.MultiTargetPermission[] memory permissions =
            pluginSetup.prepareUninstallation(address(dao), payload);

        assertEq(permissions.length, 6, "Should revoke 6 permissions");
    }

    function test_correctlyReturnsPermissions_whenUninstallationAndHelpersContainGovernanceERC20()
        external
        givenTheContextIsPrepareUninstallation
    {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        address[] memory helpers = new address[](1);
        helpers[0] = address(governanceERC20Base);

        IPluginSetup.SetupPayload memory payload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: helpers, data: ""});

        PermissionLib.MultiTargetPermission[] memory permissions =
            pluginSetup.prepareUninstallation(address(dao), payload);

        assertEq(permissions.length, 6, "Should revoke 6 permissions");
    }

    modifier givenTheInstallationParametersAreDefined() {
        address[] memory receivers = new address[](2);
        receivers[0] = alice;
        receivers[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 200e18;
        defaultMintSettings = GovernanceERC20.MintSettings(receivers, amounts);
        _;
    }

    function test_WhenCallingEncodeInstallationParametersWithTheParameters()
        external
        givenTheInstallationParametersAreDefined
    {
        bytes memory encodedData = pluginSetup.encodeInstallationParameters(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        bytes memory expectedData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        assertEq(encodedData, expectedData, "Encoded data does not match expected ABI encoding");
    }

    function test_WhenCallingDecodeInstallationParametersWithTheEncodedData()
        external
        givenTheInstallationParametersAreDefined
    {
        bytes memory encodedData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );

        (
            MajorityVotingBase.VotingSettings memory votingSettings,
            PluginSetupContract.TokenSettings memory tokenSettings,
            GovernanceERC20.MintSettings memory mintSettings,
            IPlugin.TargetConfig memory targetConfig,
            uint256 minApproval,
            bytes memory metadata,
            address[] memory excludedAccounts
        ) = pluginSetup.decodeInstallationParameters(encodedData);

        assertEq(uint8(votingSettings.votingMode), uint8(defaultVotingSettings.votingMode));
        assertEq(votingSettings.supportThreshold, defaultVotingSettings.supportThreshold);
        assertEq(votingSettings.minParticipation, defaultVotingSettings.minParticipation);
        assertEq(tokenSettings.addr, defaultTokenSettings.addr);
        assertEq(tokenSettings.name, defaultTokenSettings.name);
        assertEq(tokenSettings.symbol, defaultTokenSettings.symbol);
        assertEq(mintSettings.receivers.length, defaultMintSettings.receivers.length);
        assertEq(mintSettings.receivers[0], defaultMintSettings.receivers[0]);
        assertEq(mintSettings.amounts[1], defaultMintSettings.amounts[1]);
        assertEq(excludedAccounts.length, defaultExcludedAccounts.length);
        assertEq(targetConfig.target, defaultTargetConfig.target);
        assertEq(uint256(targetConfig.operation), uint256(defaultTargetConfig.operation));
        assertEq(minApproval, defaultMinApproval);
        assertEq(metadata, defaultMetadata);
    }

    modifier givenTheInstallationRequestIsForANewToken() {
        defaultTokenSettings.addr = address(0);
        address[] memory receivers = new address[](1);
        receivers[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        defaultMintSettings = GovernanceERC20.MintSettings(receivers, amounts);
        _;
    }

    function test_WhenCallingPrepareInstallation_shouldReturnCorrectPermissionsForNewToken()
        external
        givenTheInstallationRequestIsForANewToken
    {
        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );
        (, IPluginSetup.PreparedSetupData memory prepared) = pluginSetup.prepareInstallation(address(dao), installData);
        assertEq(
            prepared.permissions.length,
            7,
            "Should return exactly 7 permissions to be granted, including one for minting"
        );
    }

    modifier givenTheInstallationRequestIsForAnExistingIVotescompliantToken() {
        (,, IVotesUpgradeable govToken,) = new SimpleBuilder().build();
        defaultTokenSettings.addr = address(govToken);
        _;
    }

    function test_WhenCallingPrepareInstallation_shouldReturnCorrectPermissionsForExistingToken()
        external
        givenTheInstallationRequestIsForAnExistingIVotescompliantToken
    {
        bytes memory installData = _encodeInstallData(
            defaultVotingSettings,
            defaultTokenSettings,
            defaultMintSettings,
            defaultTargetConfig,
            defaultMinApproval,
            defaultMetadata,
            defaultExcludedAccounts
        );
        (address plugin, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareInstallation(address(dao), installData);
        assertTrue(plugin != address(0));
        assertEq(prepared.helpers.length, 2);
        assertEq(
            prepared.permissions.length,
            6,
            "Should return exactly 6 permissions to be granted and NOT deploy a new token"
        );
    }

    modifier givenAPluginIsBeingUpdatedFromABuildVersionLessThan3() {
        // This modifier is intentionally left empty for clarity in test definitions.
        _;
    }

    function test_WhenCallingPrepareUpdateWithFromBuild2_returnsCorrectDataAndPermissions()
        external
        givenAPluginIsBeingUpdatedFromABuildVersionLessThan3
    {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        address[] memory currentHelpers = new address[](2);

        bytes memory updateInnerData =
            abi.encode(uint256(2), IPlugin.TargetConfig(address(dao), IPlugin.Operation.Call), "");
        IPluginSetup.SetupPayload memory updatePayload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: currentHelpers, data: updateInnerData});

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) =
            pluginSetup.prepareUpdate(address(dao), 2, updatePayload);

        assertTrue(initData.length > 0, "Should return init data for update");
        assertEq(prepared.helpers.length, 1, "Should return a new VotingPowerCondition helper");
        assertEq(prepared.permissions.length, 5, "Should return 5 permission changes (1 revoke and 4 grants)");
    }

    modifier givenAPluginIsBeingUninstalled() {
        address[] memory helpers = new address[](1);
        // Simulate a new token installation to get a helper address.
        // The address itself is what matters for the uninstallation logic branch.
        helpers[0] = address(governanceERC20Base);
        vm.store(address(pluginSetup), bytes32(uint256(uint160(address(dao)))), bytes32(uint256(uint160(helpers[0]))));
        _;
    }

    function test_WhenCallingPrepareUninstallation_returnsCorrectPermissions() external {
        (, TokenVoting plugin,,) = new SimpleBuilder().build();
        address pluginAddr = address(plugin);
        address[] memory helpers = new address[](1);
        helpers[0] = address(new GovernanceERC20(dao, "T", "T", defaultMintSettings, defaultExcludedAccounts));

        IPluginSetup.SetupPayload memory payload =
            IPluginSetup.SetupPayload({plugin: pluginAddr, currentHelpers: helpers, data: ""});

        PermissionLib.MultiTargetPermission[] memory permissions =
            pluginSetup.prepareUninstallation(address(dao), payload);

        assertEq(permissions.length, 6, "Should return exactly 6 permissions to be revoked");

        helpers[0] = address(new GovernanceWrappedERC20(IERC20Upgradeable(address(new ERC20Mock("", ""))), "WT", "WT"));
        permissions = pluginSetup.prepareUninstallation(address(dao), payload);
        assertEq(permissions.length, 6, "Should return exactly 6 permissions to be revoked");
    }

    modifier givenATokenContractThatImplementsTheIVotesInterfaceFunctions() {
        // This modifier is intentionally left empty for clarity in test definitions.
        _;
    }

    function test_WhenCallingSupportsIVotesInterfaceWithAnIVotesToken_returnsTrue() external {
        (,, IVotesUpgradeable govToken,) = new SimpleBuilder().build();
        assertTrue(pluginSetup.supportsIVotesInterface(address(govToken)));
    }

    modifier givenATokenContractThatDoesNotImplementTheIVotesInterfaceFunctions() {
        // This modifier is intentionally left empty for clarity in test definitions.
        _;
    }

    function test_WhenCallingSupportsIVotesInterfaceWithANonIVotesToken_returnsFalse() external {
        ERC20Mock nonVotesToken = new ERC20Mock("Test", "TST");
        assertFalse(pluginSetup.supportsIVotesInterface(address(nonVotesToken)));
    }
}
