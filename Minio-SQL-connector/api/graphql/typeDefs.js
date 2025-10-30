const { gql } = require('apollo-server-express');

const typeDefs = gql`
    type Geojson {
        type: String!
        coordinates: [[Float]]
    }

    type Record {
        field1: String
        field2: Int 
    }

    input RecordInput {  
        field1: String
        field2: Int
       
    }

    type Source {
        id: ID!
        name: String!
        record: Record
        json: [Geojson!]!
    }

    type DataPoint {
        id: ID!
        survey: String!
        dimensions: [String!]!
        value: Float!
    }

    type Query {
        sources: [Source]
        source(id: ID!): Source
        dataPoints( survey: String!, sortBy: [String!], sortOrder: String!, dimensions: [String!]!): [DataPoint!]!)
    }

    type Mutation {
        createSource(name: String!, record: RecordInput): Source
        updateSource(id: ID!, name: String): Source
        deleteSource(id: ID!): Boolean
    }
`;

module.exports = typeDefs;