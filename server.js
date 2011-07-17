#!/usr/bin/env node

var path = require('path');
var express = require('express');
var jade = require('jade');
var everyauth = require('everyauth');
var cradle = require('cradle');

var config = require('./config.js').opts;

var couch_guid = require(path.join(__dirname, 'lib', 'guid.js')).couch_guid;
var lib = require(path.join(__dirname, 'lib', 'lib.js'));

var couchdb = new (cradle.Connection)('http://' + '127.0.0.1', 5984, { cache: true, raw: false });
var user_guid = new couch_guid('127.0.0.1', 5984, 'hub', 'userid');
var post_guid = new couch_guid('127.0.0.1', 5984, 'hub', 'postid');

var users_meta_db = couchdb.database('hub_users_meta');
lib.ensure_db_exists.call(users_meta_db, function (err, rv) {});
var users_db = couchdb.database('hub_users');
lib.ensure_db_exists.call(users_db, function (err, rv) {});
var nicks_db = couchdb.database('hub_nicks');
lib.ensure_db_exists.call(nicks_db, function (err, rv) {});
setTimeout(function () {
  nicks_db.view('nicks/all', function (err, resp) {
    if (err && err.error == 'not_found') {
      nicks_db.save('_design/nicks', {
        all: {
          map: function (doc) {
            emit(undefined, doc.id);
          }
        }
      });
    } else if (err) {
      console.error('Failed to load nicks/all view.');
    }
  });
}, 500);

var handle_new_user_meta = function (type, id, meta, promise) {
  var key = type + '_' + id;
  users_meta_db.get(key, function (err, doc) {
    if (err && err.error == 'not_found') {
      user_guid.get(function (err, guid) {
        if (err) promise.fail(err);
        else {
          users_meta_db.save(key, {guid: guid}, function (err, doc) {
            if (err) promise.fail(err);
            else {
              users_db.save(guid.toString(), {guid: guid.toString(), type: type, meta: meta}, function (err, doc) {
                if (err) promise.fail(err);
                else {
                  promise.fulfill(doc);
                }
              });
            }
          });
        }
      });
    } else if (err) {
      promise.fail(err);
    } else {
      promise.fulfill(doc);
    }
  });
};


everyauth.everymodule
  .findUserById( function (id, callback) {
    if (id.toString() == (parseInt(id)).toString()) {
      users_db.get(id.toString(), function (err, doc) {
        if (err && err.error == 'not_found') callback(undefined, undefined);
        else if (err) callback(err, undefined);
        else callback(undefined, doc);
      });
    } else {
      users_meta_db.get(id.toString(), function (err, doc) {
        if (err && err.error == 'not_found') callback(undefined, undefined);
        else if (err) callback(err, undefined);
        else {
          users_db.get(doc.guid.toString(), function (err, doc) {
            if (err && err.error == 'not_found') callback(undefined, undefined);
            else if (err) callback(err, undefined);
            else {
              doc.id = doc._id;
              callback(undefined, doc);
            }
          });
        }
      });
    }
  });

everyauth
  .facebook
    .appId(config.facebook.app_id)
    .appSecret(config.facebook.app_secret)
    .findOrCreateUser( function (session, accessToken, accessTokenExtra, fbUserMetadata) {
      var rtv = new everyauth.Promise();
      handle_new_user_meta('facebook', fbUserMetadata.id, fbUserMetadata, rtv);
      return rtv;
    })
    .redirectPath('/');

everyauth
  .twitter
    .myHostname('http://' + config.hostname + '/')
    .consumerKey(config.twitter.consumer_key)
    .consumerSecret(config.twitter.consumer_secret)
    .findOrCreateUser( function (sess, accessToken, accessSecret, twitUser) {
      var rtv = new everyauth.Promise();
      handle_new_user_meta('twitter', twitUser.id, twitUser, rtv);
      return rtv;
    })
    .redirectPath('/');

