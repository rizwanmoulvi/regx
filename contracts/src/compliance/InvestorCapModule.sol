// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {AbstractModule} from "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModule.sol";
import {IModularCompliance} from "@tokenysolutions/t-rex/contracts/compliance/modular/IModularCompliance.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title InvestorCapModule: ERC-3643 (T-REX) compliance module limiting any single wallet's holding.
/// @notice Concentration limit typical of private placements: no investor may hold more than
///         `maxHolding` units of the bound security.
/// @dev Stateless (reads the bound token's `balanceOf`), so it can be plugged into a compliance that is
///      already bound to a live token. ATS also calls `canTransfer(operator, address(0), 0)` to check a
///      transfer's operator (e.g. the RegX DvP contract), and this module allows that call.
///      Stock T-REX modules that resolve the recipient's identity revert on it.
contract InvestorCapModule is AbstractModule {
    mapping(address => uint256) public maxHolding; // compliance => cap (token base units)

    event MaxHoldingSet(address indexed compliance, uint256 maxHolding);

    /// @notice Set the cap. Must be called by the compliance (via `callModuleFunction`, owner only).
    function setMaxHolding(uint256 _max) external onlyComplianceCall {
        maxHolding[msg.sender] = _max;
        emit MaxHoldingSet(msg.sender, _max);
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address, address _to, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        uint256 cap = maxHolding[_compliance];
        if (_to == address(0) || cap == 0) return true; // operator check / no cap configured
        address token = IModularCompliance(_compliance).getTokenBound();
        if (token == address(0)) return true;
        return IERC20(token).balanceOf(_to) + _value <= cap;
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "InvestorCapModule";
    }
}
