const mongoose = require('mongoose');

const FlowwDbLecture = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    time: {
        scheduledTime: {
            type: Date,
            required: true
        },
        duration: { //In Minutes
            type: Number,
            required: true
        },
    },
    detail: {
        description: {
            type: String,
            required: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'subject'
        },
        topic: {
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'topic'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

module.exports = mongoose.model("classroom", FlowwDbLecture);