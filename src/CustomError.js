var util = require('util');
var _ = require('lodash');
var type = require('type-of');

function CustomError(err, name) {
  Error.call(this);

  if (_.isString(err)) {
    this.message = err;
  } else if (err instanceof Error) {
    this.message = err.message;
    this.stack = err.stack;
  } else {
    throw new Error('Invalid err argument; expected string or Error, received ' + type(err));
  }

  if (_.isString(name)) {
    this.name = name;
  }

  this.time = new Date();
}

util.inherits(CustomError, Error);

CustomError.prototype.name = 'Error';

module.exports = CustomError;
