const common = require("./utils/common")
const config = common.checkConfig(require('./config'), require('./config.template'))
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const bodyParser = require('body-parser');
const app = express();
const port = config.port;
const mongoose = require("mongoose");
const cors = require('cors');
const routes = require ("./api/routes/router")
const logger = require('percocologger')
logger.info(config.queryAllowedExtensions);

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(config.basePath || "/api", routes);
app.listen(port, () => {logger.info(`Server listens on http://localhost:${port}`);});
mongoose.connect(config.mongo, { useNewUrlParser: true }).then(() => {logger.info("Connected to mongo")})
logger.info(`Node.js version: ${process.version}`);

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