var app = express.createServer();
app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon(__dirname + '/public/favicon.ico'));
  app.use(express.cookieParser());
  app.use(express.session({ secret: config.session_key}));
  app.use(express.bodyParser());
  app.use(express.logger());
  app.use(everyauth.middleware()); 
  app.use(express.static(__dirname + '/public')); 
});

app.get('/', function (req, res) {
  var nicks = new Array();
  nicks_db.view('nicks/all', function (err, resp) {
    if (err) {
      console.error(err);
    } else {
      for(var i in resp) {
        nicks.push(resp[i].id);
      }
    }
    res.local('nicks', nicks);
    res.render('home');
  });
});

app.get('/logout', function (req, res) {
  req.session.destroy(function (err) {
    res.redirect('/');
  });
});

var nickname_errors = [
  'Error unknown.',
  'Error saving nickname.',
  'Error loading user.',
  'Error saving user',
  'Error checking for nickname.'
];

app.get('/nickname/set/error/:error_id', function (req, res) {
  res.local('nickname', req.session.nickname_set);
  var error_id = parseInt(req.params.error_id);
  if (typeof nickname_errors[error_id] == 'undefined') error_id = 0;
  res.local('message', nickname_errors[error_id])
  res.render('nickname/set/error');
});

app.get('/nickname/set/owned', function (req, res) {
  res.local('nickname', req.session.nickname_set);
  res.render('nickname/set/owned');
});

app.post('/nickname/set', function (req, res) {
  if (typeof req.user != 'undefined' && typeof req.user.guid != 'undefined' && req.user.guid > 0) {
    var nickname = req.body.nickname;
    req.session.nickname_set = nickname;
    nicks_db.get(nickname, function (err, doc) {
      if (err && err.error == 'not_found') {
        nicks_db.save(nickname, {guids: [req.user.guid], posts: []}, function (err, doc) {
          if (err) {
            res.redirect('/nickname/set/error/1');
          } else {
            users_db.get(req.user.guid.toString(), function (err, doc) {
              if (err) {
                res.redirect('/nickname/set/error/2');
              } else {
                doc.nickname = nickname;
                users_db.save(req.user.guid.toString(), doc._rev, doc, function (err, doc) {
                  if (err) {
                    res.redirect('/nickname/set/error/3');
                  } else {
                    res.redirect('/');
                  }
                });
              }
            });
          }
        });
      } else if (err) {
        res.redirect('/nickname/set/error/4');
      } else {
        res.redirect('/nickname/set/owned');
      }
    });
  }
});

var post_errors = [
  'Error unknown.',
  'Error loading nickname.',
  'Error saving nickname.'
];

/*
app.get('/post/add/error/:error_id', function (req, res) { // NOT FINISHED
 a res.local('nickname', req.session.nickname_set);
 a var error_id = parseInt(req.params.error_id);
 a if (typeof nickname_errors[error_id] == 'undefined') error_id = 0;
 a res.local('message', nickname_errors[error_id])
 a res.render('nickname/set/error');
});
*/

app.post('/post/add', function (req, res) {
  if (typeof req.user != 'undefined' && typeof req.user.nickname != 'undefined') {
    nicks_db.get(req.user.nickname, function (err, doc) {
      if (err) {
        res.redirect('/post/add/error/1');
      } else {
        var post = {date: (new Date).toUTCString(), body: req.body.body};
        doc.posts.push(post);
        nicks_db.save(req.user.nickname, doc._rev, doc, function (err, doc) {
          if (err) {
            res.redirect('/post/add/error/2');
          } else {
            res.redirect('/' + req.user.nickname);
          }
        });
      }
    });
  } else {
    res.redirect('/');
  }
});


app.get('/:nickname', function (req, res) {
  nicks_db.get(req.params.nickname, function (err, doc) {
    if (err && err.error == 'not_found') {
      res.local('message', 'Nickname not found.');
    } else if (err) {
      res.local('message', err.toString());
    } else {
      res.local('nickname', req.params.nickname);
      res.local('posts', doc.posts);
    }
    res.render('profile');
  });
});

everyauth.helpExpress(app);

app.listen(config.port, '0.0.0.0');
