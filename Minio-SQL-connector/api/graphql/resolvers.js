const Source = require('../models/source')

const resolvers = {
    Query: {
        sources: async () => {
            return await Source.find();
        },
        source: async (parent, { id }) => {
            return await Source.findById(id);
        }
    },

    Mutation: {
        createSource: async (parent, { json, record, name }) => {
            const newSource = new Source({ json, record, name });
            return await newSource.save();
        },


        updateSource: async (parent, { id, json, record, name }) => {

            return await Source.findByIdAndUpdate(
                id,
                { json, record, name },
                { new: true }
            );
        },

        deleteSource: async (parent, { id }) => {
            try {
                await Source.findByIdAndDelete(id);
                return true;
            } catch (err) {
                return false;
            }
        }
    }
};

module.exports = resolvers;