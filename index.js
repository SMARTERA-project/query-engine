const common = require("./utils/common")
const config = common.checkConfig(require('./config'), require('./config.template'))
const { ApolloServer } = require('apollo-server-express');
const typeDefs = require('./api/graphql/typeDefs');
const resolvers = require('./api/graphql/resolvers');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = config.port;
const mongoose = require("mongoose");
const cors = require('cors');
const routes = require("./api/routes/router")
const logger = require('percocologger')
logger.info(config.queryAllowedExtensions);

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({ req })
});
server.start().then(() => {
    //qui
    server.applyMiddleware({ app, path: '/graphql' });

    app.use(cors());
    app.use(express.urlencoded({ extended: false }));
    app.use(bodyParser.json());
    app.use(config.basePath || "/api", routes);
    //oppure qui
    // server.applyMiddleware({ app, path: '/graphql' });
    app.listen(port, () => { logger.info(`Server listens on http://localhost:${port}`); });
    mongoose.connect(config.mongo, { useNewUrlParser: true }).then(() => { logger.info("Connected to mongo") })
    logger.info(`Node.js version: ${process.version}`);
});
