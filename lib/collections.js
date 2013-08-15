'use strict';

var blessed = require('./blessed');
var promises = require('./promises');
var guards = require('./guards');

function Collection(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof Collection)) {
    return new Collection(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}

exports.Collection = blessed.extended(Collection);

function produceValue(promiseOrValue) {
  if (promiseOrValue instanceof promises.Promise) {
    return promiseOrValue.inspectState().value;
  } else {
    return promiseOrValue;
  }
}

function makeUndefined() {
  return undefined;
}

function makeTrue() {
  return true;
}

function strictlyTrue(x) {
  return x === true;
}

function identity(x) {
  return x;
}

function filterTruthy(arr) {
  return arr.filter(identity);
}

function negateIdentity(x) {
  return !x;
}

function filterOutTruthy(arr) {
  return arr.filter(negateIdentity);
}

function flatten(arr) {
  return Array.prototype.concat.apply([], arr);
}

function Shortcut(value) {
  this.value = value;
}

var TRUE_SHORTCUT = new Shortcut(true);
var FALSE_SHORTCUT = new Shortcut(false);

function shortcutDetect(iterator) {
  return function(item) {
    var result = iterator(item);
    if (result instanceof promises.Promise) {
      return result.then(function(result) {
        if (result) {
          throw new Shortcut(item);
        }
      });
    } else if (result) {
      throw new Shortcut(item);
    }
  };
}

function shortcutSome(iterator) {
  return function(item) {
    var result = iterator(item);
    if (result instanceof promises.Promise) {
      return result.then(function(result) {
        if (result) {
          throw TRUE_SHORTCUT;
        }
      });
    } else if (result) {
      throw TRUE_SHORTCUT;
    }
  };
}

function shortcutNotEvery(iterator) {
  return function(item) {
    var result = iterator(item);
    if (result instanceof promises.Promise) {
      return result.then(function(result) {
        if (!result) {
          throw FALSE_SHORTCUT;
        }
      });
    } else if (!result) {
      throw FALSE_SHORTCUT;
    }
  };
}

function extractShortcutValue(reason) {
  if (reason instanceof Shortcut) {
    return reason.value;
  }
  throw reason;
}

function prepForSort(iterator) {
  var index = 0;
  return function(item) {
    var wrapped = { sourceIndex: index++ };

    var result = iterator(item);
    if (result instanceof promises.Promise) {
      return result.then(function(sortValue) {
        wrapped.sortValue = sortValue;
        return wrapped;
      });
    } else {
      wrapped.sortValue = result;
      return wrapped;
    }
  };
}

function sortInstructions(a, b) {
  return a.sortValue < b.sortValue ? -1 : 1;
}

// All other iterator methods build on mapLimited, hence it being first in
// this file.
Collection.prototype.mapLimited = function(maxConcurrent, iterator) {
  return guards.array(this, [], function(arr) {
    return new Collection(function(resolve, reject) {
      var index = 0, stopAt = arr.length;
      var acc = new Array(stopAt);

      var running = 0;
      function oneCompleted() {
        running--;
        runConcurrent();
      }
      function oneFailed(reason) {
        index = stopAt;
        running = -1;
        reject(reason);
      }
      function runConcurrent() {
        if (index >= stopAt) {
          if (running === 0) {
            resolve(acc.map(produceValue));
          }
          return;
        }

        if (running >= maxConcurrent) {
          return;
        }

        try {
          running++;
          var value = acc[index] = iterator(arr[index]);
          index++;
          if (value instanceof promises.Promise) {
            value.then(oneCompleted, oneFailed);
          } else {
            oneCompleted();
          }
          runConcurrent();
        } catch (error) {
          oneFailed(error);
        }
      }

      runConcurrent();
    });
  });
};

Collection.prototype.each = function(iterator) {
  return this.mapLimited(Infinity, iterator)
      .then(makeUndefined).to(promises.Promise);
};

Collection.prototype.eachSeries = function(iterator) {
  return this.mapLimited(1, iterator)
      .then(makeUndefined).to(promises.Promise);
};

Collection.prototype.eachLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, iterator)
      .then(makeUndefined).to(promises.Promise);
};

Collection.prototype.map = function(iterator) {
  return this.mapLimited(Infinity, iterator);
};

Collection.prototype.mapSeries = function(iterator) {
  return this.mapLimited(1, iterator);
};

