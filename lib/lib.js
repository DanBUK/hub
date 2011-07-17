var ensure_db_exists = function (cb) {
  this.exists(function (err, exists) {
    if (err) {
      cb(err, undefined);
    } else {
      if (exists == false) {
        this.create(function (err, created) { // TODO - Check actual created.ok == true
          if (err) {
            cb(err, undefined);
          } else {
            cb(undefined, true);
          }
        }.bind(this));
      } else {
        cb(undefined, true);
      }
    }
  }.bind(this));
};
module.exports.ensure_db_exists = ensure_db_exists;