'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('./sentinels');

var Promise = require('../').Promise;
var Collection = require('../').Collection;

var blessed = require('../lib/blessed');
function SubCollection(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof SubCollection)) {
    return new SubCollection(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}
blessed.extended(SubCollection, Collection);

var adapter = require('./adapter');
var fulfilled = adapter.fulfilled;
var rejected = adapter.rejected;

function identity(x) { return x; }
function thrower(x) { throw x; }

function determineMaxConcurrent(method) {
  if (/Series$/.test(method)) {
    return 1;
  } else if (/Limited$/.test(method)) {
    return 2;
  } else {
    return Infinity;
  }
}

function makeCallMethod(method, maxConcurrent) {
  return function(collection, iterator) {
    if (/Limited$/.test(method)) {
      return collection[method](maxConcurrent, iterator);
    } else {
      return collection[method](iterator);
    }
  };
}

function resultsInCollection(callMethod) {
  it('results in a Collection instance', function() {
    assert.instanceOf(callMethod(Collection.from([]), identity), Collection);
  });

  it('results in a correct instance when called on a subclass', function() {
    assert.instanceOf(callMethod(SubCollection.from([]), identity),
        SubCollection);
  });
}

function resultsInPromise(callMethod) {
  describe('results in a Promise instance, not Collection', function() {
    it('does so on success', function() {
      var result = callMethod(Collection.from([]), identity);
      assert.instanceOf(result, Promise);
      assert.notInstanceOf(result, Collection);
    });

    it('does so on failure', function() {
      var result = callMethod(Collection.from([42]), thrower);
      assert.instanceOf(result, Promise);
      assert.notInstanceOf(result, Collection);
    });
  });
}

function usesMapLimited(callMethod, maxConcurrent) {
  it('uses #mapLimited(' + maxConcurrent + ', iterator) under the hood',
      function() {
        var collection = Collection.from([42]);
        var spy = sinon.spy(collection, 'mapLimited');
        callMethod(collection, identity);
        assert.calledOnce(spy);
        assert.calledWithExactly(spy, maxConcurrent, identity);
      });
}

describe('Collection#mapLimited()', function() {
  describe('promises an empty array unless it receives a ' +
      'non-empty array value',
      function() {
        it('does so for an empty array', function() {
          var result = Collection.from([]).mapLimited(1, identity);
          return assert.eventually.deepEqual(result, []);
        });

        it('does so for a non-array', function() {
          var result = Collection.from(42).mapLimited(1, identity);
          return assert.eventually.deepEqual(result, []);
        });
      });

  resultsInCollection(function(collection, iterator) {
    return collection.mapLimited(2, iterator);
  });

  it('promises rejection if the iterator throws', function() {
    var result = Collection.from([sentinels.one]).mapLimited(1, thrower);
    return assert.isRejected(result, sentinels.Sentinel);
  });

  it('promises rejection with the reason of the first rejected promise ' +
      'returned by the iterator',
      function() {
        var arr = [null, rejected(sentinels.one), rejected()];
        var result = Collection.from(arr).mapLimited(1, identity);
        return assert.isRejected(result, sentinels.Sentinel);
      });

  it('calls iterator with item, in order',
      function() {
        var spy = sinon.spy();
        var arr = [sentinels.one, sentinels.two, sentinels.three];
        return Collection.from(arr).mapLimited(1, spy).then(function() {
          assert.calledThrice(spy);
          assert.deepEqual(spy.firstCall.args, [sentinels.one]);
          assert.deepEqual(spy.secondCall.args, [sentinels.two]);
          assert.deepEqual(spy.thirdCall.args, [sentinels.three]);
        });
      });

  it('returns the result of the map operation', function() {
    var arr = [2, 4, 8];
    var result = Collection.from(arr).mapLimited(1, function(value) {
      if (value < 8) {
        return value * value;
      }
      return fulfilled(value * value);
    });
    return assert.eventually.deepEqual(result, [4, 16, 64]);
  });

  it('respects the max concurrency', function() {
    function testIteration(iterationIndex, allSpies) {
      // Only previous iterators should have been called.
      allSpies.forEach(function(spy, spyIndex) {
        if (spyIndex < iterationIndex) {
          assert.called(spy);
        } else if (spyIndex > iterationIndex) {
          assert.notCalled(spy);
        }
      });

      return fulfilled().then(function() {
        // Given concurrency of 2, previous and the *next*
        // iterator should have been called.
        allSpies.forEach(function(spy, spyIndex) {
          if (spyIndex < iterationIndex || spyIndex === iterationIndex + 1) {
            assert.called(spy);
          } else if (spyIndex > iterationIndex) {
            assert.notCalled(spy);
          }
        });
      });
    }

    var spies = [];
    for (var i = 0; i < 10; i++) {
      spies.push(sinon.spy(testIteration));
    }

    var index = 0;
    return Collection.from(spies).mapLimited(2, function(spy) {
      return spy(index++, spies);
    });
  });
});

function testIterators(methods, describeMore, doesResultInCollection) {
  methods.forEach(function(method) {
    var maxConcurrent = determineMaxConcurrent(method);
    var callMethod = makeCallMethod(method, maxConcurrent);

    describe('Collection#' + method + '()', function() {
      usesMapLimited(callMethod, maxConcurrent);

      if (doesResultInCollection !== false) {
        resultsInCollection(callMethod);
      } else {
        resultsInPromise(callMethod);
      }

      if (describeMore) {
        describeMore(callMethod, method, maxConcurrent);
      }
    });
  });
}

testIterators(['each', 'eachSeries', 'eachLimited'], function(callMethod) {
  describe('promises undefined regardless of value', function() {
    it('does so for an empty array', function() {
      var result = callMethod(Collection.from([]), identity);
      return assert.eventually.isUndefined(result);
    });

    it('does so for a non-empty array', function() {
      var result = callMethod(Collection.from([42]), identity);
      return assert.eventually.isUndefined(result);
    });

    it('does so for a non-array', function() {
      var result = callMethod(Collection.from(42), identity);
      return assert.eventually.isUndefined(result);
    });
  });
}, false);

testIterators(['map', 'mapSeries']);

testIterators(
    ['filter', 'filterSeries', 'filterLimited'],
    function(callMethod) {
      it('returns the filtered items', function() {
        var arr = ['', 'foo', 0, 1, {}, [], null, undefined, true, false];
        var result = callMethod(Collection.from(arr), identity);
        return assert.eventually.deepEqual(result, ['foo', 1, {}, [], true]);
      });
    });

testIterators(
    ['filterOut', 'filterOutSeries', 'filterOutLimited'],
    function(callMethod) {
      it('returns the non-filtered-out items', function() {
        var arr = ['', 'foo', 0, 1, {}, [], null, undefined, true, false];
        var result = callMethod(Collection.from(arr), identity);
        return assert.eventually.deepEqual(
            result, ['', 0, null, undefined, false]);
      });
    });

testIterators(
    ['concat', 'concatSeries', 'concatLimited'],
    function(callMethod) {
      it('returns the concatenated items', function() {
        var arr = ['foo', ['bar'], ['baz', 'thud']];
        var result = callMethod(Collection.from(arr), identity);
        return assert.eventually.deepEqual(
            result, ['foo', 'bar', 'baz', 'thud']);
      });
    });

['foldl', 'foldr'].forEach(function(method) {
  var fromLeft = method === 'foldl';

  describe('Collection#' + method + '()', function() {
    resultsInPromise(function(collection, iterator) {
      return Collection.from([])[method](null, iterator);
    });

    describe('promises the memo value unless it receives a ' +
        'non-empty array value, without calling the iterator',
        function() {
          it('does so for an empty array', function() {
            var spy = sinon.spy();
            var result = Collection.from([])[method](sentinels.one, spy);
            return assert.eventually.strictEqual(result, sentinels.one).then(
                function() {
                  return assert.notCalled(spy);
                });
          });

          it('does so for a non-array', function() {
            var spy = sinon.spy();
            var result = Collection.from(42)[method](sentinels.one, spy);
            return assert.eventually.strictEqual(result, sentinels.one).then(
                function() {
                  return assert.notCalled(spy);
                });
          });
        });

    it('calls iterator with memo and item, in order',
        function() {
          var spy = sinon.spy(identity);
          var arr = [sentinels.one, sentinels.two, sentinels.three];
          var result = Collection.from(arr)[method](sentinels.one, spy);
          return result.then(function() {
            assert.calledThrice(spy);
            if (fromLeft) {
              assert.deepEqual(spy.firstCall.args,
                  [sentinels.one, sentinels.one]);
              assert.deepEqual(spy.secondCall.args,
                  [sentinels.one, sentinels.two]);
              assert.deepEqual(spy.thirdCall.args,
                  [sentinels.one, sentinels.three]);
            } else {
              assert.deepEqual(spy.firstCall.args,
                  [sentinels.one, sentinels.three]);
              assert.deepEqual(spy.secondCall.args,
                  [sentinels.one, sentinels.two]);
              assert.deepEqual(spy.thirdCall.args,
                  [sentinels.one, sentinels.one]);
            }
          });
        });

    it('returns the result of the operation', function() {
      var arr = [0, 2, 2, 3];
      var result = Collection.from(arr)[method]([1], function(memo, item) {
        return memo.concat(memo[memo.length - 1] + item);
      });
      var expected;
      if (fromLeft) {
        expected = [1, 1, 3, 5, 8];
      } else {
        expected = [1, 4, 6, 8, 8];
      }
      return assert.eventually.deepEqual(result, expected);
    });
  });
});

function testCheckers(methods, describeMore) {
  methods.forEach(function(method) {
    var maxConcurrent = determineMaxConcurrent(method);
    var callMethod = makeCallMethod(method, maxConcurrent);

    describe('Collection#' + method + '()', function() {
      resultsInPromise(callMethod);

      if (/Limited$/.test(method)) {
        it('uses #mapLimited(maxConcurrent, func) under the hood', function() {
          var collection = Collection.from([42]);
          var spy = sinon.spy(collection, 'mapLimited');
          callMethod(collection, identity);
          assert.calledOnce(spy);
          assert.lengthOf(spy.firstCall.args, 2);
          assert.equal(spy.firstCall.args[0], maxConcurrent);
          assert.isFunction(spy.firstCall.args[1]);
        });
      } else {
        var limitedMethod = method.replace(/Series$/, '') + 'Limited';
        it('uses #' + limitedMethod + '(' + maxConcurrent + ', iterator) ' +
            'under the hood',
            function() {
              var collection = Collection.from([42]);
              var spy = sinon.spy(collection, limitedMethod);
              callMethod(collection, identity);
              assert.calledOnce(spy);
              assert.calledWithExactly(spy, maxConcurrent, identity);
            });
      }

      if (describeMore) {
        describeMore(callMethod, method, maxConcurrent);
      }
    });
  });
}

testCheckers(['detect', 'detectSeries', 'detectLimited'],
    function(callMethod, method) {
      var arr = [sentinels.one, sentinels.two, sentinels.three];

      it('returns the detected item', function() {
        var result = callMethod(Collection.from(arr), function(item) {
          return item === sentinels.two;
        });
        return assert.eventually.strictEqual(result, sentinels.two);
      });

      it('returns undefined if it can’t detect the item', function() {
        var result = callMethod(Collection.from(arr), function() {
          return false;
        });
        return assert.eventually.isUndefined(result);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Collection.from(arr), function(item) {
          return Promise.from(item === sentinels.two);
        });
        return assert.eventually.strictEqual(result, sentinels.two);
      });

      if (method === 'detectSeries') {
        it('indeed stops iteration once an item is detected', function() {
          var spy = sinon.spy(function(item) {
            return item === sentinels.two;
          });
          var result = callMethod(Collection.from(arr), spy);
          return assert.eventually.strictEqual(result, sentinels.two)
              .then(function() {
                assert.calledTwice(spy);
                assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                assert.deepEqual(spy.secondCall.args, [sentinels.two]);
              });
        });
      }
    });

