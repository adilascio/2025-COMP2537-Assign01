// server.js
require('dotenv').config();
const express     = require('express');
const session     = require('express-session');
const MongoStore  = require('connect-mongo');
const bcrypt      = require('bcrypt');
const Joi         = require('joi');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path        = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware setup
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const uri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}` +
            `@${process.env.MONGODB_HOST}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1 }
});

let userCollection;
client.connect()
  .then(() => {
    userCollection = client
      .db(process.env.MONGODB_DATABASE)
      .collection('users');
    console.log('MongoDB connected');
  })
  .catch(err => console.error("MongoDB connection error:", err));

// Session Setup
app.use(session({
  secret: process.env.NODE_SESSION_SECRET,
  store: MongoStore.create({
    mongoUrl:   uri,
    dbName:     process.env.MONGODB_DATABASE,
    collectionName: 'sessions',
    crypto:     { secret: process.env.MONGODB_SESSION_SECRET }
  }),
  saveUninitialized: false,
  resave: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));
// Middleware for headers
app.use((req, res, next) => {
  res.locals.authenticated = !!req.session.authenticated;
  res.locals.user_type     = req.session.user_type;
  res.locals.name          = req.session.name;
  next();
});

// Middleware for session check
function sessionCheck(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/');
}

// Middleware for admin check
function requireAdmin(req, res, next) {
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }
  if (req.session.user_type !== 'admin') {
    return res.status(403).render('403');
  }
  next();
}

// Routes:

// Home Page
app.get('/', (req, res) => {
  res.render('home', {
    authenticated: req.session.authenticated,
    name:          req.session.name
  });
});

// Signup Page (GET)
app.get('/signup', (req, res) => {
  res.render('signup');
});

// Signup Handler (POST)
app.post('/signup', async (req, res) => {
  const schema = Joi.object({
    name:     Joi.string().max(20).required(),
    email:    Joi.string().email().max(30).required(),
    password: Joi.string().max(20).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.send(`Validation error: ${error.details[0].message}`);

  const hashedPassword = await bcrypt.hash(value.password, 10);
  await userCollection.insertOne({
    name:      value.name,
    email:     value.email,
    password:  hashedPassword,
    user_type: 'user'                // default role
  });

  req.session.authenticated = true;
  req.session.name          = value.name;
  req.session.user_type     = 'user';
  res.redirect('/members');
});

// Login Page (GET)
app.get('/login', (req, res) => {
  res.render('login');
});

// Login Handler (POST)
app.post('/login', async (req, res) => {
  const schema = Joi.object({
    email:    Joi.string().email().max(30).required(),
    password: Joi.string().max(20).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.send(`Validation error: ${error.details[0].message}`);

  const user = await userCollection.findOne({ email: value.email });
  if (!user || !(await bcrypt.compare(value.password, user.password))) {
    return res.send('Invalid password. <a href="/login">Try again</a>');
  }

  req.session.authenticated = true;
  req.session.name          = user.name;
  req.session.user_type     = user.user_type;
  res.redirect('/members');
});

// Members Only Page
app.get('/members', sessionCheck, (req, res) => {
  res.render('members', {
    pageTitle: 'Members Only',
    activeTab: 'members',
    authenticated: req.session.authenticated,
    user_type: req.session.user_type,
    name:      req.session.name
  });
});

// Admin Only Page
app.get('/admin', requireAdmin, async (req, res) => {
  const users = await userCollection.find().toArray();
  res.render('admin', {
    pageTitle: 'Admin Only',
    activeTab: 'admin',
    authenticated: req.session.authenticated,
    user_type: req.session.user_type,
    name:      req.session.name,
    users
  });
});

// Admin User Management
app.post('/admin/promote/:id', requireAdmin, async (req, res) => {
  await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { user_type: 'admin' } }
  );
  res.redirect('/admin');
});

app.post('/admin/demote/:id', requireAdmin, async (req, res) => {
  await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { user_type: 'user' } }
  );
  res.redirect('/admin');
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
  res.status(404).render('404');
});

// Server Listening
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
