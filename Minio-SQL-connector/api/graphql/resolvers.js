const Source = require('../models/source')

const resolvers = {
    Query: {
        sources: async () => {
            return await Source.find();
        },
        source: async (parent, { id }) => {
            return await Source.findById(id);
        },

        datapoints: async (_parent, args, { db }) => {
            const { survey, sortBy = [], sortOrder = 'ASC', dimensions = [], limit } = args;
            const sources = await Source
                .find({ "data.datapoints.survey": survey })

            let dataPoints = sources.flatMap(source => {
                const points = source?.data?.datapoints ?? [];
                return points
                    .filter(p => p.survey === survey)
                    .map(p => ({
                        sourceId: source._id,
                        name: source.name,
                        record: source.record,
                        ...p
                    }));
            });

            if (dimensions.length > 0) {
                dataPoints = dataPoints.filter(dp =>
                    Array.isArray(dp.dimensions) &&
                    dimensions.every(dim => dp.dimensions.includes(dim))
                );
            }

            if (sortBy.length > 0) {
                dataPoints.sort((a, b) => {
                    for (const key of sortBy) {
                        const dir = sortOrder.toUpperCase() === 'DESC' ? -1 : 1;
                        if (a[key] < b[key]) return -1 * dir;
                        if (a[key] > b[key]) return 1 * dir;
                    }
                    return 0;
                });
            }

            if (limit && Number.isInteger(limit) && limit > 0) {
                dataPoints = dataPoints.slice(0, limit);
            }

            return dataPoints;

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