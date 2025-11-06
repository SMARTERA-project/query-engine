const { gql } = require('apollo-server-express')

const typeDefs = gql`
  #type Geojson {
  #    type: String!
  #    coordinates: [[Float]]
  #}

  #type Record {
  #    eventVersion: String
  #    eventSource: String
  #    awsRegion: String
  #    eventTime: String
  #    eventName: String
  #    userIdentity: UserIdentity
  #    requestParameters: RequestParameters
  #    responseElements: ResponseElements
  #    s3: S3
  #    source: String
  #    insertedBy: String
  #}

  #input RecordInput {
  #    eventVersion: String
  #    eventSource: String
  #    awsRegion: String
  #    eventTime: String
  #    eventName: String
  #    userIdentity: UserIdentity
  #    requestParameters: RequestParameters
  #    responseElements: ResponseElements
  #    s3: S3
  #    source: String
  #    insertedBy: String
  #}

  type Data {
    datapoints: [DataPoint!]!
  }

  type Source {
    id: ID!
    name: String!
    #    record: Record
    #    json: [Geojson!]!
    data: Data
  }

  type DataPoint {
    id: ID!
    region: String!
    source: String!
    timestamp: String!
    survey: String!
    dimensions: [String!]!
    value: Float!
  }

  type DataPointV2 {
    source: String
    survey: String
    surveyName: String
    region: String
    fromUrl: String
    timestamp: String
    dimensions: [String]
    value: Float
  }

  type DataPointV3 {
    _id: ID!
    sourceId: ID
    name: String
    record: String
    survey: String!
    region: String
    source: String
    timestamp: String
    value: Float
    dimensions: [String]
  }

  type Query {
    sources: [Source]
    source(id: ID!): Source
    datapoints(
      survey: String!
      sortBy: [String!]
      sortOrder: String!
      dimensions: [String!]!
      limit: Int
    ): [DataPoint!]!
    ,
    datapointsV2(
      source: String
      survey: String
      dimensions: [String!]
      region: String
      sortBy: [String!]
      sortOrder: [String!]
      limit: Int
      exclude: [String!]
      filterBy: Int
      filter: [String!]
    ): [DataPointV2]
    ,
    datapointsV3(
      survey: String
      source: String
      region: String
      dimensions: [String]
      exclude: [String]
      filterBy: Int
      filter: [String]
      sortBy: [String]
      sortOrder: [String]
      limit: Int
    ): [DataPointV3!]!
  }

  type Mutation {
    createSource(name: String!): Source #, record: RecordInput): Source
    updateSource(id: ID!, name: String): Source
    deleteSource(id: ID!): Boolean
  }
`

module.exports = typeDefs
