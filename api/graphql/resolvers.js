const Source = require('../models/Source')
const Datapoint = require('../models/Datapoint')
const util = require('util')

const resolvers = {
  Query: {
    sources: async () => {
      return await Source.find()
    },
    source: async (parent, { id }) => {
      return await Source.findById(id)
    },

    datapoints: async (_parent, args, { db }) => {
      const {
        survey,
        sortBy = [],
        sortOrder = 'ASC',
        dimensions = [],
        limit
      } = args
      const sources = await Source.find({ 'data.datapoints.survey': survey })

      let dataPoints = sources.flatMap(source => {
        const points = source?.data?.datapoints ?? []
        return points
          .filter(p => p.survey === survey)
          .map(p => ({
            sourceId: source._id,
            name: source.name,
            record: source.record,
            ...p
          }))
      })

      if (dimensions.length > 0) {
        dataPoints = dataPoints.filter(
          dp =>
            Array.isArray(dp.dimensions) &&
            dimensions.every(dim => dp.dimensions.includes(dim))
        )
      }

      if (sortBy.length > 0) {
        dataPoints.sort((a, b) => {
          for (const key of sortBy) {
            const dir = sortOrder.toUpperCase() === 'DESC' ? -1 : 1
            if (a[key] < b[key]) return -1 * dir
            if (a[key] > b[key]) return 1 * dir
          }
          return 0
        })
      }

      if (limit && Number.isInteger(limit) && limit > 0) {
        dataPoints = dataPoints.slice(0, limit)
      }

      return dataPoints
    },

    datapointsV2: async (_, args) => {
      const query = {}
      const andClauses = []

      if (args.source) query.source = args.source
      if (args.survey) query.survey = args.survey
      if (args.region) query.region = args.region

      // Estrai chiavi dinamiche da dimensions
      const collection = await Datapoint.find({ survey: args.survey })
        .limit(50)
        .lean()
        .exec()
      const dimensionKeys = [
        ...new Set(
          collection.flatMap(doc =>
            Array.isArray(doc.dimensions)
              ? doc.dimensions.flatMap(d => Object.keys(d))
              : []
          )
        )
      ]

      // Filtro inclusione
      if (args.dimensions?.length > 0 && dimensionKeys.length > 0) {
        args.dimensions.forEach(value => {
          andClauses.push({
            dimensions: {
              $elemMatch: {
                $or: dimensionKeys.map(k => ({ [k]: value }))
              }
            }
          })
        })
      }

      // Filtro esclusione
      if (args.exclude?.length > 0 && dimensionKeys.length > 0) {
        args.exclude.forEach(value => {
          andClauses.push({
            dimensions: {
              $not: {
                $elemMatch: {
                  $or: dimensionKeys.map(k => ({ [k]: value }))
                }
              }
            }
          })
        })
      }

      if (
        typeof args.filterBy === 'number' &&
        Array.isArray(args.filter) &&
        args.filter.length > 0
      ) {
        const filterIndex = args.filterBy
        const sampleDoc = await Datapoint.findOne({ survey: args.survey })
          .lean()
          .exec()
        const dimensionObj = sampleDoc?.dimensions?.[filterIndex]

        if (dimensionObj) {
          const [dimensionKey] = Object.keys(dimensionObj)
          const filterValues = args.filter.map(v => {
            const num = Number(v)
            return isNaN(num) ? v : num
          })

          andClauses.push({
            dimensions: {
              $elemMatch: {
                [dimensionKey]: { $in: filterValues }
              }
            }
          })
        }
      }

      if (andClauses.length > 0) query.$and = andClauses

      console.log(
        'MongoDB Query:',
        util.inspect(query, { depth: null, colors: true })
      )

      // Costruzione pipeline aggregazione
      const pipeline = [{ $match: query }]

      // Estrai e ordina per campi dentro dimensions
      if (args.sortBy && args.sortOrder) {
        const sortBy = Array.isArray(args.sortBy) ? args.sortBy : [args.sortBy]
        const sortOrder = Array.isArray(args.sortOrder)
          ? args.sortOrder
          : [args.sortOrder]

        const addFieldsStage = {}
        sortBy.forEach(field => {
          addFieldsStage[`sort_${field}`] = {
            $first: {
              $map: {
                input: {
                  $filter: {
                    input: '$dimensions',
                    as: 'dim',
                    cond: {
                      $gt: [{ $type: `$$dim.${field}` }, 'missing']
                    }
                  }
                },
                as: 'dim',
                in: `$$dim.${field}`
              }
            }
          }
        })

        pipeline.push({ $addFields: addFieldsStage })

        const sortStage = {}
        sortBy.forEach((field, i) => {
          sortStage[`sort_${field}`] =
            sortOrder[i]?.toUpperCase() === 'DESC' ? -1 : 1
        })
        // Aggiungi ordinamento per value se richiesto
        if (args.sortBy.includes('value')) {
          sortStage['value'] =
            args.sortOrder[sortBy.indexOf('value')]?.toUpperCase() === 'DESC'
              ? -1
              : 1
        }

        pipeline.push({ $sort: sortStage })
      }

      if (args.limit) {
        pipeline.push({ $limit: args.limit })
      }

      // Proiezione finale: solo valori delle dimensioni
      pipeline.push({
        $project: {
          region: 1,
          source: 1,
          timestamp: 1,
          survey: 1,
          value: 1,
          dimensions: {
            $map: {
              input: '$dimensions',
              as: 'd',
              in: {
                $first: {
                  $map: {
                    input: { $objectToArray: '$$d' },
                    as: 'pair',
                    in: '$$pair.v'
                  }
                }
              }
            }
          }
        }
      })

      const datapoints = await Datapoint.aggregate(pipeline).exec()
      return datapoints
    },

    datapointsV3: async (_parent, args, { db }) => {
      const {
        survey,
        source,
        region,
        sortBy = [],
        sortOrder = 'ASC',
        dimensions = [],
        exclude = [],
        filterBy,
        filter = [],
        limit
      } = args

      // Cache per le chiavi delle dimensioni (potrebbe essere spostata fuori dalla funzione)
      let dimensionKeysCache = null

      // Funzione helper per estrarre chiavi dimensioni
      const getDimensionKeys = async () => {
        if (dimensionKeysCache) return dimensionKeysCache

        const sampleDatapoints = await Datapoint.find({ survey })
          .limit(50)
          .select('dimensions')
          .lean()
          .exec()

        dimensionKeysCache = [
          ...new Set(
            sampleDatapoints.flatMap(doc =>
              Array.isArray(doc.dimensions)
                ? doc.dimensions.flatMap(d => Object.keys(d))
                : []
            )
          )
        ]

        return dimensionKeysCache
      }

      // Costruzione query MongoDB
      const query = { survey }
      const andClauses = []

      if (source) query.source = source
      if (region) query.region = region

      // Ottieni le chiavi dimensioni
      const dimensionKeys = await getDimensionKeys()

      // Filtro inclusione dimensioni
      if (dimensions.length > 0 && dimensionKeys.length > 0) {
        dimensions.forEach(value => {
          andClauses.push({
            dimensions: {
              $elemMatch: {
                $or: dimensionKeys.map(k => ({ [k]: value }))
              }
            }
          })
        })
      }

      // Filtro esclusione dimensioni
      if (exclude.length > 0 && dimensionKeys.length > 0) {
        exclude.forEach(value => {
          andClauses.push({
            dimensions: {
              $not: {
                $elemMatch: {
                  $or: dimensionKeys.map(k => ({ [k]: value }))
                }
              }
            }
          })
        })
      }

      // Filtro per dimensione specifica (filterBy index)
      if (typeof filterBy === 'number' && filter.length > 0) {
        const sampleDoc = await Datapoint.findOne({ survey })
          .select('dimensions')
          .lean()
          .exec()

        const dimensionObj = sampleDoc?.dimensions?.[filterBy]

        if (dimensionObj) {
          const [dimensionKey] = Object.keys(dimensionObj)
          const filterValues = filter.map(v => {
            const num = Number(v)
            return isNaN(num) ? v : num
          })

          andClauses.push({
            dimensions: {
              $elemMatch: {
                [dimensionKey]: { $in: filterValues }
              }
            }
          })
        }
      }

      if (andClauses.length > 0) query.$and = andClauses

      // Pipeline di aggregazione
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: 'sources', 
            localField: 'source',
            foreignField: '_id',
            as: 'sourceData'
          }
        },
        {
          $unwind: {
            path: '$sourceData',
            preserveNullAndEmptyArrays: true
          }
        }
      ]

      // Ordinamento
      if (sortBy.length > 0) {
        const sortByArray = Array.isArray(sortBy) ? sortBy : [sortBy]
        const sortOrderArray = Array.isArray(sortOrder)
          ? sortOrder
          : [sortOrder]

        const addFieldsStage = {}
        const sortStage = {}

        sortByArray.forEach((field, i) => {
          const order = sortOrderArray[i]?.toUpperCase() === 'DESC' ? -1 : 1

          if (dimensionKeys.includes(field)) {
            addFieldsStage[`sort_${field}`] = {
              $first: {
                $map: {
                  input: {
                    $filter: {
                      input: '$dimensions',
                      as: 'dim',
                      cond: {
                        $gt: [{ $type: `$$dim.${field}` }, 'missing']
                      }
                    }
                  },
                  as: 'dim',
                  in: `$$dim.${field}`
                }
              }
            }
            sortStage[`sort_${field}`] = order
          } else {
            // Campo diretto (value, timestamp, ecc.)
            sortStage[field] = order
          }
        })

        if (Object.keys(addFieldsStage).length > 0) {
          pipeline.push({ $addFields: addFieldsStage })
        }
        pipeline.push({ $sort: sortStage })
      }

      if (limit && Number.isInteger(limit) && limit > 0) {
        pipeline.push({ $limit: limit })
      }

      // Proiezione finale con dati arricchiti
      pipeline.push({
        $project: {
          _id: 1,
          region: 1,
          source: 1,
          timestamp: 1,
          survey: 1,
          value: 1,
          sourceId: '$sourceData._id',
          name: '$sourceData.name',
          record: '$sourceData.record',
          dimensions: {
            $map: {
              input: '$dimensions',
              as: 'd',
              in: {
                $first: {
                  $map: {
                    input: { $objectToArray: '$$d' },
                    as: 'pair',
                    in: '$$pair.v'
                  }
                }
              }
            }
          }
        }
      })

      console.log('MongoDB Query:', JSON.stringify(pipeline, null, 2))

      const datapoints = await Datapoint.aggregate(pipeline).exec()
      return datapoints
    }
  },

  Mutation: {
    createSource: async (parent, { json, record, name }) => {
      const newSource = new Source({ json, record, name })
      return await newSource.save()
    },

    updateSource: async (parent, { id, json, record, name }) => {
      return await Source.findByIdAndUpdate(
        id,
        { json, record, name },
        { new: true }
      )
    },

    deleteSource: async (parent, { id }) => {
      try {
        await Source.findByIdAndDelete(id)
        return true
      } catch (err) {
        return false
      }
    }
  }
}

module.exports = resolvers
