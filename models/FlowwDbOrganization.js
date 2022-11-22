const mongoose = require('mongoose');

const FlowwDbOrganization = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    contact: [{
        email: [{
            type: String,
            required: true
        }],
        tel: [{
            type: String,
        }]
    }],
    administrators: [{
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user'
    }],
    subOrganizations: [{
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'subOrganization'
    }],
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

module.exports = mongoose.model("organization", FlowwDbOrganization);