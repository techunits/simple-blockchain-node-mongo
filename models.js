const mongoose = require('mongoose');

// define the AuditLogChain model for data storage
const AuditLogChainSchema = new mongoose.Schema({
    data: { type: mongoose.Schema.Types.Mixed },
    preceding_hash: { type: mongoose.Schema.Types.String },
    hash: { type: mongoose.Schema.Types.String },
    iterations: { type: mongoose.Schema.Types.Number },
    created_on: { type: Number }
}, {
    collection: 'audit_log_chain',
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
});
AuditLogChainSchema.virtual('id').get(function () {
    return String(this._id);
});
exports.AuditLogChain = mongoose.model('AuditLogChain', AuditLogChainSchema);

