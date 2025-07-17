# Test tree definitions

Below is the graphical summary of the tests described within [test/*.t.yaml](./test)

```
GovernanceERC20Test
├── Given The contract is being deployed with default mint settings
│   ├── When Calling initialize again
│   │   └── It reverts if trying to re-initialize
│   ├── When Checking the token name and symbol
│   │   └── It sets the token name and symbol
│   ├── When Checking the managing DAO
│   │   └── It sets the managing DAO
│   └── When Deploying with mismatched receivers and amounts arrays
│       └── It reverts if the `receivers` and `amounts` array lengths in the mint settings mismatch
├── Given The contract is being deployed with specific mint settings // initialize with ensureDelegationOnMint
│   ├── Given The ensureDelegationOnMint flag is set to true
│   │   └── When Deploying with initial balances
│   │       └── It self-delegates for all initial receivers
│   └── Given The ensureDelegationOnMint flag is set to false
│       └── When Deploying with initial balances 2
│           └── It does not delegate for any initial receivers
├── Given The contract is deployed // ERC-165
│   ├── When Calling supportsInterface with the empty interface
│   │   └── It does not support the empty interface
│   ├── When Calling supportsInterface with the IERC165Upgradeable interface
│   │   └── It supports the `IERC165Upgradeable` interface
│   └── When Calling supportsInterface with all inherited interfaces
│       └── It it supports all inherited interfaces
├── Given The contract is deployed 2 // mint
│   ├── Given The caller is missing the MINTPERMISSIONID
│   │   └── When Calling mint
│   │       └── It reverts if the `MINT_PERMISSION_ID` permission is missing
│   └── Given The caller has the MINTPERMISSIONID
│       └── When Calling mint 2
│           └── It mints tokens if the caller has the `mintPermission`
├── Given The contract is deployed with initial balances // delegate
│   ├── When Delegating voting power to another account
│   │   └── It delegates voting power to another account
│   └── When Delegating voting power multiple times
│       └── It is checkpointed
├── Given The contract was deployed with ensureDelegationOnMint as true // Delegation on mint
│   ├── Given The receiver has never had a delegate
│   │   └── When Minting tokens to the receiver
│   │       └── It self-delegates the receiver's voting power
│   ├── Given The receiver has already delegated to another account
│   │   └── When Minting tokens to the receiver 2
│   │       └── It does not change the existing delegation
│   └── Given The receiver has manually delegated to address0
│       └── When Minting tokens to the receiver 3
│           └── It self-delegates the receiver, overwriting the address(0) delegation
├── Given The contract was deployed with ensureDelegationOnMint as false // Delegation on mint
│   ├── Given The receiver has never had a delegate 2
│   │   └── When Minting tokens to the receiver 4
│   │       └── It does NOT self-delegate the receiver's voting power
│   └── Given The receiver has already delegated to another account 2
│       └── When Minting tokens to the receiver 5
│           └── It does not change the existing delegation
├── Given The contract is deployed 3 // Delegation on transfer (regression)
│   ├── Given The ensureDelegationOnMint flag is true
│   │   └── When Transferring tokens to a new address
│   │       └── It does NOT trigger self-delegation
│   └── Given The ensureDelegationOnMint flag is false
│       └── When Transferring tokens to a new address 2
│           └── It does NOT trigger self-delegation
├── Given A token is deployed and the main signer can mint // afterTokenTransfer
│   ├── When Minting tokens to an address for the first time
│   │   └── It turns on delegation after mint
│   ├── When Transferring tokens to an address for the first time
│   │   └── It turns on delegation for the `to` address after transfer
│   ├── When Performing a chain of transfers A  B  C
│   │   └── It turns on delegation for all users in the chain of transfer A => B => C
│   ├── Given The receiver has manually turned off delegation
│   │   ├── When Transferring tokens to the receiver
│   │   │   └── It should not turn on delegation on `transfer` if `to` manually turned it off
│   │   └── When Minting tokens to the receiver 6
│   │       └── It should not turn on delegation on `mint` if `to` manually turned it off
│   ├── Given A user has predelegated before receiving tokens
│   │   ├── When Transferring tokens to the user
│   │   │   └── It should not rewrite delegation setting for `transfer` if user set it on before receiving tokens
│   │   └── When Minting tokens to the user
│   │       └── It should not rewrite delegation setting for `mint` if user set it on before receiving tokens
│   ├── Given Delegation was turned on in the past
│   │   ├── When Minting more tokens
│   │   │   └── It should not turn on delegation on `mint` if it was turned on at least once in the past
│   │   └── When Transferring more tokens
│   │       └── It should not turn on delegation on `transfer` if it was turned on at least once in the past
│   ├── When Transferring tokens from an address with delegation turned on
│   │   └── It updates voting power after transfer for `from` if delegation turned on
│   └── When Transferring tokens to an address with delegation turned on
│       └── It updates voting power after transfer for `to` if delegation turned on
├── Given A token is deployed and the main signer can mint 2 // afterTokenTransfer - exhaustive tests
│   ├── Given The to address has a zero balance
│   │   ├── Given The to address has delegated to other
│   │   │   ├── When The to address receives tokens via mint
│   │   │   │   ├── It `to` has the correct voting power
│   │   │   │   ├── It `to`s delegate has not changed
│   │   │   │   └── It `to`s delegate has the correct voting power
│   │   │   └── When The to address receives tokens via transfer from from
│   │   │       ├── It `from` has the correct voting power
│   │   │       ├── It `from`s delegate has not changed
│   │   │       ├── It `from`s delegate has the correct voting power
│   │   │       ├── It `to` has the correct voting power
│   │   │       ├── It `to`s delegate has not changed
│   │   │       └── It `to`s delegate has the correct voting power
│   │   └── Given The to address has not delegated before
│   │       ├── When The to address receives tokens via mint 2
│   │       │   ├── It `to` has the correct voting power
│   │       │   ├── It `to`s delegate has not changed
│   │       │   └── It `to`s delegate has the correct voting power
│   │       └── When The to address receives tokens via transfer from from 2
│   │           ├── It `from` has the correct voting power
│   │           ├── It `from`s delegate has not changed
│   │           ├── It `from`s delegate has the correct voting power
│   │           ├── It `to` has the correct voting power
│   │           ├── It `to`s delegate has not changed
│   │           └── It `to`s delegate has the correct voting power
│   └── Given The to address has a nonzero balance
│       ├── Given The to address has delegated to other 2
│       │   ├── When The to address receives tokens via mint 3
│       │   │   ├── When The to address then transfers to other
│       │   │   │   ├── It `to` has the correct voting power
│       │   │   │   ├── It `to`s delegate has not changed
│       │   │   │   └── It `to`s delegate has the correct voting power
│       │   │   └── When The to address then delegates to other again
│       │   │       ├── It `to` has the correct voting power
│       │   │       ├── It `to`s delegate is correctly changed
│       │   │       └── It `to`s delegate has the correct voting power
│       │   └── When The to address receives tokens via transfer from from 3
│       │       ├── When The to address then transfers to other 2
│       │       │   ├── It `to` has the correct voting power
│       │       │   ├── It `to`s delegate has not changed
│       │       │   └── It `to`s delegate has the correct voting power
│       │       └── When The to address then delegates to other again 2
│       │           ├── It `to` has the correct voting power
│       │           ├── It `to`s delegate is correctly changed
│       │           └── It `to`s delegate has the correct voting power
│       └── Given The to address has not delegated before 2
│           ├── When The to address receives tokens via mint 4
│           │   ├── When The to address then transfers to other 3
│           │   │   ├── It `to` has the correct voting power
│           │   │   ├── It `to`s delegate has not changed
│           │   │   └── It `to`s delegate has the correct voting power
│           │   └── When The to address then delegates to other
│           │       ├── It `to` has the correct voting power
│           │       ├── It `to`s delegate is correctly changed
│           │       └── It `to`s delegate has the correct voting power
│           └── When The to address receives tokens via transfer from from 4
│               ├── When The to address then transfers to other 4
│               │   ├── It `to` has the correct voting power
│               │   ├── It `to`s delegate has not changed
│               │   └── It `to`s delegate has the correct voting power
│               └── When The to address then delegates to other 2
│                   ├── It `to` has the correct voting power
│                   ├── It `to`s delegate is correctly changed
│                   └── It `to`s delegate has the correct voting power
├── Given Minting is allowed
│   ├── Given Calling mint with the permission
│   │   └── It Should mint properly
│   ├── Given Calling mint without the permission
│   │   └── It Should revert
│   ├── Given Calling freezeMinting with the permission
│   │   └── It Should disallow mints from then on
│   └── Given Calling freezeMinting without the permission
│       └── It Should revert
└── Given Minting is frozen
    ├── Given Calling mint with the permission 2
    │   └── It Should revert
    ├── Given Calling mint without the permission 2
    │   └── It Should revert
    ├── Given Calling freezeMinting with the permission 2
    │   └── It Should do nothing
    └── Given Calling freezeMinting without the permission 2
        └── It Should revert
```
```
GovernanceWrappedERC20Test
├── Given The contract is already initialized // initialize
│   ├── When Calling initialize again
│   │   └── It reverts if trying to re-initialize
│   ├── When Checking the contracts name and symbol
│   │   └── It sets the wrapped token name and symbol
│   ├── When Checking the contracts decimals without modification
│   │   └── It should return default decimals if not modified
│   └── When Checking the contracts decimals after modification
│       └── It should return modified decimals
├── Given The contract is deployed // ERC-165
│   ├── When Calling supportsInterface with the empty interface
│   │   └── It does not support the empty interface
│   ├── When Calling supportsInterface with the IERC165Upgradeable interface
│   │   └── It supports the `IERC165Upgradeable` interface
│   ├── When Calling supportsInterface with the IGovernanceWrappedERC20 interface
│   │   └── It supports the `IGovernanceWrappedERC20` interface
│   ├── When Calling supportsInterface with the IERC20Upgradeable interface
│   │   └── It supports the `IERC20Upgradeable` interface
│   ├── When Calling supportsInterface with the IERC20PermitUpgradeable interface
│   │   └── It supports the `IERC20PermitUpgradeable` interface
│   ├── When Calling supportsInterface with the IVotesUpgradeable interface
│   │   └── It supports the `IVotesUpgradeable` interface
│   └── When Calling supportsInterface with the IERC20MetadataUpgradeable interface
│       └── It supports the `IERC20MetadataUpgradeable` interface
├── Given The contract is deployed 2 // depositFor
│   ├── Given The deposit amount is not approved
│   │   └── When Calling depositFor
│   │       └── It reverts if the amount is not approved
│   ├── Given The deposit amount is approved
│   │   └── When Calling depositFor 2
│   │       └── It deposits an amount of tokens
│   └── Given The full balance is approved for deposit
│       └── When Calling depositFor with the full balance
│           └── It updates the available votes
├── Given Tokens have been deposited // withdrawTo
│   ├── When Calling withdrawTo
│   │   └── It withdraws an amount of tokens
│   └── When Calling withdrawTo for the full balance
│       └── It updates the available votes
├── Given Tokens have been deposited and approved for all holders // delegate
│   ├── When Calling delegate
│   │   └── It delegates voting power to another account
│   └── When Calling delegate multiple times
│       └── It is checkpointed
├── Given A fresh token contract is deployed and balances are set // afterTokenTransfer
│   ├── When Minting tokens for a user
│   │   └── It turns on delegation after mint
│   ├── When Transferring tokens to a user for the first time
│   │   └── It turns on delegation for the `to` address after transfer
│   ├── When Transferring tokens through a chain of users
│   │   └── It turns on delegation for all users in the chain of transfer A => B => C
│   ├── Given The recipient has manually turned delegation off
│   │   ├── When Transferring tokens to the recipient
│   │   │   └── It should not turn on delegation on `transfer` if `to` manually turned it off
│   │   └── When Minting tokens for the recipient
│   │       └── It should not turn on delegation on `mint` if `to` manually turned it off
│   ├── Given The user has set a delegate before receiving tokens
│   │   ├── When Transferring tokens to the user
│   │   │   └── It should not rewrite delegation setting for `transfer` if user set it on before receiving tokens
│   │   └── When Minting tokens for the user
│   │       └── It should not rewrite delegation setting for `mint` if user set it on before receiving tokens
│   ├── Given Delegation was turned on in the past
│   │   ├── When Minting more tokens
│   │   │   └── It should not turn on delegation on `mint` if it was turned on at least once in the past
│   │   └── When Transferring tokens
│   │       └── It should not turn on delegation on `transfer` if it was turned on at least once in the past
│   ├── Given Delegation is turned on for the sender
│   │   └── When Transferring tokens 2
│   │       └── It updates voting power after transfer for `from` if delegation turned on
│   └── Given Delegation is turned on for the recipient
│       └── When Transferring tokens 3
│           └── It updates voting power after transfer for `to` if delegation turned on
└── Given An exhaustive test setup for token transfers // afterTokenTransfer exhaustive tests
    ├── Given The to address has a zero balance
    │   ├── Given The to address has delegated to other
    │   │   ├── When to receives tokens via depositFor
    │   │   │   ├── It `to` has the correct voting power
    │   │   │   ├── It `to`s delegate has not changed
    │   │   │   └── It `to`s delegate has the correct voting power
    │   │   └── When to receives tokens via transfer from from
    │   │       ├── It `from` has the correct voting power
    │   │       ├── It `from`s delegate has not changed
    │   │       ├── It `from`s delegate has the correct voting power
    │   │       ├── It `to` has the correct voting power
    │   │       ├── It `to`s delegate has not changed
    │   │       └── It `to`s delegate has the correct voting power
    │   └── Given The to address has not delegated before
    │       ├── When to receives tokens via depositFor 2
    │       │   ├── It `to` has the correct voting power
    │       │   ├── It `to`s delegate has not changed
    │       │   └── It `to`s delegate has the correct voting power
    │       └── When to receives tokens via transfer from from 2
    │           ├── It `from` has the correct voting power
    │           ├── It `from`s delegate has not changed
    │           ├── It `from`s delegate has the correct voting power
    │           ├── It `to` has the correct voting power
    │           ├── It `to`s delegate has not changed
    │           └── It `to`s delegate has the correct voting power
    └── Given The to address has a nonzero balance
        ├── Given The to address has delegated to other 2
        │   ├── When to receives more tokens via depositFor
        │   │   ├── When to then transfers tokens to other
        │   │   │   ├── It `to` has the correct voting power
        │   │   │   ├── It `to`s delegate has not changed
        │   │   │   └── It `to`s delegate has the correct voting power
        │   │   └── When to then redelegates to other
        │   │       ├── It `to` has the correct voting power
        │   │       ├── It `to`s delegate is correctly changed
        │   │       └── It `to`s delegate has the correct voting power
        │   └── When to receives more tokens via transfer from from
        │       ├── When to then transfers tokens to other 2
        │       │   ├── It `to` has the correct voting power
        │       │   ├── It `to`s delegate has not changed
        │       │   └── It `to`s delegate has the correct voting power
        │       └── When to then redelegates to other 2
        │           ├── It `to` has the correct voting power
        │           ├── It `to`s delegate is correctly changed
        │           └── It `to`s delegate has the correct voting power
        └── Given The to address has not delegated before receiving an initial balance
            ├── When to receives more tokens via depositFor 2
            │   ├── When to then transfers tokens to other 3
            │   │   ├── It `to` has the correct voting power
            │   │   ├── It `to`s delegate has not changed
            │   │   └── It `to`s delegate has the correct voting power
            │   └── When to then delegates to other
            │       ├── It `to` has the correct voting power
            │       ├── It `to`s delegate is correctly changed
            │       └── It `to`s delegate has the correct voting power
            └── When to receives more tokens via transfer from from 2
                ├── When to then transfers tokens to other 4
                │   ├── It `to` has the correct voting power
                │   ├── It `to`s delegate has not changed
                │   └── It `to`s delegate has the correct voting power
                └── When to then delegates to other 2
                    ├── It `to` has the correct voting power
                    ├── It `to`s delegate is correctly changed
                    └── It `to`s delegate has the correct voting power
```
```
MajorityVotingBaseTest
├── Given The contract is already initialized
│   └── When Calling initialize
│       └── It reverts if trying to re-initialize
├── Given The contract is deployed // ERC-165
│   ├── When Calling supportsInterface with the empty interface
│   │   └── It does not support the empty interface
│   ├── When Calling supportsInterface with the IERC165Upgradeable interface
│   │   └── It supports the `IERC165Upgradeable` interface
│   ├── When Calling supportsInterface with the IPlugin interface
│   │   └── It supports the `IPlugin` interface
│   ├── When Calling supportsInterface with the IProtocolVersion interface
│   │   └── It supports the `IProtocolVersion` interface
│   ├── When Calling supportsInterface with the IProposal interface
│   │   └── It supports the `IProposal` interface
│   ├── When Calling supportsInterface with the IMajorityVoting interface
│   │   └── It supports the `IMajorityVoting` interface
│   ├── When Calling supportsInterface with the IMajorityVoting OLD interface
│   │   └── It supports the `IMajorityVoting` OLD interface
│   ├── When Calling supportsInterface with the MajorityVotingBase interface
│   │   └── It supports the `MajorityVotingBase` interface
│   └── When Calling supportsInterface with the MajorityVotingBase OLD interface
│       └── It supports the `MajorityVotingBase` OLD interface
├── Given The plugin is initialized // updateVotingSettings
│   ├── Given The caller is unauthorized
│   │   └── When Calling updateVotingSettings
│   │       └── It reverts if caller is unauthorized
│   ├── When Calling updateVotingSettings where support threshold equals 100
│   │   └── It reverts if the support threshold specified equals 100%
│   ├── When Calling updateVotingSettings where support threshold exceeds 100
│   │   └── It reverts if the support threshold specified exceeds 100%
│   ├── When Calling updateVotingSettings where support threshold equals 100 2 // This is a duplicate test title from the source file, testing a threshold > 100%
│   │   └── It reverts if the support threshold specified equals 100%
│   ├── When Calling updateVotingSettings where minimum participation exceeds 100
│   │   └── It reverts if the minimum participation specified exceeds 100%
│   ├── When Calling updateVotingSettings where minimal duration is shorter than one hour
│   │   └── It reverts if the minimal duration is shorter than one hour
│   ├── When Calling updateVotingSettings where minimal duration is longer than one year
│   │   └── It reverts if the minimal duration is longer than one year
│   └── When Calling updateVotingSettings 2
│       └── It should change the voting settings successfully
├── Given The plugin is initialized 2 // updateMinApprovals
│   ├── Given The caller is unauthorized 2
│   │   └── When Calling updateMinApprovals
│   │       └── It reverts if caller is unauthorized
│   ├── When Calling updateMinApprovals where the minimum approval exceeds 100
│   │   └── It reverts if the minimum approval specified exceeds 100%
│   └── When Calling updateMinApprovals 2
│       └── It should change the minimum approval successfully
└── Given The plugin is initialized and the caller has the SETTARGETCONFIGPERMISSIONID // updateTargetConfig
    └── When Calling setTargetConfig
        └── It should change the target config successfully
```
```
TokenVotingTest
├── Given In the initialize context
│   ├── When Calling initialize on an already initialized plugin
│   │   └── It reverts if trying to re-initialize
│   ├── When Calling initialize on an uninitialized plugin
│   │   ├── It emits the `MembershipContractAnnounced` event
│   │   └── It sets the voting settings, token, minimal approval and metadata
│   ├── Given An IVotes compatible token
│   │   ├── When The token indexes by block number
│   │   │   └── It Should use block numbers for indexing
│   │   ├── When The token indexes by timestamp
│   │   │   └── It Should use timestamps for indexing
│   │   └── When The token does not report any clock data
│   │       └── It Should assume a block number indexing
│   ├── When Calling initialize with a list of excluded accounts
│   │   ├── It Should correctly add all provided addresses to the excludedAccounts set
│   │   ├── It Should emit an event
│   │   └── It Should allow an empty list of excluded accounts
│   └── When Calling initialize with duplicate addresses in the excluded accounts list
│       └── It Should store each address only once in the excludedAccounts set
├── Given In the ERC165 context
│   ├── When Calling supportsInterface0xffffffff
│   │   └── It does not support the empty interface
│   ├── When Calling supportsInterface for IERC165Upgradeable
│   │   └── It supports the `IERC165Upgradeable` interface
│   ├── When Calling supportsInterface for IPlugin
│   │   └── It supports the `IPlugin` interface
│   ├── When Calling supportsInterface for IProtocolVersion
│   │   └── It supports the `IProtocolVersion` interface
│   ├── When Calling supportsInterface for IProposal
│   │   └── It supports the `IProposal` interface
│   ├── When Calling supportsInterface for IMembership
│   │   └── It supports the `IMembership` interface
│   ├── When Calling supportsInterface for IMajorityVoting
│   │   └── It supports the `IMajorityVoting` interface
│   ├── When Calling supportsInterface for the old IMajorityVoting
│   │   └── It supports the `IMajorityVoting` OLD interface
│   ├── When Calling supportsInterface for MajorityVotingBase
│   │   └── It supports the `MajorityVotingBase` interface
│   ├── When Calling supportsInterface for the old MajorityVotingBase
│   │   └── It supports the `MajorityVotingBase` OLD interface
│   └── When Calling supportsInterface for TokenVoting
│       └── It supports the `TokenVoting` interface
├── Given In the isMember context
│   ├── When An account owns at least one token
│   │   └── It returns true if the account currently owns at least one token
│   └── When An account has at least one token delegated to them
│       └── It returns true if the account currently has at least one token delegated to her/him
├── Given In the IProposal Interface Function context for Proposal creation
│   ├── When Creating a proposal with custom encoded data
│   │   └── It creates proposal with default values if `data` param is encoded with custom values
│   └── When Creating a proposal with empty data
│       └── It creates proposal with default values if `data` param is passed as empty
├── Given Account exclusion
│   ├── When Calling totalVotingPower with no accounts in the excluded list
│   │   └── It Should return the token's past total supply
│   ├── When Calling totalVotingPower with one account in the excluded list
│   │   ├── Given The excluded account has voting power at the given timepoint
│   │   │   └── It Should return the token's past total supply minus the past votes of the excluded accounts
│   │   └── When Creating a proposal
│   │       ├── Given The total voting power after excluding accounts is greater than 0
│   │       │   ├── It Should create the proposal successfully
│   │       │   ├── It Should calculate minVotingPower based on the effective total voting power (after exclusions)
│   │       │   └── It Should calculate minApprovalPower based on the effective total voting power (after exclusions)
│   │       └── Given The total voting power after excluding accounts is 0
│   │           └── It Should revert with NoVotingPower()
│   ├── When Calling totalVotingPower with multiple accounts in the excluded list
│   │   └── It Should correctly subtract the past votes of all excluded accounts from the past total supply
│   └── When Calling totalVotingPower with an excluded account that has zero voting power at the timepoint
│       └── It Should produce the same result as if the account was not excluded
├── Given In the Proposal creation context
│   ├── Given minProposerVotingPower  0
│   │   └── When The creator has no voting power
│   │       └── It creates a proposal if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block
│   ├── Given minProposerVotingPower  0 2
│   │   ├── When The creator has no voting power 2
│   │   │   └── It reverts if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block
│   │   ├── When The creator transfers their voting power away in the same block // This test uses evm_setAutomine to ensure transactions are in the same block.
│   │   │   └── It reverts if `_msgSender` owns no tokens and has no tokens delegated to her/him in the current block although having them in the last block
│   │   ├── When The creator owns enough tokens
│   │   │   └── It creates a proposal if `_msgSender` owns enough tokens in the current block
│   │   ├── When The creator owns enough tokens and has delegated them
│   │   │   └── It creates a proposal if `_msgSender` owns enough tokens and has delegated them to someone else in the current block
│   │   ├── When The creator has enough delegated tokens
│   │   │   └── It creates a proposal if `_msgSender` owns no tokens but has enough tokens delegated to her/him in the current block
│   │   └── When The creator does not have enough tokens owned or delegated
│   │       └── It reverts if `_msgSender` does not own enough tokens herself/himself and has not tokens delegated to her/him in the current block
│   ├── When The total token supply is 0
│   │   └── It reverts if the total token supply is 0
│   ├── When The start date is smaller than the current date
│   │   └── It reverts if the start date is set smaller than the current date
│   ├── When The start date would cause an overflow when calculating the end date
│   │   └── It panics if the start date is after the latest start date
│   ├── When The end date is before the minimum duration
│   │   └── It reverts if the end date is before the earliest end date so that min duration cannot be met
│   ├── When The start and end dates are provided as zero
│   │   └── It sets the startDate to now and endDate to startDate + minDuration, if zeros are provided as an inputs
│   ├── When minParticipation calculation results in a remainder
│   │   └── It ceils the `minVotingPower` value if it has a remainder
│   ├── When minParticipation calculation does not result in a remainder
│   │   └── It does not ceil the `minVotingPower` value if it has no remainder
│   ├── When Creating a proposal with VoteOptionNone
│   │   └── It should create a proposal successfully, but not vote
│   ├── When Creating a proposal with a vote option eg Yes
│   │   └── It should create a vote and cast a vote immediately
│   └── When Creating a proposal with a vote option before its start date
│       └── It reverts creation when voting before the start date
├── Given In the Standard Voting Mode
│   ├── When Interacting with a nonexistent proposal
│   │   └── It reverts if proposal does not exist
│   ├── When Voting before the proposal has started
│   │   └── It does not allow voting, when the vote has not started yet
│   ├── When A user with 0 tokens tries to vote
│   │   └── It should not be able to vote if user has 0 token
│   ├── When Multiple users vote Yes No and Abstain
│   │   └── It increases the yes, no, and abstain count and emits correct events
│   ├── When A user tries to vote with VoteOptionNone
│   │   └── It reverts on voting None
│   ├── When A user tries to replace their existing vote
│   │   └── It reverts on vote replacement
│   ├── When A proposal meets execution criteria before the end date
│   │   └── It cannot early execute
│   ├── When A proposal meets participation and support thresholds after the end date
│   │   └── It can execute normally if participation and support are met
│   ├── When Voting with the tryEarlyExecution option
│   │   └── It does not execute early when voting with the `tryEarlyExecution` option
│   ├── When Trying to execute a proposal that is not yet decided
│   │   └── It reverts if vote is not decided yet
│   ├── When The proposal passed but didnt finish yet
│   │   ├── It hasSucceeded returns false
│   │   └── It can not execute
│   └── When The caller does not have EXECUTEPROPOSALPERMISSIONID
│       └── It can not execute even if participation and support are met when caller does not have permission
├── Given In the Early Execution Voting Mode
│   ├── When Interacting with a nonexistent proposal 2
│   │   └── It reverts if proposal does not exist
│   ├── When Voting before the proposal has started 2
│   │   └── It does not allow voting, when the vote has not started yet
│   ├── When A user with 0 tokens tries to vote 2
│   │   └── It should not be able to vote if user has 0 token
│   ├── When Multiple users vote Yes No and Abstain 2
│   │   └── It increases the yes, no, and abstain count and emits correct events
│   ├── When A user tries to vote with VoteOptionNone 2
│   │   └── It reverts on voting None
│   ├── When A user tries to replace their existing vote 2
│   │   └── It reverts on vote replacement
│   ├── When Participation is large enough to make the outcome unchangeable
│   │   └── It can execute early if participation is large enough
│   ├── When Participation and support are met after the voting period ends
│   │   └── It can execute normally if participation is large enough
│   ├── When Participation is too low even if support is met
│   │   └── It cannot execute normally if participation is too low
│   ├── When The target operation is a delegatecall
│   │   └── It executes target with delegate call
│   ├── When The vote is decided early and the tryEarlyExecution option is used
│   │   └── It executes the vote immediately when the vote is decided early and the tryEarlyExecution options is selected
│   ├── When Trying to execute a proposal that is not yet decided 2
│   │   └── It reverts if vote is not decided yet
│   └── When The caller has no execution permission but tryEarlyExecution is selected
│       └── It record vote correctly without executing even when tryEarlyExecution options is selected
├── Given In the Vote Replacement Voting Mode
│   ├── When Interacting with a nonexistent proposal 3
│   │   └── It reverts if proposal does not exist
│   ├── When Voting before the proposal has started 3
│   │   └── It does not allow voting, when the vote has not started yet
│   ├── When A user with 0 tokens tries to vote 3
│   │   └── It should not be able to vote if user has 0 token
│   ├── When Multiple users vote Yes No and Abstain 3
│   │   └── It increases the yes, no, and abstain count and emits correct events
│   ├── When A user tries to vote with VoteOptionNone 3
│   │   └── It reverts on voting None
│   ├── When A voter changes their vote multiple times
│   │   └── It should allow vote replacement but not double-count votes by the same address
│   ├── When A proposal meets execution criteria before the end date 2
│   │   └── It cannot early execute
│   ├── When A proposal meets participation and support thresholds after the end date 2
│   │   └── It can execute normally if participation and support are met
│   ├── When Voting with the tryEarlyExecution option 2
│   │   └── It does not execute early when voting with the `tryEarlyExecution` option
│   └── When Trying to execute a proposal that is not yet decided 3
│       └── It reverts if vote is not decided yet
├── Given A simple majority vote with 50 support 25 participation required and minimal approval  21
│   ├── When Support is high but participation is too low
│   │   └── It does not execute if support is high enough but participation is too low
│   ├── When Support and participation are high but minimal approval is too low
│   │   └── It does not execute if support and participation are high enough but minimal approval is too low
│   ├── When Participation is high but support is too low
│   │   └── It does not execute if participation is high enough but support is too low
│   ├── When Participation and minimal approval are high but support is too low
│   │   └── It does not execute if participation and minimal approval are high enough but support is too low
│   ├── When All thresholds participation support minimal approval are met after the duration
│   │   └── It executes after the duration if participation, support and minimal approval are met
│   └── When All thresholds are met and the outcome cannot change
│       └── It executes early if participation, support and minimal approval are met and the vote outcome cannot change anymore
├── Given An edge case with supportThreshold  0 minParticipation  0 minApproval  0 in early execution mode
│   ├── When There are 0 votes
│   │   └── It does not execute with 0 votes
│   └── When There is at least one Yes vote
│       └── It executes if participation, support and min approval are met
├── Given An edge case with supportThreshold  999999 minParticipation  100 and minApproval  100 in early execution mode
│   ├── Given Token balances are in the magnitude of 1018
│   │   ├── When The number of Yes votes is one shy of ensuring the support threshold cannot be defeated
│   │   │   └── It early support criterion is sharp by 1 vote
│   │   └── When The number of casted votes is one shy of 100 participation
│   │       └── It participation criterion is sharp by 1 vote
│   └── Given Token balances are in the magnitude of 106
│       ├── When The number of Yes votes is one shy of ensuring the support threshold cannot be defeated 2
│       │   └── It early support criterion is sharp by 1 vote
│       └── When The number of casted votes is one shy of 100 participation 2
│           └── It participation is not met with 1 vote missing
└── Given Execution criteria multiple orders of magnitude
    ├── When Testing with a magnitude of 100
    │   └── It magnitudes of 10^0
    ├── When Testing with a magnitude of 101
    │   └── It magnitudes of 10^1
    ├── When Testing with a magnitude of 102
    │   └── It magnitudes of 10^2
    ├── When Testing with a magnitude of 103
    │   └── It magnitudes of 10^3
    ├── When Testing with a magnitude of 106
    │   └── It magnitudes of 10^6
    ├── When Testing with a magnitude of 1012
    │   └── It magnitudes of 10^12
    ├── When Testing with a magnitude of 1018
    │   └── It magnitudes of 10^18
    ├── When Testing with a magnitude of 1024
    │   └── It magnitudes of 10^24
    ├── When Testing with a magnitude of 1036
    │   └── It magnitudes of 10^36
    ├── When Testing with a magnitude of 1048
    │   └── It magnitudes of 10^48
    ├── When Testing with a magnitude of 1060
    │   └── It magnitudes of 10^60
    └── When Testing with a magnitude of 1066
        └── It magnitudes of 10^66
```
```
TokenVotingSetupTest
├── When Calling supportsInterface0xffffffff
│   └── It does not support the empty interface
├── When Calling governanceERC20Base and governanceWrappedERC20Base after initialization // This test is skipped if the network is ZkSync
│   └── It stores the bases provided through the constructor
├── Given The context is prepareInstallation
│   ├── When Calling prepareInstallation with data that is empty or not of minimum length
│   │   └── It fails if data is empty, or not of minimum length
│   ├── When Calling prepareInstallation if MintSettings arrays do not have the same length
│   │   └── It fails if `MintSettings` arrays do not have the same length
│   ├── When Calling prepareInstallation if passed token address is not a contract
│   │   └── It fails if passed token address is not a contract
│   ├── When Calling prepareInstallation if passed token address is not ERC20
│   │   └── It fails if passed token address is not ERC20
│   ├── When Calling prepareInstallation and an ERC20 token address is supplied
│   │   └── It correctly returns plugin, helpers and permissions, when an ERC20 token address is supplied
│   ├── When Calling prepareInstallation and an ERC20 token address is supplied 2
│   │   └── It correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied
│   ├── When Calling prepareInstallation and a governance token address is supplied
│   │   └── It correctly returns plugin, helpers and permissions, when a governance token address is supplied
│   ├── When Calling prepareInstallation and a token address is not supplied
│   │   └── It correctly returns plugin, helpers and permissions, when a token address is not supplied
│   ├── When Calling prepareInstallation and a token address is not passed
│   │   └── It correctly sets up the plugin and helpers, when a token address is not passed
│   ├── Given Creating a new token
│   │   ├── When The list of excluded accounts is not empty
│   │   │   ├── It Should prepare initialization data for the new GovernanceERC20 token that includes the excluded accounts for self-delegation
│   │   │   └── It Should prepare initialization data for the TokenVoting plugin that includes the same list of excluded accounts
│   │   ├── When The list of excluded accounts is empty
│   │   │   └── It Should prepare initialization data for both the token and plugin with an empty list of excluded accounts
│   │   └── When There are excluded accounts but no self delegation
│   │       └── It Should prepare initialization data for both the token and plugin with excluded accounts but no balance excluded
│   ├── When Calling prepareInstallation to use an existing token with a list of excluded accounts
│   │   ├── It Should prepare initialization data for the TokenVoting plugin that includes the list of excluded accounts
│   │   └── It Should not attempt to modify the existing token
│   └── Given A set of installation parameters including a list of excluded accounts
│       ├── When Calling encodeInstallationParameters
│       │   └── It Should produce a byte string containing all parameters, including the excluded accounts
│       └── When Calling decodeInstallationParameters on the encoded byte string
│           └── It Should correctly decode all original parameters, including the full list of excluded accounts
├── Given The context is prepareUpdate
│   ├── When Calling prepareUpdate for an update from build 1
│   │   └── It returns the permissions expected for the update from build 1
│   ├── When Calling prepareUpdate for an update from build 2
│   │   └── It returns the permissions expected for the update from build 2
│   └── When Calling prepareUpdate for an update from build 3
│       └── It returns the permissions expected for the update from build 3 (empty list)
├── Given The context is prepareUninstallation
│   ├── When Calling prepareUninstallation and helpers contain a GovernanceWrappedERC20 token
│   │   └── It correctly returns permissions, when the required number of helpers is supplied
│   └── When Calling prepareUninstallation and helpers contain a GovernanceERC20 token
│       └── It correctly returns permissions, when the required number of helpers is supplied
├── Given The installation parameters are defined
│   ├── When Calling encodeInstallationParameters with the parameters
│   │   └── It Should return the correct ABI-encoded byte representation
│   └── When Calling decodeInstallationParameters with the encoded data
│       └── It Should return the original installation parameters
├── Given The installation request is for a new token
│   └── When Calling prepareInstallation
│       └── It Should return exactly 7 permissions to be granted, including one for minting
├── Given The installation request is for an existing IVotescompliant token
│   └── When Calling prepareInstallation 2
│       └── It Should return exactly 6 permissions to be granted and NOT deploy a new token
├── Given A plugin is being updated from a build version less than 3
│   └── When Calling prepareUpdate with fromBuild  2
│       ├── It Should return the initData for the update and a new VotingPowerCondition helper
│       └── It Should return 5 permission changes (1 revoke and 4 grants)
├── Given A plugin is being uninstalled
│   └── When Calling prepareUninstallation
│       └── It Should return exactly 6 permissions to be revoked
├── Given A token contract that implements the IVotes interface functions
│   └── When Calling supportsIVotesInterface with the tokens address
│       └── It Should return true
└── Given A token contract that does not implement the IVotes interface functions
    └── When Calling supportsIVotesInterface with the tokens address 2
        └── It Should return false
```
```
TokenVotingSetupZkSyncTest
├── When Calling supportsInterface0xffffffff
│   └── It does not support the empty interface
├── Given The context is prepareInstallation
│   ├── When Calling prepareInstallation with data that is empty or not of minimum length
│   │   └── It fails if data is empty, or not of minimum length
│   ├── When Calling prepareInstallation if MintSettings arrays do not have the same length
│   │   └── It fails if `MintSettings` arrays do not have the same length
│   ├── When Calling prepareInstallation if passed token address is not a contract
│   │   └── It fails if passed token address is not a contract
│   ├── When Calling prepareInstallation if passed token address is not ERC20
│   │   └── It fails if passed token address is not ERC20
│   ├── When Calling prepareInstallation and an ERC20 token address is supplied
│   │   └── It correctly returns plugin, helpers and permissions, when an ERC20 token address is supplied
│   ├── When Calling prepareInstallation and an ERC20 token address is supplied 2
│   │   └── It correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied
│   ├── When Calling prepareInstallation and a governance token address is supplied
│   │   └── It correctly returns plugin, helpers and permissions, when a governance token address is supplied
│   ├── When Calling prepareInstallation and a token address is not supplied
│   │   └── It correctly returns plugin, helpers and permissions, when a token address is not supplied
│   ├── When Calling prepareInstallation and a token address is not passed
│   │   └── It correctly sets up the plugin and helpers, when a token address is not passed
│   ├── Given Creating a new token
│   │   ├── When The list of excluded accounts is not empty
│   │   │   ├── It Should prepare initialization data for the new GovernanceERC20 token that includes the excluded accounts for self-delegation
│   │   │   └── It Should prepare initialization data for the TokenVoting plugin that includes the same list of excluded accounts
│   │   └── When The list of excluded accounts is empty
│   │       └── It Should prepare initialization data for both the token and plugin with an empty list of excluded accounts
│   ├── When Calling prepareInstallation to use an existing token with a list of excluded accounts
│   │   ├── It Should prepare initialization data for the TokenVoting plugin that includes the list of excluded accounts
│   │   └── It Should not attempt to modify the existing token
│   └── Given A set of installation parameters including a list of excluded accounts
│       ├── When Calling encodeInstallationParameters
│       │   └── It Should produce a byte string containing all parameters, including the excluded accounts
│       ├── When Calling decodeInstallationParameters on the encoded byte string
│       │   └── It Should correctly decode all original parameters, including the full list of excluded accounts
│       └── When There are excluded accounts but no self delegation
│           └── It Should prepare initialization data for both the token and plugin with excluded accounts but no balance excluded
├── Given The context is prepareUpdate
│   ├── When Calling prepareUpdate for an update from build 1
│   │   └── It returns the permissions expected for the update from build 1
│   ├── When Calling prepareUpdate for an update from build 2
│   │   └── It returns the permissions expected for the update from build 2
│   └── When Calling prepareUpdate for an update from build 3
│       └── It returns the permissions expected for the update from build 3 (empty list)
├── Given The context is prepareUninstallation
│   ├── When Calling prepareUninstallation and helpers contain a GovernanceWrappedERC20 token
│   │   └── It correctly returns permissions, when the required number of helpers is supplied
│   └── When Calling prepareUninstallation and helpers contain a GovernanceERC20 token
│       └── It correctly returns permissions, when the required number of helpers is supplied
├── Given The installation parameters are defined
│   ├── When Calling encodeInstallationParameters with the parameters
│   │   └── It Should return the correct ABI-encoded byte representation
│   └── When Calling decodeInstallationParameters with the encoded data
│       └── It Should return the original installation parameters
├── Given The installation request is for a new token
│   └── When Calling prepareInstallation
│       └── It Should return exactly 7 permissions to be granted, including one for minting
├── Given The installation request is for an existing IVotescompliant token
│   └── When Calling prepareInstallation 2
│       └── It Should return exactly 6 permissions to be granted and NOT deploy a new token
├── Given A plugin is being updated from a build version less than 3
│   └── When Calling prepareUpdate with fromBuild  2
│       ├── It Should return the initData for the update and a new VotingPowerCondition helper
│       └── It Should return 5 permission changes (1 revoke and 4 grants)
├── Given A plugin is being uninstalled
│   └── When Calling prepareUninstallation
│       └── It Should return exactly 6 permissions to be revoked
├── Given A token contract that implements the IVotes interface functions
│   └── When Calling supportsIVotesInterface with the tokens address
│       └── It Should return true
└── Given A token contract that does not implement the IVotes interface functions
    └── When Calling supportsIVotesInterface with the tokens address 2
        └── It Should return false
```
```
UpgradingTest
├── When Upgrading to a new implementation
│   └── It upgrades to a new implementation
├── Given The contract is at R1 B1
│   └── When Upgrading with initializeFrom
│       ├── It Upgrades from R1 B1 with `initializeFrom`
│       ├── It The old `initialize` function fails during the upgrade
│       ├── It initializeFrom succeeds
│       ├── It protocol versions are updated correctly
│       ├── It new settings are applied
│       ├── It the original `initialize` function is disabled post-upgrade
│       └── It Should detect the token clock
├── Given The contract is at R1 B2
│   └── When Upgrading with initializeFrom 2
│       ├── It upgrades from R1 B2 with `initializeFrom`
│       ├── It The old `initialize` function fails during the upgrade
│       ├── It initializeFrom succeeds
│       ├── It protocol versions are updated correctly
│       ├── It new settings are applied
│       ├── It the original `initialize` function is disabled post-upgrade
│       └── It Should detect the token clock
└── Given The contract is at R1 B3
    └── When Upgrading with initializeFrom 3
        ├── It upgrades from R1 B3 with `initializeFrom`
        ├── It The old `initialize` function fails during the upgrade
        ├── It initializeFrom succeeds
        ├── It protocol versions are updated correctly
        ├── It settings remain
        ├── It the original `initialize` function is disabled post-upgrade
        └── It Should detect the token clock
```
```
PluginSetupForkTest
├── Given The deployer has all necessary permissions for installation and uninstallation
│   └── When Installing and then uninstalling the current build using an existing token
│       └── It installs & uninstalls the current build with a token
├── Given The deployer has all necessary permissions for installation and uninstallation 2
│   └── When Installing and then uninstalling the current build creating a new token
│       └── It installs & uninstalls the current build without a token
└── Given A previous plugin build 2 is installed and the deployer has update permissions
    └── When Updating from build 2 to the current build
        └── It updates from build 2 to the current build
```
