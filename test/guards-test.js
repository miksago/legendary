'use strict';

var assert = require('chai').assert;
var sinon = require('sinon');

var guards = require('../lib/guards');

var adapter = require('./adapter');
var fulfilled = adapter.fulfilled;

var sentinel = {};

describe('guards', function() {
  describe('array()', function() {
    it('results in the default value for a non-array', function() {
      var result = guards.array(fulfilled('string'), sentinel);
      return assert.eventually.strictEqual(result, sentinel);
    });

    it('results in the default value for an empty array', function() {
      var result = guards.array(fulfilled([]), sentinel);
      return assert.eventually.strictEqual(result, sentinel);
    });

    it('invokes the next method for a non-empty array', function() {
        var arr = [true];
        var promise = fulfilled(arr);
        var next = sinon.stub();
        next.returns(sentinel);
        var result = guards.array(promise, null, next);
        return assert.eventually.strictEqual(result, sentinel).then(
            function() {
              assert.calledOnce(next);
              assert.calledWithExactly(next, arr, promise);
            });
      });
  });
});
