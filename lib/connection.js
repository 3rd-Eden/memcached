"use strict";

var EventEmitter = require('events').EventEmitter
  , spawn = require('child_process').spawn
  , Utils = require('./utils');

exports.Manager = ConnectionManager; // connection pooling
exports.IssueLog = IssueLog;         // connection issue handling
exports.Available = ping;            // connection availablity

function ping (host, callback) {
  var pong = spawn('ping', [host]);

  pong.stdout.on('data', function stdoutdata (data) {
    callback(false, data.toString().split('\n')[0].substr(14));
    pong.kill();
  });

  pong.stderr.on('data', function stderrdata (data) {
    callback(data.toString().split('\n')[0].substr(14), false);
    pong.kill();
  });
}

function IssueLog (args) {
  this.config = args;
  this.messages = [];
  this.failed = false;

  this.totalRetries = 0;
  this.totalReconnectsAttempted = 0;
  this.totalReconnectsSuccess = 0;

  Utils.merge(this, args);
  EventEmitter.call(this);
}

var issues = IssueLog.prototype = new EventEmitter;

issues.log = function log (message) {
  var issue = this;

  this.failed = true;
  this.messages.push(message || 'No message specified');

  if (this.retries) {
    setTimeout(issue.attemptRetry.bind(issue), this.retry);
    return this.emit('issue', this.details);
  }

  if (this.remove) return this.emit('remove', this.details);

  setTimeout(issue.attemptReconnect.bind(issue), this.reconnect);
};

Object.defineProperty(issues, 'details', {
  get: function getDetails () {
    var res = {};

    res.server = this.serverAddress;
    res.tokens = this.tokens;
    res.messages = this.messages;

    if (this.retries) {
      res.retries = this.retries;
      res.totalRetries = this.totalRetries;
    } else {
      res.totalReconnectsAttempted = this.totalReconnectsAttempted;
      res.totalReconnectsSuccess = this.totalReconnectsSuccess;
      res.totalReconnectsFailed = this.totalReconnectsAttempted - this.totalReconnectsSuccess;
      res.totalDownTime = (res.totalReconnectsFailed * this.reconnect) + (this.totalRetries * this.retry);
    }

    return res;
  }
});

issues.attemptRetry = function attemptRetry () {
  this.totalRetries++;
  this.retries--;
  this.failed = false;
};

issues.attemptReconnect = function attemptReconnect () {
  var issue = this;
  this.totalReconnectsAttempted++;
  this.emit('reconnecting', this.details);

  // Ping the server
  ping(this.tokens[1], function pingpong (err) {
    // still no access to the server
    if (err) {
      this.messages.push(err.message || 'No message specified');
      return setTimeout(issue.attemptReconnect.bind(issue), issue.reconnect);
    }

    issue.emit('reconnected', issue.details);

    issue.totalReconnectsSuccess++;
    issue.messages.length = 0;
    issue.failed = false;

    // we connected again, so we are going through the whole cycle again
    Utils.merge(issue, JSON.parse(JSON.stringify(issue.config)));
  });
};

function ConnectionManager (name, limit, constructor) {
  this.name = name;
  this.total = limit;
  this.factory = constructor;
  this.connections = [];
}

var Manager = ConnectionManager.prototype;

Manager.allocate = function allocate (callback) {
  var total, i
    , Manager = this;

  i = total = this.connections.length;

  // check for available
  while (i--){
    if (this.isAvailable(this.connections[i])) {
      return callback(false, this.connections[i]);
    }
  }

  // create new
  if (total < this.total) {
    return this.connections.push(this.factory.apply(this, arguments));
  }

  // give up and don't saturate the node.js process by retying #43
  var full = new Error("All the connections in the memcached pool are busy");
  full.connectionPool = true;
  callback(full);
};

Manager.isAvailable = function isAvailable (connection) {
  var readyState = connection.readyState;
  return (readyState === 'open' || readyState === 'writeOnly')
    && !(connection._writeQueue && connection._writeQueue.length)
    && !(connection._handle && connection._handle.writeQueueSize);
};

Manager.remove = function remove (connection) {
  var position = this.connections.indexOf(connection);

  if (position !== -1) this.connections.splice(position, 1);
  if (connection.readyState && connection.readyState !== 'closed' && connection.end) {
    connection.end();
  }
};

Manager.free  = function freemymemories (keep) {
  var save = 0
    , connection;

  while (this.connections.length) {
    connection = this.connections.shift();

    if (save < keep && this.isAvailable(this.connection[0])) {
      save++;
      continue;
    }

    this.remove(connection);
  }
};
