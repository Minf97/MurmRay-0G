# MurmRay 0G Contracts

`MurmRaySignalRegistry.sol` 是 0G Proof 服务需要的最小链上登记合约。

## 部署

1. 选择 0G Galileo testnet。
2. 用 Remix、Foundry 或 Hardhat 编译 `MurmRaySignalRegistry.sol`。
3. 用服务端专用钱包部署合约。
4. 把部署出来的合约地址填到 `ZERO_G_SIGNAL_REGISTRY_ADDRESS`。
5. 把部署交易所在区块填到 `ZERO_G_SIGNAL_REGISTRY_FROM_BLOCK`。

## 服务端依赖

Hono 服务会调用：

```solidity
function registerSignal(bytes32 signalHash, string storageUri) external;
```

Proof 页面会读取：

```solidity
event SignalRegistered(bytes32 indexed signalHash, string storageUri, address indexed submitter);
```

`ZERO_G_SIGNAL_REGISTRY_ADDRESS` 不是固定地址；它是你部署这个合约后得到的地址。
