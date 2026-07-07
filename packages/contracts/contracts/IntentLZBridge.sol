// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroReceiver.sol";

interface IERC20Mintable {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
}

contract IntentLZBridge is Ownable, ILayerZeroReceiver {
    ILayerZeroEndpointV2 public endpoint;

    mapping(uint32 => bytes32) public peers;
    mapping(bytes32 => bool) public processed;
    mapping(address => uint256) public lockedBalances;

    event BridgeOut(
        bytes32 indexed intentId,
        address indexed sourceToken,
        uint256 amount,
        uint32 indexed dstEid,
        uint256 destChainId,
        address sender,
        address recipient,
        address destToken
    );

    event BridgeIn(
        bytes32 indexed intentId,
        address indexed destToken,
        uint256 amount,
        uint32 indexed srcEid,
        address recipient
    );

    event Received(
        bytes32 indexed guid,
        bytes32 indexed intentId,
        uint32 srcEid,
        address recipient,
        address destToken,
        uint256 amount
    );

    modifier onlyEndpoint() {
        require(msg.sender == address(endpoint), "IntentLZBridge: only endpoint");
        _;
    }

    constructor(address _endpoint, address _owner) Ownable() {
        require(_endpoint != address(0), "IntentLZBridge: zero endpoint");
        endpoint = ILayerZeroEndpointV2(_endpoint);
        if (_owner != address(0)) {
            transferOwnership(_owner);
        }
    }

    function setEndpoint(address _endpoint) external onlyOwner {
        require(_endpoint != address(0), "IntentLZBridge: zero endpoint");
        endpoint = ILayerZeroEndpointV2(_endpoint);
    }

    function setPeer(uint32 _eid, bytes32 _peer) external onlyOwner {
        peers[_eid] = _peer;
    }

    function quoteBridgeFee(
        uint32 _dstEid,
        bytes calldata _message,
        bytes calldata _options
    ) external view returns (MessagingFee memory fee) {
        MessagingParams memory params = MessagingParams({
            dstEid: _dstEid,
            receiver: peers[_dstEid],
            message: _message,
            options: _options,
            payInLzToken: false
        });
        return endpoint.quote(params, address(this));
    }

    function bridgeOut(
        bytes32 _intentId,
        address _sourceToken,
        uint256 _amount,
        uint32 _dstEid,
        uint256 _destChainId,
        address _recipient,
        address _destToken,
        bytes calldata _options
    ) external payable {
        require(_amount > 0, "IntentLZBridge: zero amount");
        require(!processed[_intentId], "IntentLZBridge: already processed");
        require(peers[_dstEid] != bytes32(0), "IntentLZBridge: peer not set");

        processed[_intentId] = true;
        lockedBalances[_sourceToken] += _amount;

        require(
            IERC20Mintable(_sourceToken).transferFrom(msg.sender, address(this), _amount),
            "IntentLZBridge: transfer failed"
        );

        bytes memory message = abi.encode(_intentId, _recipient, _destToken, _amount, _destChainId);
        MessagingParams memory params = MessagingParams({
            dstEid: _dstEid,
            receiver: peers[_dstEid],
            message: message,
            options: _options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, address(this));
        require(msg.value >= fee.nativeFee, "IntentLZBridge: insufficient fee");

        // solhint-disable-next-line check-send-result
        endpoint.send{ value: fee.nativeFee }(params, msg.sender);

        if (msg.value > fee.nativeFee) {
            (bool success, ) = msg.sender.call{ value: msg.value - fee.nativeFee }("");
            require(success, "IntentLZBridge: refund failed");
        }

        emit BridgeOut(
            _intentId,
            _sourceToken,
            _amount,
            _dstEid,
            _destChainId,
            msg.sender,
            _recipient,
            _destToken
        );
    }

    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address,
        bytes calldata
    ) external payable onlyEndpoint {
        require(peers[_origin.srcEid] == _origin.sender, "IntentLZBridge: untrusted remote");

        (bytes32 intentId, address recipient, address destToken, uint256 amount, ) = abi.decode(
            _message,
            (bytes32, address, address, uint256, uint256)
        );

        require(!processed[intentId], "IntentLZBridge: already processed");
        processed[intentId] = true;

        _deliver(destToken, recipient, amount);

        emit Received(_guid, intentId, _origin.srcEid, recipient, destToken, amount);
        emit BridgeIn(intentId, destToken, amount, _origin.srcEid, recipient);
    }

    function allowInitializePath(Origin calldata _origin) external view returns (bool) {
        return peers[_origin.srcEid] == _origin.sender;
    }

    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function withdrawLocked(address _token, uint256 _amount, address _recipient) external onlyOwner {
        require(lockedBalances[_token] >= _amount, "IntentLZBridge: insufficient locked");
        lockedBalances[_token] -= _amount;
        require(IERC20Mintable(_token).transfer(_recipient, _amount), "IntentLZBridge: transfer failed");
    }

    function _deliver(address _token, address _recipient, uint256 _amount) internal {
        uint256 balance = IERC20Mintable(_token).balanceOf(address(this));
        if (balance >= _amount) {
            require(IERC20Mintable(_token).transfer(_recipient, _amount), "IntentLZBridge: deliver failed");
        } else {
            IERC20Mintable(_token).mint(_recipient, _amount);
        }
    }

    receive() external payable {}
}
