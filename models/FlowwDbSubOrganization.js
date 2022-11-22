const mongoose = require('mongoose');

const FlowwDbSubOrganization = mongoose.Schema({
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
    location: [{
        addressLine1: { type: String },
        addressLine2: { type: String },
        city: { type: String },
        state: { type: String }, 
        zipCode: { type: String }
    }],
    members: [{
        learners: [{
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'user'
        }],
        educators: [{
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'user'
        }]
    }],
    classrooms: [{
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'classroom'
    }],
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

module.exports = mongoose.model("subOrganization", FlowwDbSubOrganization);