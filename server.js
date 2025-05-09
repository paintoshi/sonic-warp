const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const customTPS = 1000
// Set to false to use ramp up function
const useCustomTPS = true

// Gradually increase TPS from 0 to 10000 over 60 seconds with slower initial ramp-up
let currentTPS = 0;
const targetTPS = 2500;
const initialDelay = 5000; // 5 seconds initial delay
const rampUpDuration = 30000; // 30 seconds total
const startTime = Date.now();

// Update TPS and TXS_PER_BLOCK every 100ms
setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed < initialDelay) {
        currentTPS = 0; // Keep TPS at 0 during initial delay
    } else if (elapsed < initialDelay + rampUpDuration) {
        // Use a quadratic curve for slower initial ramp-up, adjusted for the delay
        const progress = (elapsed - initialDelay) / rampUpDuration;
        currentTPS = targetTPS * (progress * progress * progress);
    } else {
        currentTPS = targetTPS;
    }
    currentTPS = useCustomTPS ? customTPS : currentTPS
}, 100);

// Configuration
const BLOCK_TIME = 500; // 500ms per block (2 blocks per second)
// TXS_PER_BLOCK will be calculated dynamically in generateBlock

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
    // Calculate TXS_PER_BLOCK dynamically based on current TPS
    const TXS_PER_BLOCK = Math.ceil(currentTPS * (BLOCK_TIME / 1000));
    
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
    console.log(`Current TPS: ${currentTPS}`);
    console.log(`Block time: ${BLOCK_TIME}ms`);
}); 