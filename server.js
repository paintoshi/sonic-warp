const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const TPS = 100; // Transactions per second - adjust this to test different rates
const BLOCK_TIME = 500; // 500ms per block (2 blocks per second)
const TXS_PER_BLOCK = Math.ceil(TPS * (BLOCK_TIME / 1000));

// State
let currentBlockNumber = 1000000;
const blockCache = new Map(); // Cache for generated blocks

// Helper functions
function generateRandomAmount() {
    // 80% chance of zero amount
    if (Math.random() < 0.8) {
        return 0;
    }

    // For non-zero amounts, use a mix of distributions
    const r = Math.random();
    
    if (r < 0.4) {
        // 40% chance of red star range (0-2 S)
        return Math.random() * 2;
    } else if (r < 0.7) {
        // 30% chance of purple star range (2-1000 S)
        return 2 + Math.random() * 998;
    } else if (r < 0.9) {
        // 20% chance of blue star range (1000-100000 S)
        return 1000 + Math.random() * 99000;
    } else {
        // 10% chance of green star range (>100000 S)
        return 100000 + Math.random() * 900000;
    }
}

function generateRandomAddress() {
    return '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateRandomHash() {
    return '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateBlock(blockNumber) {
    // Check if block is already in cache
    const cachedBlock = blockCache.get(blockNumber);
    if (cachedBlock) {
        return cachedBlock;
    }

    const blockHash = generateRandomHash();
    const transactions = [];
    
    // Ensure we generate exactly TXS_PER_BLOCK transactions
    for (let i = 0; i < TXS_PER_BLOCK; i++) {
        const amount = generateRandomAmount();
        transactions.push({
            hash: generateRandomHash(),
            from: generateRandomAddress(),
            to: generateRandomAddress(),
            value: '0x' + Math.floor(amount * 1e18).toString(16)
        });
    }

    const block = {
        number: '0x' + blockNumber.toString(16),
        hash: blockHash,
        transactions: transactions
    };

    // Cache the block
    blockCache.set(blockNumber, block);

    // Keep cache size manageable
    if (blockCache.size > 100) {
        const oldestBlock = Math.min(...blockCache.keys());
        blockCache.delete(oldestBlock);
    }

    return block;
}

// RPC endpoints
app.post('/', async (req, res) => {
    // Handle batch requests
    if (Array.isArray(req.body)) {
        const results = await Promise.all(req.body.map(async (request) => {
            const { method, params, id } = request;
            
            try {
                let result;
                
                switch (method) {
                    case 'eth_getBlockByNumber':
                        const blockNumber = parseInt(params[0], 16);
                        if (blockNumber > currentBlockNumber) {
                            result = null;
                        } else {
                            result = generateBlock(blockNumber);
                        }
                        break;

                    case 'eth_blockNumber':
                        result = '0x' + currentBlockNumber.toString(16);
                        break;

                    default:
                        throw new Error(`Method ${method} not supported`);
                }

                return {
                    jsonrpc: '2.0',
                    id,
                    result
                };
            } catch (error) {
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32603,
                        message: error.message
                    }
                };
            }
        }));

        return res.json(results);
    }

    // Handle single requests
    const { method, params, id } = req.body;

    try {
        let result;
        
        switch (method) {
            case 'eth_blockNumber':
                result = '0x' + currentBlockNumber.toString(16);
                break;

            case 'eth_getBlockByNumber':
                const blockNumber = parseInt(params[0], 16);
                if (blockNumber > currentBlockNumber) {
                    result = null;
                } else {
                    result = generateBlock(blockNumber);
                }
                break;

            default:
                throw new Error(`Method ${method} not supported`);
        }

        res.json({
            jsonrpc: '2.0',
            id,
            result
        });
    } catch (error) {
        res.json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32603,
                message: error.message
            }
        });
    }
});

// Increment block number periodically
setInterval(() => {
    currentBlockNumber++;
}, BLOCK_TIME);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Mock RPC server running at http://localhost:${PORT}`);
    console.log(`Current TPS: ${TPS}`);
    console.log(`Transactions per block: ${TXS_PER_BLOCK}`);
    console.log(`Block time: ${BLOCK_TIME}ms`);
}); 