Collection.prototype.filter = function(iterator) {
  return this.mapLimited(Infinity, iterator).then(filterTruthy);
};

Collection.prototype.filterSeries = function(iterator) {
  return this.mapLimited(1, iterator).then(filterTruthy);
};

Collection.prototype.filterLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, iterator).then(filterTruthy);
};

Collection.prototype.filterOut = function(iterator) {
  return this.mapLimited(Infinity, iterator).then(filterOutTruthy);
};

Collection.prototype.filterOutSeries = function(iterator) {
  return this.mapLimited(1, iterator).then(filterOutTruthy);
};

Collection.prototype.filterOutLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, iterator).then(filterOutTruthy);
};

Collection.prototype.concat = function(iterator) {
  return this.mapLimited(Infinity, iterator).then(flatten);
};

Collection.prototype.concatSeries = function(iterator) {
  return this.mapLimited(1, iterator).then(flatten);
};

Collection.prototype.concatLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, iterator).then(flatten);
};

Collection.prototype.foldl = function(memo, iterator) {
  if (memo instanceof promises.Promise) {
    var self = this;
    return memo.then(function(memo) {
      return self.foldl(memo, iterator);
    }).to(promises.Promise);
  }

  return guards.array(this, memo, function(arr) {
    return new promises.Promise(function(resolve, reject) {
      var index = 0, stopAt = arr.length;

      function applyIterator(value) {
        if (index >= stopAt) {
          resolve(value);
          return;
        }

        value = iterator(value, arr[index]);
        index++;
        if (value instanceof promises.Promise) {
          value.then(applyIterator, reject);
        } else {
          applyIterator(value);
        }
      }

      applyIterator(memo);
    });
  }).to(promises.Promise);
};

Collection.prototype.foldr = function(memo, iterator) {
  if (memo instanceof promises.Promise) {
    var self = this;
    return memo.then(function(memo) {
      return self.foldl(memo, iterator);
    }).to(promises.Promise);
  }

  return guards.array(this, memo, function(arr) {
    return new promises.Promise(function(resolve, reject) {
      var index = arr.length - 1;

      function applyIterator(value) {
        if (index < 0) {
          resolve(value);
          return;
        }

        value = iterator(value, arr[index]);
        index--;
        if (value instanceof promises.Promise) {
          value.then(applyIterator, reject);
        } else {
          applyIterator(value);
        }
      }

      applyIterator(memo);
    });
  }).to(promises.Promise);
};

Collection.prototype.detectLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, shortcutDetect(iterator))
      .to(promises.Promise)
      .then(makeUndefined, extractShortcutValue);
};

Collection.prototype.detect = function(iterator) {
  return this.detectLimited(Infinity, iterator);
};

Collection.prototype.detectSeries = function(iterator) {
  return this.detectLimited(1, iterator);
};

Collection.prototype.someLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, shortcutSome(iterator))
      .to(promises.Promise)
      .then(strictlyTrue, extractShortcutValue);
};

Collection.prototype.some = function(iterator) {
  return this.someLimited(Infinity, iterator);
};

Collection.prototype.someSeries = function(iterator) {
  return this.someLimited(1, iterator);
};

Collection.prototype.everyLimited = function(maxConcurrent, iterator) {
  return this.mapLimited(maxConcurrent, shortcutNotEvery(iterator))
      .to(promises.Promise)
      .then(makeTrue, extractShortcutValue);
};

Collection.prototype.every = function(iterator) {
  return this.everyLimited(Infinity, iterator);
};

Collection.prototype.everySeries = function(iterator) {
  return this.everyLimited(1, iterator);
};

Collection.prototype.sortByLimited = function(maxConcurrent, iterator) {
  var self = this;
  return self.then(function(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return arr;
    }

    return self.mapLimited(maxConcurrent, prepForSort(iterator))
        .then(function(instructions) {
          instructions.sort(sortInstructions);
          var copy = arr.slice();
          for (var i = 0, l = arr.length; i < l; i++) {
            arr[i] = copy[instructions[i].sourceIndex];
          }
          return arr;
        });
  });
};

Collection.prototype.sortBy = function(iterator) {
  return this.sortByLimited(Infinity, iterator);
};

Collection.prototype.sortBySeries = function(iterator) {
  return this.sortByLimited(1, iterator);
};
