# Solidity API

## TokenVotingSetup

The setup contract of the `TokenVoting` plugin.

_v1.3 (Release 1, Build 3)_

### governanceERC20Base

```solidity
address governanceERC20Base
```

The address of the `GovernanceERC20` base contract.

### governanceWrappedERC20Base

```solidity
address governanceWrappedERC20Base
```

The address of the `GovernanceWrappedERC20` base contract.

### TokenSettings

```solidity
struct TokenSettings {
  address addr;
  string name;
  string symbol;
}
```

### TokenNotContract

```solidity
error TokenNotContract(address token)
```

Thrown if the passed token address is not a token contract.

#### Parameters

| Name  | Type    | Description       |
| ----- | ------- | ----------------- |
| token | address | The token address |

### TokenNotERC20

```solidity
error TokenNotERC20(address token)
```

Thrown if token address is not ERC20.

#### Parameters

| Name  | Type    | Description       |
| ----- | ------- | ----------------- |
| token | address | The token address |

### constructor

```solidity
constructor(contract GovernanceERC20 _governanceERC20Base, contract GovernanceWrappedERC20 _governanceWrappedERC20Base) public
```

The contract constructor deploying the plugin implementation contract
and receiving the governance token base contracts to clone from.

#### Parameters

| Name                         | Type                            | Description                                                       |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| \_governanceERC20Base        | contract GovernanceERC20        | The base `GovernanceERC20` contract to create clones from.        |
| \_governanceWrappedERC20Base | contract GovernanceWrappedERC20 | The base `GovernanceWrappedERC20` contract to create clones from. |

### prepareInstallation

```solidity
function prepareInstallation(address _dao, bytes _data) external returns (address plugin, struct IPluginSetup.PreparedSetupData preparedSetupData)
```

Prepares the installation of a plugin.

#### Parameters

| Name   | Type    | Description                                                                                                                        |
| ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| \_dao  | address | The address of the installing DAO.                                                                                                 |
| \_data | bytes   | The bytes-encoded data containing the input parameters for the installation as specified in the plugin's build metadata JSON file. |

#### Return Values

| Name              | Type                                  | Description                                                                    |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| plugin            | address                               | The address of the `Plugin` contract being prepared for installation.          |
| preparedSetupData | struct IPluginSetup.PreparedSetupData | The deployed plugin's relevant data which consists of helpers and permissions. |

### prepareUpdate

```solidity
function prepareUpdate(address _dao, uint16 _fromBuild, struct IPluginSetup.SetupPayload _payload) external returns (bytes initData, struct IPluginSetup.PreparedSetupData preparedSetupData)
```

Prepares the update of a plugin.

_Revoke the upgrade plugin permission to the DAO for all builds prior the current one (3)._

#### Parameters

| Name        | Type                             | Description                                                     |
| ----------- | -------------------------------- | --------------------------------------------------------------- |
| \_dao       | address                          | The address of the updating DAO.                                |
| \_fromBuild | uint16                           | The build number of the plugin to update from.                  |
| \_payload   | struct IPluginSetup.SetupPayload | The relevant data necessary for the `prepareUpdate`. See above. |

#### Return Values

| Name              | Type                                  | Description                                                                                                             |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| initData          | bytes                                 | The initialization data to be passed to upgradeable contracts when the update is applied in the `PluginSetupProcessor`. |
| preparedSetupData | struct IPluginSetup.PreparedSetupData | The deployed plugin's relevant data which consists of helpers and permissions.                                          |

### prepareUninstallation

```solidity
function prepareUninstallation(address _dao, struct IPluginSetup.SetupPayload _payload) external view returns (struct PermissionLib.MultiTargetPermission[] permissions)
```

Prepares the uninstallation of a plugin.

#### Parameters

| Name      | Type                             | Description                                                             |
| --------- | -------------------------------- | ----------------------------------------------------------------------- |
| \_dao     | address                          | The address of the uninstalling DAO.                                    |
| \_payload | struct IPluginSetup.SetupPayload | The relevant data necessary for the `prepareUninstallation`. See above. |

#### Return Values

| Name        | Type                                         | Description                                                                                                            |
| ----------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| permissions | struct PermissionLib.MultiTargetPermission[] | The array of multi-targeted permission operations to be applied by the `PluginSetupProcessor` to the uninstalling DAO. |

### supportsIVotesInterface

```solidity
function supportsIVotesInterface(address token) public view returns (bool)
```

Unsatisfiably determines if the token is an IVotes interface.

_Many tokens don't use ERC165 even though they still support IVotes._
