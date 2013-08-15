'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('./sentinels');

var Promise = require('../').Promise;

var blessed = require('../lib/blessed');
function SubPromise(resolver) {
  if (typeof resolver !== 'function') {
    throw new TypeError();
  }

  if (!(this instanceof SubPromise)) {
    return new SubPromise(resolver);
  }

  if (resolver !== blessed.be) {
    blessed.be(this, resolver, true);
  }
}
blessed.extended(SubPromise, Promise);

var pending = require('./adapter').pending;
var slice = [].slice;

function identity(x) { return x; }

function resultsInCorrectSubclass(method) {
  var args = slice.call(arguments, 1);
  it('results in a correct instance when called on a subclass', function() {
    var p = SubPromise.from(sentinels.one);
    assert.instanceOf(p[method].apply(p, args), SubPromise);
  });
}

describe('Promise#yield(value)', function() {
  resultsInCorrectSubclass('yield');

  it('yields a promise fulfilled with `value`', function() {
    return assert.eventually.strictEqual(
        Promise.from(sentinels.one).yield(sentinels.two),
        sentinels.two);
  });
});

describe('Promise#yieldReason(reason)', function() {
  resultsInCorrectSubclass('yieldReason');

  it('yields a promise rejected with `reason`', function() {
    return assert.isRejected(
        Promise.from(null).yieldReason(sentinels.two),
        sentinels.Sentinel);
  });
});

describe('Promise#otherwise(onRejected)', function() {
  resultsInCorrectSubclass('otherwise', identity);

  it('does not call `onRejected` for a fulfilled promise', function() {
    var spy = sinon.spy();
    return Promise.from(sentinels.one).otherwise(spy).then(function() {
      assert.notCalled(spy);
    });
  });

  it('calls `onRejected` for a rejected promise', function() {
    var spy = sinon.spy();
    return Promise.rejected(sentinels.one).otherwise(spy).then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, sentinels.one);
    });
  });
});

describe('Promise#ensure(onFulfilledOrRejected)', function() {
  resultsInCorrectSubclass('ensure', identity);

  describe('returns a promise with the same state', function() {
    it('does so for a fulfilled promise', function() {
      return assert.eventually.strictEqual(
          Promise.from(sentinels.one).ensure(identity),
          sentinels.one);
    });

    it('does so for a rejected promise', function() {
      return assert.isRejected(
          Promise.rejected(sentinels.one).ensure(identity),
          sentinels.Sentinel);
    });
  });

  it('calls `onFulfilledOrRejected` for a fulfilled promise', function() {
    var spy = sinon.spy();
    return Promise.from(sentinels.one).ensure(spy).then(function() {
      assert.calledOnce(spy);
      assert.lengthOf(spy.firstCall.args, 0);
    });
  });

  it('is called for a rejected promise', function() {
    var spy = sinon.spy();
    return assert.isRejected(Promise.rejected(sentinels.one).ensure(spy))
        .then(function() {
          assert.calledOnce(spy);
          assert.lengthOf(spy.firstCall.args, 0);
        });
  });
});

describe('Promise#tap(onFulfilledSideEffect)', function() {
  resultsInCorrectSubclass('tap', identity);

  describe('returns a promise with the same state', function() {
    it('does so for a fulfilled promise', function() {
      return assert.eventually.strictEqual(
          Promise.from(sentinels.one).tap(identity),
          sentinels.one);
    });

    it('does so for a rejected promise', function() {
      return assert.isRejected(
          Promise.rejected(sentinels.one).tap(identity),
          sentinels.Sentinel);
    });
  });

  it('calls `onFulfilledSideEffect` for a fulfilled promise', function() {
    var spy = sinon.spy();
    return Promise.from(sentinels.one).tap(spy).then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, sentinels.one);
    });
  });

  it('does not call `onFulfilledSideEffect` for a rejected promise',
      function() {
        var spy = sinon.spy();
        return assert.isRejected(Promise.rejected(sentinels.one).tap(spy))
            .then(function() {
              assert.notCalled(spy);
            });
      });
});

describe('Promise#nodeify(callback)', function() {
  it('is a noop when called without a callback function', function() {
    var p = Promise.from(sentinels.one);
    assert.strictEqual(p.nodeify(), p);
  });

  it('returns undefined when called with a callback function', function() {
    assert.isUndefined(Promise.from(sentinels.one).nodeify(identity));
  });

  it('eventually invokes the callback with the fulfilled value', function() {
    var spy = sinon.spy();
    var p = Promise.from(sentinels.one);
    p.nodeify(spy);
    return p.then(function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, null, sentinels.one);
    });
  });

  it('eventually invokes the callback with the rejected value', function() {
    var spy = sinon.spy();
    var p = Promise.rejected(sentinels.one);
    p.nodeify(spy);
    return p.then(null, function() {
      assert.calledOnce(spy);
      assert.calledWithExactly(spy, sentinels.one);
    });
  });
});

describe('Promise#cancelAfter(milliseconds)', function() {
  it('returns the same promise', function() {
    var p = Promise.from(sentinels.one);
    assert.strictEqual(p.cancelAfter(1), p);
  });

  it('invokes cancel() after at least `milliseconds` have passed',
      function(done) {
        var p = pending().promise;
        var canceledAt;
        var stub = sinon.stub(p, 'cancel', function() {
          canceledAt = Date.now();
        });
        var start = Date.now();
        p.cancelAfter(50);

        setTimeout(function() {
          assert.calledOnce(stub);
          assert.lengthOf(stub.firstCall.args, 0);
          assert.operator(canceledAt - start, '>=', 50);
          done();
        }, 50);
      });
});

describe('Promise#send(methodName, ...args)', function() {
  resultsInCorrectSubclass('send', 'noop');

  it('invokes the method named `methodName` on the eventual promise value, ' +
      'passing the args, and returning the result',
      function() {
        var obj = {
          spy: sinon.spy(function() {
            return sentinels.three;
          })
        };

        var result = Promise.from(obj).send('spy',
            sentinels.one, sentinels.two);

        return assert.eventually.strictEqual(result, sentinels.three)
            .then(function() {
              assert.calledOnce(obj.spy);
              assert.calledOn(obj.spy, obj);
              assert.calledWithExactly(obj.spy, sentinels.one, sentinels.two);
            });
      });
});
