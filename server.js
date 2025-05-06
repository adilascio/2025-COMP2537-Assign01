// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1 }
});

let userCollection;

client.connect()
    .then(() => {
        userCollection = client.db(process.env.MONGODB_DATABASE).collection('users');
        console.log('MongoDB connected');
    })
    .catch((err) => console.error("MongoDB connection error:", err));

// Session Setup
app.use(session({
    secret: process.env.NODE_SESSION_SECRET,
    store: MongoStore.create({
        mongoUrl: uri,
        collectionName: 'sessions',
        dbName: process.env.MONGODB_DATABASE,
        crypto: { secret: process.env.MONGODB_SESSION_SECRET }
    }),
    saveUninitialized: false,
    resave: false,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

// Middleware for session check
function sessionCheck(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/');
    }
}

// Routes:

// Home Page
app.get('/', (req, res) => {
    if (req.session.authenticated) {
        res.sendFile(path.join(__dirname, 'views', 'home.html')); // logged in version
    } else {
        res.sendFile(path.join(__dirname, 'views', 'home.html')); // guest version
    }
});

// Signup Page (GET)
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

// Signup Handler (POST)
app.post('/signup', async (req, res) => {
    const schema = Joi.object({
        name: Joi.string().max(20).required(),
        email: Joi.string().email().max(30).required(),
        password: Joi.string().max(20).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.send(`Validation error: ${error.details[0].message}`);

    const hashedPassword = await bcrypt.hash(value.password, 10);
    await userCollection.insertOne({
        name: value.name,
        email: value.email,
        password: hashedPassword
    });

    req.session.authenticated = true;
    req.session.name = value.name;
    res.redirect('/members');
});

// Login Page (GET)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Login Handler (POST)
app.post('/login', async (req, res) => {
    const schema = Joi.object({
        email: Joi.string().email().max(30).required(),
        password: Joi.string().max(20).required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.send(`Validation error: ${error.details[0].message}`);

    const user = await userCollection.findOne({ email: value.email });
    if (!user || !(await bcrypt.compare(value.password, user.password))) {
        return res.send('Invalid password. <a href="/login">Try again</a>');
    }

    req.session.authenticated = true;
    req.session.name = user.name;
    res.redirect('/members');
});

// Members Only Page
app.get('/members', sessionCheck, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'members.html'));
});

// Provide username via JSON for dynamic content
app.get('/userinfo', sessionCheck, (req, res) => {
    res.json({ name: req.session.name });
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// 404 Page
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Server Listening
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Returns { name: "..."} if logged in, or 401 if not
app.get('/userinfo', sessionCheck, (req, res) => {
    res.json({ name: req.session.name });
  });
  
