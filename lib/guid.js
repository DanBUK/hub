(function () {
  var cradle = require('cradle');
  
  var couch_guid = function (host, port, prefix, guid_type) {
    this.__setup(host, port, prefix, guid_type);
  };
  couch_guid.prototype.__setup = function (host, port, prefix, guid_type) {
    this.guid_type = guid_type;
    this.ready = false;
    this.couch = new (cradle.Connection)('http://' + host, port, { cache: false, raw: false });
    this.db = this.couch.database(prefix + '_guids');
    this.db.exists(function (err, exist) {
      if (err) console.error(err);
      else {
        if (exist == false) {
          this.db.create(function (err, created) {
            if (err) console.error(err);
            else {
              this.__init_guid();
            }
          }.bind(this));
        } else {
          this.__init_guid();
        }
      }
    }.bind(this));
  };
  couch_guid.prototype.__init_guid = function () {
    this.db.get(this.guid_type, function (err, doc) {
      if (err) {
        if (err.error && err.error == 'not_found') {
          this.db.save(this.guid_type, {guid: 0}, function (err, resp) {
            if (err) console.error(err);
            else {
              this.ready = true;
            }
          }.bind(this));
        }
      } else {
        this.ready = true;
      }
    }.bind(this));
  };
  couch_guid.prototype.get = function (cb) {
    if (this.ready == true) {
      this.db.get(this.guid_type, function (err, doc) {
        if (err) cb(err, undefined);
        else {
          var guid = parseInt(doc.guid);
          guid++;
          this.db.save(this.guid_type, doc._rev, {guid: guid}, function (err, resp) {
            if (err) cb(err, undefined);
            else {
              cb(undefined, guid);
            }
          }.bind(this));
        }
      }.bind(this));
    } else {
      cb('not_ready', undefined);
    }
  };
  
  module.exports.couch_guid = couch_guid;
})();