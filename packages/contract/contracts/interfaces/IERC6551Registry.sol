// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC6551Registry {
    event AccountCreated(
        address account,
        address implementation,
        uint256 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    );

    function createAccount(
        address implementation,
        uint256 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address account);

    function account(
        address implementation,
        uint256 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address account);
}

