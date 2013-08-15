'use strict';

var collections = require('./collections');
var promises = require('./promises');

function sequence(arrayOfTasks) {
  var args = [];
  for (var i = 1, l = arguments.length; i < l; i++) {
    args.push(arguments[i]);
  }

  return collections.Collection.from(arrayOfTasks).mapSeries(function(task) {
    return task.apply(undefined, args);
  }).to(promises.Promise);
}

exports.sequence = sequence;

function pipeline(arrayOfTasks) {
  var firstArgs = [];
  for (var i = 1, l = arguments.length; i < l; i++) {
    firstArgs.push(arguments[i]);
  }
  var value;

  return collections.Collection.from(arrayOfTasks).eachSeries(function(task) {
    var outcome;
    if (firstArgs) {
      outcome = task.apply(undefined, firstArgs);
      firstArgs = null;
    } else {
      outcome = task(value);
    }

    if (outcome instanceof promises.Promise) {
      return outcome.then(function(outcome) {
        value = outcome;
      });
    } else {
      value = outcome;
    }
  }).then(function() {
    return value;
  });
}

exports.pipeline = pipeline;

function parallel(arrayOfTasks) {
  var args = [];
  for (var i = 1, l = arguments.length; i < l; i++) {
    args.push(arguments[i]);
  }

  return collections.Collection.from(arrayOfTasks).map(function(task) {
    return task.apply(undefined, args);
  }).to(promises.Promise);
}

exports.parallel = parallel;
