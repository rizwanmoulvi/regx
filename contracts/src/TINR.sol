// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title tINR: test rupee stablecoin used as the cash leg on RegX (testnet only, no value).
contract TINR is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 1_000_000e6; // ₹10 lakh per faucet call

    constructor() ERC20("RegX Test Rupee", "tINR") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Open faucet so judges can try the app with their own wallet.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
