'use strict';

var legendary = require('./legendary');
var blessed = require('./blessed');
var ResolutionPropagator = require('./ResolutionPropagator');

var slice = [].slice;

function Promise(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof Promise)) {
    return new Promise(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}

exports.Promise = Promise;

function prepRace(Constructor, retry, input, race) {
  if (input instanceof Promise) {
    return input.then(function(input) {
      return retry.call(Constructor, input);
    });
  }

  var queue, result;
  if (Array.isArray(input)) {
    if (input.length === 0) {
      result = Constructor.from([]);
    } else {
      result = [];
      queue = input.map(function(item, index) {
        return {
          value: item,
          key: index
        };
      });
    }
  } else if (input && typeof input === 'object') {
    var keys = Object.keys(input);
    if (keys.length === 0) {
      result = Constructor.from([]);
    } else {
      result = {};
      queue = keys.map(function(key) {
        return {
          value: input[key],
          key: key
        };
      });
    }
  } else {
    result = Constructor.rejected(
        new TypeError('Can\'t get values of non-object or array'));
  }

  if (!queue) {
    return result;
  }

  return new Constructor(function(resolve, reject) {
    race(queue, result, resolve, reject);
  });
}

function ttrue() {
  return true;
}

Promise.from = function(value) {
  return new ResolutionPropagator(this, null, true).resolve(
      false, value
  ).promise();
};

Promise.rejected = function(reason) {
  return new ResolutionPropagator(this, null, true).resolve(
      true, reason, legendary.unhandledRejection(reason)
  ).promise();
};

Promise.all = function(input) {
  return prepRace(this, this.all, input,
      function(queue, result, resolve, loose) {
        var winsRequired = queue.length;
        function win(key, value) {
          result[key] = value;
          if (--winsRequired === 0) {
            resolve(result);
          }
        }

        queue.forEach(function(descriptor) {
          if (descriptor.value instanceof Promise) {
            descriptor.value.then(function(value) {
              win(descriptor.key, value);
            }, loose);
          } else {
            win(descriptor.key, descriptor.value);
          }
        });
      });
};

Promise.any = function(input) {
  return prepRace(this, this.any, input,
      function(queue, reasons, resolve, reject) {
        var lossesNeeded = queue.length;
        var isWon = false;
        function win(value) {
          if (!isWon) {
            isWon = true;
            resolve(value);
          }
        }
        function loose(key, reason) {
          reasons[key] = reason;
          if (!isWon && --lossesNeeded === 0) {
            reject(reasons);
          }
        }

        queue.some(function(descriptor) {
          if (descriptor.value instanceof Promise) {
            descriptor.value.then(win, function(reason) {
              loose(descriptor.key, reason);
            });
          } else {
            win(descriptor.value);
          }
          return isWon;
        });
      });
};

Promise.some = function(input, winsRequired) {
  return prepRace(this, this.some, input,
        function(queue, result, resolve, reject) {
          var lossesNeeded = queue.length - winsRequired;
          var reasons = Array.isArray(result) ? [] : {};
          function win(key, value) {
            result[key] = value;
            if (--winsRequired === 0) {
              if (Array.isArray(result)) {
                resolve(result.filter(ttrue));
              } else {
                resolve(result);
              }
            }
          }
          function loose(key, reason) {
            reasons[key] = reason;
            if (--lossesNeeded === 0) {
              if (Array.isArray(reasons)) {
                reject(reasons.filter(ttrue));
              } else {
                reject(reasons);
              }
            }
          }

          queue.some(function(descriptor) {
            if (descriptor.value instanceof Promise) {
              descriptor.value.then(function(value) {
                win(descriptor.key, value);
              }, function(reason) {
                loose(descriptor.key, reason);
              });
            } else {
              win(descriptor.key, descriptor.value);
            }
            return winsRequired === 0;
          });
        });
};

Promise.join = function() {
  return this.all(slice.call(arguments));
};

Promise.prototype.then = function(/*onFulfilled, onRejected*/) {
  return this.constructor(function() {});
};

Promise.prototype.inspectState = function() {
  return {
    isFulfilled: false,
    isRejected: false
  };
};

Promise.prototype.cancel = function() {};

// For `fork()` and `uncancellable()` we resolve the propagator with a
// thenable. Passing a promise would lead it to attempt to adopt state
// synchonously, and propagate cancellation to the current promise.
Promise.prototype.fork = function() {
  return new ResolutionPropagator(this.constructor, null, true).resolve(
    false, { then: this.then }
  ).promise();
};

Promise.prototype.uncancellable = function() {
  return new ResolutionPropagator(this.constructor, null, false).resolve(
    false, { then: this.then }
  ).promise();
};

Promise.prototype.to = function(constructor) {
  return constructor.from(this);
};

Promise.prototype.trace = function(/*label, meta*/) {
  return this;
};

Promise.prototype.traceFulfilled = function(/*label, meta*/) {
  return this;
};

Promise.prototype.traceRejected = function(/*label, meta*/) {
  return this;
};

Promise.prototype.yield = function(value) {
  return this.then(function() {
    return value;
  });
};

Promise.prototype.yieldReason = function(reason) {
  return this.then(function() {
    throw reason;
  });
};

Promise.prototype.otherwise = function(onRejected) {
  return this.then(null, onRejected);
};

Promise.prototype.ensure = function(onFulfilledOrRejected) {
  var handler = function() {
    return onFulfilledOrRejected();
  };

  return this.then(handler, handler).yield(this);
};

Promise.prototype.tap = function(onFulfilledSideEffect) {
  return this.then(onFulfilledSideEffect).yield(this);
};

// DONT COMMIT UNTIL RACERS ARE IN
Promise.prototype.spread = function(variadicOnFulfilled) {
  return this.constructor.all(this, function(args) {
    if (!Array.isArray(args)) {
      throw new TypeError('Can\'t spread non-array value');
    }

    return variadicOnFulfilled.apply(undefined, args);
  });
};

Promise.prototype.nodeify = function(callback) {
  if (typeof callback !== 'function') {
    return this;
  }

  this.then(function(value) {
    callback(null, value);
  }, callback);
};

Promise.prototype.cancelAfter = function(milliseconds) {
  setTimeout(this.cancel, milliseconds);
  return this;
};

Promise.prototype.send = function(methodName) {
  var args = slice.call(arguments, 1);
  return this.then(function(value) {
    return value[methodName].apply(value, args);
  });
};
