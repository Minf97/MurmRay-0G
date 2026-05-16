// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MurmRay Signal Registry
/// @notice Anchors AI signal hashes to 0G Storage URIs.
contract MurmRaySignalRegistry {
    struct SignalAnchor {
        string storageUri;
        address submitter;
        uint64 registeredAt;
    }

    error InvalidSignalHash();
    error EmptyStorageUri();
    error SignalAlreadyRegistered(bytes32 signalHash);

    event SignalRegistered(bytes32 indexed signalHash, string storageUri, address indexed submitter);

    mapping(bytes32 => SignalAnchor) private anchors;

    // 登记信号
    function registerSignal(bytes32 signalHash, string calldata storageUri) external {
        if (signalHash == bytes32(0)) revert InvalidSignalHash();
        if (bytes(storageUri).length == 0) revert EmptyStorageUri();
        if (bytes(anchors[signalHash].storageUri).length != 0) {
            revert SignalAlreadyRegistered(signalHash);
        }

        anchors[signalHash] = SignalAnchor({
            storageUri: storageUri,
            submitter: msg.sender,
            registeredAt: uint64(block.timestamp)
        });

        emit SignalRegistered(signalHash, storageUri, msg.sender);
    }

    // 查询信号
    function getSignal(bytes32 signalHash)
        external
        view
        returns (string memory storageUri, address submitter, uint64 registeredAt)
    {
        SignalAnchor memory anchor = anchors[signalHash];
        return (anchor.storageUri, anchor.submitter, anchor.registeredAt);
    }
}
