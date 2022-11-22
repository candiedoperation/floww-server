const mongoose = require('mongoose');

const FlowwDbClassroom = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
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
    lectures: [{
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'lecture'
    }],
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

module.exports = mongoose.model("classroom", FlowwDbClassroom);