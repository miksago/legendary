'use strict';

var promises = require('./promises');
var TimeoutError = require('./TimeoutError');

function delay(milliseconds, promiseOrValue) {
  if (promiseOrValue instanceof promises.Promise) {
    return promiseOrValue.then(function(value) {
      return delay(milliseconds, value);
    });
  }

  return new promises.Promise(function(resolve) {
    setTimeout(function() {
      resolve(promiseOrValue);
    }, milliseconds);
  });
}

exports.delay = delay;

function timeout(milliseconds, promiseOrValue) {
  return new promises.Promise(function(resolve, reject) {
    if (promiseOrValue instanceof promises.Promise) {
      setTimeout(function() {
        reject(new TimeoutError());
      }, milliseconds);

      promiseOrValue.then(resolve, reject);
    } else {
      resolve(promiseOrValue);
    }
  });
}

exports.timeout = timeout;