testCheckers(['some', 'someSeries', 'someLimited'],
    function(callMethod, method) {
      var arr = [sentinels.one, sentinels.two, sentinels.three];

      it('returns `true` if an iterator returns a truthy value', function() {
        var result = callMethod(Collection.from(arr), function(item) {
          return item === sentinels.two;
        });
        return assert.eventually.strictEqual(result, true);
      });

      it('returns `false` if no iterator returns a truthy value', function() {
        var result = callMethod(Collection.from(arr), function() {
          return false;
        });
        return assert.eventually.strictEqual(result, false);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Collection.from(arr), function(item) {
          return Promise.from(item === sentinels.two);
        });
        return assert.eventually.strictEqual(result, true);
      });

      if (method === 'someSeries') {
        it('indeed stops iteration once an iterator returns a truthy value',
            function() {
              var spy = sinon.spy(function(item) {
                return item === sentinels.two;
              });
              var result = callMethod(Collection.from(arr), spy);
              return assert.eventually.strictEqual(result, true)
                  .then(function() {
                    assert.calledTwice(spy);
                    assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                    assert.deepEqual(spy.secondCall.args, [sentinels.two]);
                  });
            });
      }
    });

testCheckers(['every', 'everySeries', 'everyLimited'],
    function(callMethod, method) {
      var arr = [sentinels.one, sentinels.two, sentinels.three];

      it('returns `true` if all iterators return a truthy value', function() {
        var result = callMethod(Collection.from(arr), function() {
          return true;
        });
        return assert.eventually.strictEqual(result, true);
      });

      it('returns `false` if an iterator returns a falsy value', function() {
        var result = callMethod(Collection.from(arr), function(item) {
          return item !== sentinels.two;
        });
        return assert.eventually.strictEqual(result, false);
      });

      it('handles the iterator returning a promise', function() {
        var result = callMethod(Collection.from(arr), function() {
          return Promise.from(true);
        });
        return assert.eventually.strictEqual(result, true);
      });

      if (method === 'everySeries') {
        it('indeed stops iteration once an iterator returns a falsy value',
            function() {
              var spy = sinon.spy(function(item) {
                return item !== sentinels.two;
              });
              var result = callMethod(Collection.from(arr), spy);
              return assert.eventually.strictEqual(result, false)
                  .then(function() {
                    assert.calledTwice(spy);
                    assert.deepEqual(spy.firstCall.args, [sentinels.one]);
                    assert.deepEqual(spy.secondCall.args, [sentinels.two]);
                  });
            });
      }
    });

