"use strict";

var assert = require("assert");
var sinon = require("sinon");

var adapter = global.adapter;
var pending = adapter.pending;

var sentinel = {}; // we want to be equal to this

describe("1.1.2: If `onProgress` is a function.", function(){
  describe("1.1.2.1: It must be called after progress is emitted, with the progress value as its first argument.", function(){
    specify("Emit progress", function(done){
      var resolver = pending();
      resolver.promise.then(null, null, function(value){
        assert.strictEqual(value, sentinel);
        done();
      });
      resolver.progress(sentinel);
    });
  });

  describe("1.1.2.2: Unless the `onProgress` callback throws an exception with a `.name` property equal to `'StopProgressPropagation'`, the result of the function is used as the progress value to propagate.", function(){
    specify("Returning a value.", function(done){
      var resolver = pending();
      resolver.promise.then(null, null, function(value){
        return value * 2;
      }).then(null, null, function(value){
        assert.equal(value, 4);
        done();
      });
      resolver.progress(2);
    });

    specify("Throwing 'StopProgressPropagation'.", function(done){
      var spy = sinon.spy();

      var resolver = pending();
      resolver.promise.then(null, null, function(value){
        var error = new Error();
        error.name = "StopProgressPropagation";
        throw error;
      }).then(null, null, spy);
      resolver.progress().then(function(){
        assert(!spy.called);
        done();
      });
    });
  });

  describe("1.1.2.3: If the `onProgress` callback throws an exception with a `.name` property equal to `'StopProgressPropagation'`, then the error is silenced.", function(){
    specify("The error is silenced when 'StopProgressPropagation' is thrown.", function(done){
      var spy = sinon.spy();

      var resolver = pending();
      resolver.promise.then(null, null, function(value){
        var error = new Error();
        error.name = "StopProgressPropagation";
        throw error;
      });
      resolver.progress().then(null, spy).then(function(){
        assert(!spy.called);
        done();
      });
    });

    specify("Any other errors are not silenced.", function(done){
      var resolver = pending();
      resolver.promise.then(null, null, function(value){
        throw sentinel;
      });
      resolver.progress().then(null, function(error){
        assert.strictEqual(error, sentinel);
        done();
      });
    });
  });

  describe("1.1.2.4: `onProgress` is never called once a promise has already been fulfilled or rejected.", function(){
    specify("Emit progress on a fulfilled promise", function(){
      var spy = sinon.spy();

      var resolver = pending();
      resolver.fulfill();
      resolver.promise.then(null, null, spy);
      resolver.progress().then(function(){
        assert(!spy.called);
        done();
      });
    });

    specify("Emit progress on a rejected promise", function(){
      var spy = sinon.spy();

      var resolver = pending();
      resolver.reject();
      resolver.promise.then(null, null, spy);
      resolver.progress().then(function(){
        assert(!spy.called);
        done();
      });
    });
  });
});