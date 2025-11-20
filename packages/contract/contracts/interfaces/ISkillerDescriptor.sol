// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISkillerDescriptor {
    function tokenURI(address profileContract, uint256 tokenId) external view returns (string memory);
}

