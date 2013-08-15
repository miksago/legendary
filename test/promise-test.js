'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');
var sentinels = require('./sentinels');

var Promise = require('../').Promise;

describe('Promise.from()', function() {
  it('returns a promise that is an instance of Promise', function() {
    assert.instanceOf(Promise.from(sentinels.one), Promise);
  });

  it('return a promise fulfilled with the non-thenable-non-promise-value ' +
      'passed originally',
      function() {
        return assert.eventually.strictEqual(
            Promise.from(sentinels.one), sentinels.one);
      });

  it('returns a new promise adopting the state of the promise passed',
      function() {
        var promise = Promise.from(new Promise(function(resolve) {
          Promise.from(sentinels.one).then(resolve);
        }));
        return assert.eventually.strictEqual(promise, sentinels.one);
      });
});

describe('Promise.rejected()', function() {
  it('returns a promise that is an instance of Promise', function() {
    assert.instanceOf(Promise.rejected(sentinels.one), Promise);
  });

  it('returns a rejected promise', function() {
    return assert.isRejected(
        Promise.rejected(sentinels.one), sentinels.Sentinel);
  });
});

describe('Promise#to()', function() {
  it('Creates a new promise by calling \'from\' on the passed constructor',
      function() {
        var constructor = function() {};
        constructor.from = function() {
          return sentinels.one;
        };
        var spy = sinon.spy(constructor, 'from');

        var promise = Promise.from();
        var result = promise.to(constructor);

        assert.strictEqual(result, sentinels.one);
        assert.calledOnce(spy);
        assert.calledWithExactly(spy, promise);
      });
});
