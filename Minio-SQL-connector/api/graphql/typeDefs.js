const { gql } = require('apollo-server-express');

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

    type Query {
        sources: [Source]
        source(id: ID!): Source
        datapoints( survey: String!, sortBy: [String!], sortOrder: String!, dimensions: [String!]!, limit: Int): [DataPoint!]!
    }

    type Mutation {
        createSource(name: String!): Source #, record: RecordInput): Source
        updateSource(id: ID!, name: String): Source
        deleteSource(id: ID!): Boolean
    }
`;

module.exports = typeDefs;