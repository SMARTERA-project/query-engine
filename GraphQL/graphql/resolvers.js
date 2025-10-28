// Importiamo i modelli Mongoose
const User = require('../models/user');
const Post = require('../models/post');

const resolvers = {
    Query: {
        // Funzione per recuperare tutti gli utenti
        users: async () => {
            return await User.find();
        },
        
        // Funzione per recuperare un singolo utente by ID
        user: async (parent, { id }) => {
            return await User.findById(id);
        },

        posts: async () => {
            // Trova tutti i post. 
            // .populate('author') dice a Mongoose: "prendi l'ID nel campo 'author'
            // e usalo per cercare l'utente intero nella collezione 'User'"
            return await Post.find().populate('author');
        },
        
        post: async (parent, { id }) => {
            return await Post.findById(id).populate('author');
        }
    },

    Mutation: {
        // Funzione per creare un utente
        createUser: async (parent, { username, email }) => {
            const newUser = new User({ username, email });
            return await newUser.save();
        },

        // Funzione per aggiornare un utente
        updateUser: async (parent, { id, username }) => {
            // Trova e aggiorna l'utente, restituendo il documento aggiornato
            return await User.findByIdAndUpdate(
                id, 
                { username: username }, 
                { new: true } // Opzione per restituire il nuovo oggetto
            );
        },

        // Funzione per eliminare un utente
        deleteUser: async (parent, { id }) => {
            try {
                await User.findByIdAndDelete(id);
                return true; // Successo
            } catch (err) {
                return false; // Fallimento
            }
        },

        createPost: async (parent, { title, content, authorId }) => {
            // 1. Crea il nuovo post in memoria
            const newPost = new Post({
                title: title,
                content: content,
                author: authorId // Assegniamo l'ID dell'autore
            });
            
            // 2. Salvalo nel database
            await newPost.save();
            
            // 3. Popola l'autore prima di restituirlo (come da contratto TypeDefs)
            // (Alternativa a .populate() è farlo a mano come sotto)
            return newPost.populate('author');
        }
    },

    User: {
        // Questo resolver viene eseguito ogni volta che 
        // un 'User' viene richiesto E la query chiede il campo 'posts'
        posts: async (parentUser) => {
            // 'parentUser' è l'utente restituito dal resolver genitore
            // (es. dalla query 'user(id: "123")')
            
            // Cerchiamo nel DB tutti i Post dove il campo 'author'
            // è uguale all'ID dell'utente genitore.
            return await Post.find({ author: parentUser.id });
        }
    },
    
    Post: {
        // Questo resolver viene eseguito ogni volta che 
        // un 'Post' viene richiesto E la query chiede il campo 'author'
        // NOTA: Se usiamo .populate() come sopra, questo è ridondante,
        // ma è fondamentale per capire come funziona.
        author: async (parentPost) => {
            // 'parentPost' è il post restituito dal resolver genitore
            // (es. dalla query 'posts()')
            
            // Usiamo l'ID salvato in parentPost.author per
            // cercare l'utente completo nel DB.
            return await User.findById(parentPost.author);
        }
    }
};

module.exports = resolvers;