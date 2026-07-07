// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroReceiver.sol";

contract MockLayerZeroEndpoint {
    struct StoredPacket {
        uint32 dstEid;
        address sender;
        address receiver;
        bytes message;
    }

    uint32 public localEid;
    uint256 public nativeFee;
    StoredPacket[] public packets;

    constructor(uint32 _localEid, uint256 _nativeFee) {
        localEid = _localEid;
        nativeFee = _nativeFee;
    }

    function setNativeFee(uint256 _nativeFee) external {
        nativeFee = _nativeFee;
    }

    function quote(
        MessagingParams calldata,
        address
    ) external view returns (MessagingFee memory fee) {
        fee.nativeFee = nativeFee;
        fee.lzTokenFee = 0;
    }

    function send(
        MessagingParams calldata _params,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory receipt) {
        require(msg.value >= nativeFee, "MockLZ: insufficient fee");
        address receiver = address(uint160(uint256(_params.receiver)));
        packets.push(
            StoredPacket({
                dstEid: _params.dstEid,
                sender: msg.sender,
                receiver: receiver,
                message: _params.message
            })
        );

        if (msg.value > nativeFee) {
            (bool success, ) = _refundAddress.call{ value: msg.value - nativeFee }("");
            require(success, "MockLZ: refund failed");
        }

        receipt.guid = keccak256(abi.encodePacked(packets.length, block.timestamp));
        receipt.nonce = uint64(packets.length);
        receipt.fee = MessagingFee({ nativeFee: nativeFee, lzTokenFee: 0 });
    }

    function deliver(uint256 _index) external {
        require(_index < packets.length, "MockLZ: invalid index");
        StoredPacket memory packet = packets[_index];
        Origin memory origin = Origin({
            srcEid: localEid,
            sender: bytes32(uint256(uint160(packet.sender))),
            nonce: uint64(_index + 1)
        });
        bytes32 guid = keccak256(abi.encodePacked(_index, block.timestamp));
        ILayerZeroReceiver(packet.receiver).lzReceive(origin, guid, packet.message, msg.sender, "");
    }

    function packetCount() external view returns (uint256) {
        return packets.length;
    }
}
