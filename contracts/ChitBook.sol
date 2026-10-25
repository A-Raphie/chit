// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ChitBook {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidReceiptId();

    struct Receipt {
        uint256 id;
        address payer;
        address payee;
        uint256 amount;
        bytes32 claimHash;
        string memo;
        uint256 timestamp;
    }

    IERC20 public immutable token;

    uint256 private _receiptCount;
    mapping(uint256 => Receipt) private _receipts;
    mapping(address => uint256[]) private _payerReceipts;
    mapping(address => uint256[]) private _payeeReceipts;

    event ReceiptIssued(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        bytes32 claimHash,
        string memo
    );

    constructor(address usdcToken) {
        if (usdcToken == address(0)) revert ZeroAddress();
        token = IERC20(usdcToken);
    }

    function pay(address payee, uint256 amount, bytes32 claimHash, string calldata memo) external returns (uint256) {
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 id = ++_receiptCount;

        _receipts[id] = Receipt({
            id: id,
            payer: msg.sender,
            payee: payee,
            amount: amount,
            claimHash: claimHash,
            memo: memo,
            timestamp: block.timestamp
        });

        token.safeTransferFrom(msg.sender, payee, amount);

        _payerReceipts[msg.sender].push(id);
        _payeeReceipts[payee].push(id);

        emit ReceiptIssued(id, msg.sender, payee, amount, claimHash, memo);

        return id;
    }

    function getReceipt(uint256 id) external view returns (Receipt memory) {
        if (id == 0 || id > _receiptCount) revert InvalidReceiptId();
        return _receipts[id];
    }

    function receiptsOf(address party) external view returns (uint256[] memory) {
        uint256[] storage payerIds = _payerReceipts[party];
        uint256[] storage payeeIds = _payeeReceipts[party];

        uint256 payerLen = payerIds.length;
        uint256 payeeLen = payeeIds.length;

        uint256[] memory merged = new uint256[](payerLen + payeeLen);
        uint256 i = 0;
        uint256 j = 0;
        uint256 k = 0;

        while (i < payerLen && j < payeeLen) {
            uint256 payerId = payerIds[i];
            uint256 payeeId = payeeIds[j];

            if (payerId == payeeId) {
                merged[k++] = payerId;
                unchecked {
                    ++i;
                    ++j;
                }
            } else if (payerId < payeeId) {
                merged[k++] = payerId;
                unchecked {
                    ++i;
                }
            } else {
                merged[k++] = payeeId;
                unchecked {
                    ++j;
                }
            }
        }

        while (i < payerLen) {
            merged[k++] = payerIds[i];
            unchecked {
                ++i;
            }
        }

        while (j < payeeLen) {
            merged[k++] = payeeIds[j];
            unchecked {
                ++j;
            }
        }

        uint256[] memory result = new uint256[](k);
        for (uint256 idx = 0; idx < k; ) {
            result[idx] = merged[idx];
            unchecked {
                ++idx;
            }
        }

        return result;
    }

    function receiptCount() external view returns (uint256) {
        return _receiptCount;
    }
}
