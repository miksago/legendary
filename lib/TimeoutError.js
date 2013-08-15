'use strict';

function TimeoutError() {
  this.name = 'timeout';
}

TimeoutError.prototype = new Error();
TimeoutError.prototype.constructor = TimeoutError;
TimeoutError.prototype.name = 'timeout';
TimeoutError.prototype.stack = null;
TimeoutError.prototype.inspect = function() {
  return '[TimeoutError]';
};

module.exports = TimeoutError;
