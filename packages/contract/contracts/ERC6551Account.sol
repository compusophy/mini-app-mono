// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./interfaces/IERC6551Account.sol";

contract ERC6551Account is IERC165, IERC1271, IERC6551Account, ERC1155Holder, ERC721Holder {
    uint256 public state;

    receive() external payable {}

    function token()
        public
        view
        returns (
            uint256 chainId,
            address tokenContract,
            uint256 tokenId
        )
    {
        bytes memory footer = new bytes(0x60); // 96 bytes

        // In our Registry implementation, the footer is appened as:
        // abi.encode(salt, chainId, tokenContract, tokenId)
        // This results in 4 * 32 bytes = 128 bytes of data.
        // However, the standard minimal proxy implementation copies 0x60 (96) bytes
        // starting from offset 0x37 (55).
        // The first 32 bytes of the encoded data is 'salt'.
        // The standard expects the footer to contain: chainId, tokenContract, tokenId.
        
        // Since our Registry implementation includes 'salt' as the first parameter in abi.encode,
        // the footer data starts with 'salt'.
        // We need to skip the first 32 bytes (salt) to get to the actual token data.
        
        // But we can't change the offset in the proxy bytecode once deployed.
        // The proxy always copies the *last* bytes of the creation code? 
        // No, the proxy hardcodes the offset 0x37. 
        
        // If we are deployed with the "Standard" ERC6551Registry bytecodes:
        // 0x3d60ad80600a3d3981f3363d3d373d3d3d363d73...5af43d82803e903d91602b57fd5bf3
        // The proxy code copies 0x60 bytes from offset 0x37 (decimal 55).
        // 55 bytes is the length of the proxy code itself.
        // So it copies the bytes *immediately following* the proxy code.
        
        // Our Registry appends: salt, chainId, tokenContract, tokenId.
        // So the bytes following the proxy code are:
        // [0..31] salt
        // [32..63] chainId
        // [64..95] tokenContract
        // [96..127] tokenId
        
        // The proxy copies 96 bytes (0x60).
        // So it copies: salt, chainId, tokenContract.
        
        // We read this into 'footer'.
        // abi.decode(footer, (uint256, address, uint256))
        // Decodes:
        // 1. uint256 -> reads first 32 bytes -> salt
        // 2. address -> reads next 32 bytes -> chainId
        // 3. uint256 -> reads next 32 bytes -> tokenContract
        
        // THIS IS THE BUG.
        // We can't fix deployed contracts. But we can fix the ACCOUNT implementation to read the correct slots.
        // Since 'footer' currently holds [salt, chainId, tokenContract],
        // We are missing 'tokenId' entirely in the footer variable!
        
        // To fix this in the Account implementation (without redeploying Registry):
        // We need to read the FULL footer from the code.
        // But we can't use the 'footer' variable populated by the constructor/proxy logic 
        // because that logic is in the proxy bytecode which we can't change for existing deployments?
        // Wait, 'extcodecopy(address(), ...)' copies from the CURRENT contract's code.
        // The current contract IS the proxy.
        
        // So yes, we can change how we read from our own code!
        // We just need to read starting from offset 0x37 + 0x20 (32 bytes) to skip salt?
        // And read 0x60 bytes (chainId, tokenContract, tokenId).
        
        // Original code: extcodecopy(address(), add(footer, 0x20), 0x37, 0x60)
        // Modified code: extcodecopy(address(), add(footer, 0x20), 0x57, 0x60)
        // 0x37 (55) + 0x20 (32) = 0x57 (87) -> INCORRECT math based on Registry source.
        
        // Correct Math:
        // Registry Proxy Header: 
        // 1. 10 bytes (Minimal Proxy Start: 363d3d373d3d3d363d73)
        // 2. 20 bytes (Implementation Address)
        // 3. 15 bytes (Minimal Proxy End: 5af43d82803e903d91602b57fd5bf3)
        // Total Proxy Header = 10 + 20 + 15 = 45 bytes (0x2D).
        
        // Footer starts at offset 45.
        // Footer structure: [Salt(32)] [ChainId(32)] [TokenContract(32)] [TokenId(32)].
        // We want to skip Salt (32 bytes).
        // Target Offset = 45 + 32 = 77 (0x4D).
        
        assembly {
            // Copy 0x60 bytes from offset 0x4D (skip salt)
            extcodecopy(address(), add(footer, 0x20), 0x4D, 0x60)
        }

        return abi.decode(footer, (uint256, address, uint256));
    }

    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    function isValidSigner(address signer, bytes calldata)
        public
        view
        returns (bytes4)
    {
        if (signer == owner()) {
            return IERC6551Account.isValidSigner.selector;
        }
        return bytes4(0);
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue)
    {
        bool isValid = SignatureChecker.isValidSignatureNow(owner(), hash, signature);

        if (isValid) {
            return IERC1271.isValidSignature.selector;
        }

        return bytes4(0);
    }

    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external payable returns (bytes memory result) {
        require(_isValidSigner(msg.sender), "Invalid signer");
        require(operation == 0, "Only call operations supported");

        state++;

        bool success;
        (success, result) = to.call{value: value}(data);

        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    function _isValidSigner(address signer) internal view returns (bool) {
        return signer == owner();
    }

    function supportsInterface(bytes4 interfaceId) public view override(IERC165, ERC1155Holder) returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC6551Account).interfaceId ||
            interfaceId == type(IERC1271).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}

