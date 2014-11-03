var coffeeify = require('coffeeify');
var derby = require('derby');
var express = require('express');
var redis = require('redis');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var highway = require('racer-highway');
var liveDbMongo = require('livedb-mongo');
var parseUrl = require('url').parse;
var passport = require("d-passport");
derby.use(require('racer-bundle'));

exports.setup = setup;

function setup(app, options, cb) {
  var redisClient;
  if (process.env.REDIS_HOST) {
    redisClient = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_HOST);
    redisClient.auth(process.env.REDIS_PASSWORD);
  } else if (process.env.OPENREDIS_URL) {
    var redisUrl = parseUrl(process.env.OPENREDIS_URL);
    redisClient = redis.createClient(redisUrl.port, redisUrl.hostname);
    redisClient.auth(redisUrl.auth.split(":")[1]);
  } else {
    redisClient = redis.createClient();
  }
  // redisClient.select(1);

  var mongoUrl = process.env.MONGO_URL || process.env.MONGOHQ_URL;
  if(!mongoUrl) {
    mongoUrl = "mongodb://" + (process.env.MONGO_HOST || "localhost") + ":" + (process.env.MONGO_PORT || 27017) + "/" + (process.env.MONGO_DB || "derby-app");
  }
  // The store creates models and syncs data
  var store = derby.createStore({
    db: liveDbMongo(mongoUrl + '?auto_reconnect', {safe: true})
  , redis: redisClient
  });

  var options = {
      "site": {
          "domain": "https://d-passport.herokuapp.com",
          "name": "d-passport-example",
          "email": "admin@d-passport.herokuapp.com"
      },
      "smtp": {
          "host": "smtp.mailgun.org",
          "port": "587",
          "user": "postmaster@app31228337.mailgun.org",
          "pass": "03b3c777fe8a8de5b34e6458be476aa8"
      }
  }

  passport.configure(options)
  passport.store(store)

  store.on('bundle', function(browserify) {
    // Add support for directly requiring coffeescript in browserify bundles
    browserify.transform({global: true}, coffeeify);

    // HACK: In order to use non-complied coffee node modules, we register it
    // as a global transform. However, the coffeeify transform needs to happen
    // before the include-globals transform that browserify hard adds as the
    // first trasform. This moves the first transform to the end as a total
    // hack to get around this
    var pack = browserify.pack;
    browserify.pack = function(opts) {
      var detectTransform = opts.globalTransform.shift();
      opts.globalTransform.push(detectTransform);
      return pack.apply(this, arguments);
    };
  });

  var publicDir = __dirname + '/../public';

  var handlers = highway(store);

  var expressApp = express()
    .use(express.favicon())
    // Gzip dynamically rendered content
    .use(express.compress())
    .use(express.static(publicDir))

  expressApp
    // Adds req.getModel method
    .use(store.modelMiddleware())
    .use(express.cookieParser())
    .use(express.session({
      secret: process.env.SESSION_SECRET || 'YOUR SECRET HERE'
    , store: new RedisStore({
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        pass: process.env.REDIS_PASSWORD || null
      })
    }))
    .use(express.bodyParser())
    .use(passport.middleware(expressApp))
    .use(handlers.middleware)
    .use(createUserId)

  if (options && options.static) {
    if(Array.isArray(options.static)) {
      for(var i = 0; i < options.static.length; i++) {
        var o = options.static[i];
        expressApp.use(o.route, express.static(o.dir));
      }
    } else {
      expressApp.use(express.static(options.static));
    }
  }

  expressApp
    // Creates an express middleware from the app's routes
    .use(app.router())
    .use(expressApp.router)
    .use(errorMiddleware)

  expressApp.all('*', function(req, res, next) {
    next('404: ' + req.url);
  });

  app.writeScripts(store, publicDir, {extensions: ['.coffee']}, function(err) {
    cb(err, expressApp, handlers.upgrade);
  });
}

function createUserId(req, res, next) {
  var model = req.getModel();
  if (req.session) {
    var userId = req.session.userId;
    if (!userId) userId = req.session.userId = model.id();
    model.set('_session.userId', userId);
  }
  next();
}

var errorApp = derby.createApp();
errorApp.loadViews(__dirname + '/../views/error');
errorApp.loadStyles(__dirname + '/../styles/error');

function errorMiddleware(err, req, res, next) {
  if (!err) return next();

  var message = err.message || err.toString();
  var status = parseInt(message);
  status = ((status >= 400) && (status < 600)) ? status : 500;

  if (status < 500) {
    console.log(err.message || err);
  } else {
    console.log(err.stack || err);
  }

  var page = errorApp.createPage(req, res, next);
  page.renderStatic(status, status.toString());
}
