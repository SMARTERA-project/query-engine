const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const postSchema = new Schema({
    title: { 
        type: String, 
        required: true 
    },
    content: { 
        type: String 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    
    // --- IL PEZZO IMPORTANTE: LA RELAZIONE ---
    author: {
        type: Schema.Types.ObjectId, // Diciamo a Mongoose: "Qui salveremo un ID"
        ref: 'User',                 // E quell'ID si riferisce a un documento nella collezione 'User'
        required: true
    }
});

module.exports = mongoose.model('Post', postSchema);