['sortBy', 'sortBySeries', 'sortByLimited'].forEach(function(method) {
  var maxConcurrent = determineMaxConcurrent(method);
  var callMethod = makeCallMethod(method, maxConcurrent);

  describe('Collection#' + method + '()', function() {
    resultsInCollection(callMethod);

    if (/Limited$/.test(method)) {
      it('uses #mapLimited(maxConcurrent, func) under the hood', function() {
        var collection = Collection.from([42]);
        var spy = sinon.spy(collection, 'mapLimited');
        callMethod(collection, identity);
        return fulfilled().then(function() {
          assert.calledOnce(spy);
          assert.lengthOf(spy.firstCall.args, 2);
          assert.equal(spy.firstCall.args[0], maxConcurrent);
          assert.isFunction(spy.firstCall.args[1]);
        });
      });
    } else {
      var limitedMethod = method.replace(/Series$/, '') + 'Limited';
      it('uses #' + limitedMethod + '(' + maxConcurrent + ', iterator) ' +
          'under the hood',
          function() {
            var collection = Collection.from([42]);
            var spy = sinon.spy(collection, limitedMethod);
            callMethod(collection, identity);
            assert.calledOnce(spy);
            assert.calledWithExactly(spy, maxConcurrent, identity);
          });
    }

    it('results in a correctly sorted array', function() {
      var four = new sentinels.Sentinel();
      var arr = [sentinels.three, sentinels.two, four, sentinels.one];
      var result = callMethod(Collection.from(arr), function(item) {
        if (item !== four) {
          return Promise.from(item.id);
        }
        return item.id;
      });
      return assert.eventually.strictEqual(result, arr).then(function() {
        var expected = [sentinels.one, sentinels.two, sentinels.three, four];
        assert.deepEqual(arr, expected);
      });
    });
  });
});
