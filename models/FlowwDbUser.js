const mongoose = require('mongoose');

const FlowwDbUser = mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String, 
        required: true
    },
    notifications: [{
        category: {
            type: String,
            required: true
        },
        content: {
            type: Object
        }
    }],
    memberOf: {
        organizations: [
            {
                type: mongoose.Types.ObjectId,
                ref: 'organization'
            }
        ],
        subOrganizations: [
            {
                type: mongoose.Types.ObjectId,
                ref: 'subOrganization'
            }
        ],
        classrooms: [
            {
                type: mongoose.Types.ObjectId,
                ref: 'classroom'
            }            
        ]
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

FlowwDbUser.post('validate', async (savedUserOperation, next) => {
    //find a way
})

module.exports = mongoose.model("user", FlowwDbUser);