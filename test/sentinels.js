'use strict';

var count = 0;
function Sentinel() {
  this.id = ++count;
}

Sentinel.prototype.noop = function() {};

exports.Sentinel = Sentinel;
exports.one = new Sentinel();
exports.two = new Sentinel();
exports.three = new Sentinel();
