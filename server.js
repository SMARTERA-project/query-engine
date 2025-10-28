const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const mongoose = require('mongoose');
require('dotenv').config(); // Carica le variabili da .env

// Importa la logica GraphQL
const typeDefs = require('./graphql/typeDefs');
const resolvers = require('./graphql/resolvers');

const PORT = process.env.PORT || 4000;

// Funzione per avviare il server
async function startServer() {
    const app = express();

    // Inizializza Apollo Server
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        // Puoi passare il 'context' qui se hai bisogno di condividere
        // cose come l'autenticazione (req) con i tuoi resolver
        context: ({ req }) => ({ req }) 
    });

    // Avvia Apollo Server e applicalo a Express
    await server.start();
    server.applyMiddleware({ app, path: '/graphql' });

    // Connessione a MongoDB
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('🌱 Connesso a MongoDB');
    } catch (err) {
        console.error('Errore connessione DB:', err.message);
        process.exit(1);
    }

    // Avvia il server Express
    app.listen(PORT, () => {
        console.log(`🚀 Server GraphQL pronto su http://localhost:${PORT}${server.graphqlPath}`);
    });
}

startServer();