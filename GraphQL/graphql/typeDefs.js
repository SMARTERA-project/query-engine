const { gql } = require('apollo-server-express');

// Usiamo i template literal (backticks) per definire lo schema
const typeDefs = gql`
    # Un tipo che definisce l'oggetto User
    type User {
        id: ID!
        username: String!
        email: String!
        createdAt: String
    }

    # Query disponibili (il "READ")
    type Query {
        users: [User]
        user(id: ID!): User
    }

    # Mutation disponibili (il "WRITE": Create, Update, Delete)
    type Mutation {
        createUser(username: String!, email: String!): User
        updateUser(id: ID!, username: String): User
        deleteUser(id: ID!): Boolean
    }

    # --- 1. DEFINIAMO IL NUOVO TIPO ---
    type Post {
        id: ID!
        title: String!
        content: String
        createdAt: String
        
        # NOTA: Qui non diciamo ID! Diciamo che il tipo è 'User'
        # Questa è la magia di GraphQL: astrae la relazione.
        author: User 
    }

    # --- 2. ESTENDIAMO IL TIPO USER ESISTENTE ---
    extend type User {
        # Aggiungiamo un campo "calcolato": i post di questo utente
        # Questo campo NON ESISTE nel DB, sarà calcolato dai resolver.
        posts: [Post] 
    }

    # --- 3. AGGIUNGIAMO LE NUOVE "PORTE D'INGRESSO" ---
    extend type Query {
        posts: [Post]       # Una query per avere tutti i post
        post(id: ID!): Post # Una query per un post singolo
    }

    extend type Mutation {
        # Una mutazione per creare un post.
        # Per creare, ci serve l'ID dell'autore.
        createPost(title: String!, content: String, authorId: ID!): Post
    }
`;

module.exports = typeDefs;