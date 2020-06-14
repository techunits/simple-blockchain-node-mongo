const crypto = require("crypto-js");
const logger = require('elogger');
const mongoose = require('mongoose');
const models = require('./models');


class Block {
    constructor(id, data, created_on, precedingHash='N/A') {
        this.id = id;
        this.data = data;
        this.created_on = created_on;
        this.preceding_hash = precedingHash;
        this.hash = this.computeHash();
        this.iterations = 0;
    }

    computeHash() {
        return crypto.SHA512(
            this.id +
            this.preceding_hash +
            this.timestamp +
            JSON.stringify(this.data) +
            this.iterations
        ).toString();
    }

    proofOfWork(difficulty) {
        while (
            this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")
        ) {
            this.iterations++;
            this.hash = this.computeHash();
        }
    }
}

exports.AuditLogBlockchain = class AuditLogBlockchain {
    constructor() {
        this.difficulty = 3;
    }

    async initialize() {
        let genesisBlockInfo = await this.getGenesisBlock();
        if(!genesisBlockInfo) {
            logger.info('Initializing Genesis block . . .');
            let genesisBlockInfo = await this.createGenesisBlock();
            logger.info(`Genesis block: ${genesisBlockInfo.id}`);
        }
        else {
            logger.debug(`Existing Genesis block: ${genesisBlockInfo.id}`);
        }
    }

    async createGenesisBlock() {
        let id = new mongoose.Types.ObjectId().toHexString()
        let newblockInfo = new Block(id, null, new Date().getTime());
        return await this.addNewBlock(newblockInfo);
    }

    async createTransaction(payload) {
        let precedingBlockInfo = await this.getPrecedingBlock();
        if(precedingBlockInfo) {
            let id = new mongoose.Types.ObjectId().toHexString();
            let currentBlockInfo = new Block(id, payload, new Date().getTime(), precedingBlockInfo.hash);
            return await this.addNewBlock(currentBlockInfo);
        }
        return false;
    }

    async addNewBlock(blockObj) {
        blockObj.proofOfWork(this.difficulty);
        return this.addBlockToChain(blockObj);
    }

    async addBlockToChain(blockInfo) {
        // save new block to chain
        let chainInfo = models.AuditLogChain();
        chainInfo._id = blockInfo.id;
        chainInfo.preceding_hash = blockInfo.preceding_hash;
        chainInfo.data = blockInfo.data;
        chainInfo.hash = blockInfo.hash;
        chainInfo.iterations = blockInfo.iterations;
        chainInfo.created_on = blockInfo.created_on;
        let chainEntry = await chainInfo.save();
        return chainEntry;
    }

    async getGenesisBlock() {
        let blockInfo = await models.AuditLogChain.find().sort({ $natural: 1}).limit(1);
        return (blockInfo.length > 0)?blockInfo[0]:null;
    }

    async getPrecedingBlock() {
        let blockInfo = await models.AuditLogChain.find().sort({ $natural: -1}).limit(1);
        return (blockInfo.length > 0)?blockInfo[0]:null;
    }

    async checkChainValidity() {
        let promise = new Promise((resolve) => {
            let previousBlock = null;
            let currentBlock = null;
            let idx = 1;
            models.AuditLogChain.find({}).sort({$natural: 1}).cursor().on('data', entry => {
                logger.info(`Validating Block(${idx}): ${entry.id}`);
                if(previousBlock) {
                    // recreate the block with the info from database
                    currentBlock = new Block(entry.id, entry.data, entry.created_on, entry.preceding_hash);
                    currentBlock.proofOfWork(this.difficulty);

                    // validate computed block hash with database hash entry
                    if (entry.hash !== currentBlock.hash) {
                        logger.error(`Stored hash(${entry.hash}) and computed hash(${currentBlock.hash}) doesn't match`);
                        process.exit(0);
                    }
                    else {
                        logger.debug(`Block Computed Hash Validated: ${currentBlock.id} -> SUCCESS`);
                    }
                    
                    // validate chain block with preceding hash
                    if (currentBlock.preceding_hash !== previousBlock.hash) {
                        logger.error(`Previous block hash(${previousBlock.hash}) and preceding block hash(${currentBlock.preceding_hash}) doesn't match`);
                        process.exit(0);
                    }
                    else {
                        logger.debug(`Block Preceding Hash Chain Validated: ${currentBlock.id} -> SUCCESS`);
                    }

                    // assign current block as previous block for the next cycle
                    previousBlock = Object.assign({}, currentBlock);
                    idx++;
                }
                else {
                    logger.info(`Genesis Block(${idx}): ${entry.id}`);
                    previousBlock = new Block(entry.id, entry.data, entry.created_on, entry.preceding_hash);
                    previousBlock.proofOfWork(this.difficulty);
                    idx++;
                }
            })
            .on('end', function() {
                resolve(true);
            });
        });

        return promise;
    }
}
