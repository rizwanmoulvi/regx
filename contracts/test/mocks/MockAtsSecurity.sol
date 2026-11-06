// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IIR {
    function isVerified(address) external view returns (bool);
    function identity(address) external view returns (address);
}

interface IMC {
    function canTransfer(address, address, uint256) external view returns (bool);
    function transferred(address, address, uint256) external;
    function created(address, uint256) external;
}

/// @dev Minimal stand-in for an ATS bond, mirroring ATS's transfer checks (ERC1594StorageWrapper):
///      operator compliance via canTransfer(sender, 0, 0), identity of from/to via isVerified,
///      transfer compliance via canTransfer(from, to, value), the compliance hooks, and freezes.
contract MockAtsSecurity is ERC20 {
    IIR public identityRegistry;
    IMC public compliance;
    mapping(address => bool) public isFrozen;

    error AddressNotVerified(address);
    error ComplianceNotAllowed(address, address, uint256);
    error AccountFrozen(address);

    constructor(IIR ir, IMC mc) ERC20("Mock Bond", "MBOND") {
        identityRegistry = ir;
        compliance = mc;
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external {
        if (!identityRegistry.isVerified(to)) revert AddressNotVerified(to);
        _mint(to, amount);
        compliance.created(to, amount);
    }

    function setAddressFrozen(address a, bool f) external {
        isFrozen[a] = f;
    }

    function canTransferFrom(address from, address to, uint256 value, bytes calldata)
        external
        view
        returns (bool, bytes1, bytes32)
    {
        (bool ok, bytes4 code) = _check(msg.sender, from, to, value);
        return (ok, ok ? bytes1(0x01) : bytes1(0x50), bytes32(code));
    }

    function _check(address sender, address from, address to, uint256 value) internal view returns (bool, bytes4) {
        if (sender != from && !compliance.canTransfer(sender, address(0), 0)) {
            return (false, ComplianceNotAllowed.selector);
        }
        if (isFrozen[from] || isFrozen[to]) return (false, AccountFrozen.selector);
        if (!identityRegistry.isVerified(from) || !identityRegistry.isVerified(to)) {
            return (false, AddressNotVerified.selector);
        }
        if (!compliance.canTransfer(from, to, value)) return (false, ComplianceNotAllowed.selector);
        return (true, bytes4(0));
    }

    function _beforeTokenTransfer(address from, address to, uint256 value) internal view override {
        if (from == address(0) || to == address(0)) return;
        (bool ok, bytes4 code) = _check(msg.sender, from, to, value);
        if (!ok) {
            assembly {
                mstore(0, code)
                revert(0, 4)
            }
        }
    }

    function _afterTokenTransfer(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) compliance.transferred(from, to, value);
    }
}
