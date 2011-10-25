var EventEmitter = require('events').EventEmitter
  , Stream = require('net').Stream
  , Buffer = require('buffer').Buffer;

var HashRing = require('hashring')
  , Connection = require('./connection')
  , Utils = require('./utils')
  , Manager = Connection.Manager
  , IssueLog = Connection.IssueLog;

/**
 * Constructs a new memcached client
 *
 * @constructor
 * @param {Mixed} args Array, string or object with servers
 * @param {Object} options options
 * @api public
 */

function Client(args, options){
  if(!(this && this.hasOwnProperty && (this instanceof Client))) this = new Client();

  var servers = []
    , weights = {}
    , key;

  // Parse down the connection arguments  
  switch (Object.prototype.toString.call(args)){
    case '[object String]':
      servers.push(args);
      break;
    case '[object Object]':
      weights = args;
      servers = Object.keys(args);
    case '[object Array]':
    default:
      servers = args;
      break;
  }

  if (!servers.length) throw new Error('No servers where supplied in the arguments');

  // merge with global and user config
  Utils.merge(this, Client.config);
  Utils.merge(this, options);
  EventEmitter.call(this);

  this.servers = servers;
  this.HashRing = new HashRing(args, this.algorithm);
  this.connections = {};
  this.issues = [];
};

// Allows users to configure the memcached globally or per memcached client
Client.config = {
  maxKeySize: 251         // max key size allowed by Memcached
, maxExpiration: 2592000  // max expiration duration allowed by Memcached
, maxValue: 1048576       // max length of value allowed by Memcached

, algorithm: 'crc32'      // hashing algorithm that is used for key mapping  

, poolSize: 10            // maximal parallel connections
, reconnect: 18000000     // if dead, attempt reconnect each xx ms
, timeout: 5000           // after x ms the server should send a timeout if we can't connect
, retries: 5              // amount of retries before server is dead
, retry: 30000            // timeout between retries, all call will be marked as cache miss
, remove: false           // remove server if dead if false, we will attempt to reconnect
, redundancy: false       // allows you do re-distribute the keys over a x amount of servers
, keyCompression: true    // compress keys if they are to large (md5)
, debug: false            // Output the commands and responses
};

// There some functions we don't want users to touch so we scope them
(function(nMemcached){
  const LINEBREAK = '\r\n'
      , NOREPLY = ' noreply'
      , FLUSH = 1E3
      , BUFFER = 1E2
      , CONTINUE = 1E1
      , FLAG_JSON = 1<<1
      , FLAG_BINARY = 2<<1;

  var memcached = nMemcached.prototype = new EventEmitter
    , private = {}
    , undefined;

  // Creates or generates a new connection for the give server, the callback will receive the connection
  // if the operation was successful
  memcached.connect = function connect(server, callback){
    // server is dead, bail out
    if (server in this.issues && this.issues[server].failed) return callback(false, false);

    // fetch from connection pool
    if (server in this.connections) return this.connections[server].allocate(callback);

    // No connection factory created yet, so we must build one
    var serverTokens = /(.*):(\d+){1,}$/.exec(server).reverse()
      , memcached = this;

    serverTokens.pop();

    var sid = 0;
    this.connections[server] = new Manager(server, this.poolSize, function(callback){
      var S = new Stream
        , Manager = this;

      // config the Stream
      S.streamID = sid++;
      S.setTimeout(memcached.timeout);
      S.setNoDelay(true);
      S.metaData = [];
      S.responseBuffer = "";
      S.bufferArray = [];
      S.serverAddress = server;
      S.tokens = serverTokens;
      S.memcached = memcached;

      // Add the event listeners
      Utils.fuse(S, {
        connect: function streamConnect(){ callback(false, this) }
      , close: function streamClose(){ Manager.remove(this) }
      , error: function streamError(err){ memcached.connectionIssue(err, S, callback) }
      , data: Utils.curry(memcached, private.buffer, S)
      , timeout: function streamTimeout(){ Manager.remove(this) }
      , end: S.end
      });

      // connect the net.Stream [port, hostname]
      S.connect.apply(S, serverTokens);
      return S;
    });

    // now that we have setup our connection factory we can allocate a new connection
    this.connections[server].allocate(callback);
  };

  // Creates a multi stream, so it's easier to query agains
  // multiple memcached servers. 
  memcached.multi = function memcachedMulti(keys, callback){
    var map = {}
      , memcached = this
      , servers
      , i;

    // gets all servers based on the supplied keys,
    // or just gives all servers if we don't have keys
    if (keys){
      keys.forEach(function fetchMultipleServers(key){
        var server = memcached.HashRing.getNode(key);
        if (map[server]){
          map[server].push(key);
        } else {
          map[server] = [key];
        }
      });
      // store the servers
      servers = Object.keys(map);
    } else {
      servers = this.servers;
    }

    i = servers.length;
    while(i--){
      callback.call(this, servers[i], map[servers[i]], i, servers.length);
    }
  };

  // Executes the command on the net.Stream, if no server is supplied it will use the query.key to get 
  // the server from the HashRing
  memcached.command = function memcachedCommand(queryCompiler, server){
    // generate a regular query,
    var query = queryCompiler()
    , redundancy = this.redundancy && this.redundancy < this.servers.length
    , queryRedundancy = query.redundancyEnabled
    , memcached = this;

    // validate the arguments
    if (query.validation && !Utils.validateArg(query, this)) return;

    // fetch servers
    server = server ? server : redundancy && queryRedundancy ? (redundancy = this.HashRing.createRange(query.key, (this.redundancy + 1), true)).shift() : this.HashRing.getNode(query.key);

    // check if the server is still alive
    if (server in this.issues && this.issues[server].failed) return query.callback && query.callback(false, false);

    this.connect(server, function allocateMemcachedConnection(error, S){
      if (Client.config.debug)
        query.command.split(LINEBREAK).forEach(function(line) { console.log(S.streamID + ' \033[34m<<\033[0m ' + line); });

      // check for issues
      if (!S) return query.callback && query.callback(false, false);
      if (error) return query.callback && query.callback(error);
      if (S.readyState !== 'open') return query.callback && query.callback('Connection readyState is set to ' + S.readySate);

      // used for request timing
      query.start = Date.now();
      S.metaData.push(query);
      S.write(query.command + LINEBREAK);
    });

    // if we have redundancy enabled and the query is used for redundancy, than we are going loop over
    // the servers, check if we can reach them, and connect to the correct net connection.
    // because all redundancy queries are executed with "no reply" we do not need to store the callback
    // as there will be no value to parse.
    if (redundancy && queryRedundancy){
      queryRedundancy = queryCompiler(queryRedundancy);
      redundancy.forEach(function(server){
        if (server in memcached.issues && memcached.issues[server].failed) return;

        memcached.connect(server, function allocateMemcachedConnection(error, S){
          if (!S || error || S.readyState !== 'open') return;
          S.write(queryRedundancy.command + LINEBREAK);
        });
      })
    }
  };

  // Logs all connection issues, and handles them off. Marking all requests as cache misses.
  memcached.connectionIssue = function connectionIssue(error, S, callback){
    // end connection and mark callback as cache miss
    if (S && S.end) S.end();
    if (callback) callback(false, false);

    var issues
      , server = S.serverAddress
      , memcached = this;

    // check for existing issue logs, or create a new log
    if (server in this.issues){
      issues = this.issues[server];
    } else {
      issues = this.issues[server] = new IssueLog({
        server: server
      , tokens: S.tokens
      , reconnect: this.reconnect
      , retries: this.retries
      , retry: this.retry
      , remove: this.remove
      });

      // proxy the events
      Utils.fuse(issues, {
        issue: function(details){ memcached.emit('issue', details) }
      , failure: function(details){ memcached.emit('failure', details) }
      , reconnecting: function(details){ memcached.emit('reconnecting', details) }
      , reconnected: function(details){ memcached.emit('reconnect', details) }
      , remove: function(details){
          // emit event and remove servers
          memcached.emit('remove', details);
          memcached.connections[server].end();

          if (this.failOverServers && this.failOverServers.length){
            memcached.HashRing.replaceServer(server, this.failOverServers.shift());
          } else {
            memcached.HashRing.removeServer(server);
          }
        }
      });
    }

    // log the issue
    issues.log(error);
  };

  // Kills all active connections
  memcached.end = function endMemcached(){
    var memcached = this;
    Object.keys(this.connections).forEach(function closeConnection(key){
      memcached.connections[key].free(0)
    });
  };

  // These do not need to be publicly available as it's one of the most important
  // parts of the whole client, the parser commands:
  private.parsers = {
    // handle error responses
    'NOT_FOUND': function(tokens, dataSet, err){ return [CONTINUE, false] }
  , 'NOT_STORED': function(tokens, dataSet, err){ return [CONTINUE, false] }
  , 'ERROR': function(tokens, dataSet, err){ err.push('Received an ERROR response'); return [FLUSH, false] }
  , 'CLIENT_ERROR': function(tokens, dataSet, err){ err.push(tokens.splice(1).join(' ')); return [CONTINUE, false] }
  , 'SERVER_ERROR': function(tokens, dataSet, err, queue, S, memcached){ (memcached || this.memcached).connectionIssue(tokens.splice(1).join(' '), S); return [CONTINUE, false] }

    // keyword based responses
  , 'STORED': function(tokens, dataSet){ return [CONTINUE, true] }
  , 'DELETED': function(tokens, dataSet){ return [CONTINUE, true] }
  , 'OK': function(tokens, dataSet){ return [CONTINUE, true] }
  , 'EXISTS': function(tokens, dataSet){ return [CONTINUE, false] }
  , 'END': function(tokens, dataSet, err, queue){ if (!queue.length) queue.push(false); return [FLUSH, true] }

    // value parsing:
  , 'VALUE': function(tokens, dataSet, err, queue){
      var key = tokens[1]
        , flag = +tokens[2]
        , expire = tokens[3]
        , cas = tokens[4]
        , multi = this.metaData[0] && this.metaData[0].multi || cas ? {} : false
        , tmp;

      switch (flag){
        case FLAG_JSON:
          dataSet = JSON.parse(dataSet);
          break;
        case FLAG_BINARY:
          tmp = new Buffer(dataSet.length);
          tmp.write(dataSet, 0, 'binary');
          dataSet = tmp;
          break;
        }

      // Add to queue as multiple get key key key key key returns multiple values
      if (!multi){
        queue.push(dataSet);
      } else {
        multi[key] = dataSet;
        if (cas) multi.cas = cas;
        queue.push(multi);
      }

      return [BUFFER, false] 
    }
  , 'INCRDECR': function(tokens){ return [CONTINUE, +tokens[1]] }
  , 'STAT': function(tokens, dataSet, err, queue){
      queue.push([tokens[1], /^\d+$/.test(tokens[2]) ? +tokens[2] : tokens[2]]);
      return [BUFFER, true] 
    }
  , 'VERSION': function(tokens, dataSet){
      var versionTokens = /(\d+)(?:\.)(\d+)(?:\.)(\d+)$/.exec(tokens.pop());

      return [CONTINUE, {
        server: this.serverAddress
      , version: versionTokens[0]
      , major: versionTokens[1] || 0
      , minor: versionTokens[2] || 0
      , bugfix: versionTokens[3] || 0
      }];
    }
  , 'ITEM': function(tokens, dataSet, err, queue){
      queue.push({
        key: tokens[1]
      , b: +tokens[2].substr(1)
      , s: +tokens[4]
      });
      return [BUFFER, false]
    }
  };

  // Parses down result sets
  private.resultParsers = {
    // combines the stats array, in to an object
    'stats': function(resultSet){
      var response = {};

      // add references to the retrieved server
      response.server = this.serverAddress;

      // Fill the object 
      resultSet.forEach(function(statSet){
        response[statSet[0]] = statSet[1];
      });

      return response;
    }

    // the settings uses the same parse format as the regular stats
  , 'stats settings': function(){ return private.resultParsers.stats.apply(this, arguments) }
    // Group slabs by slab id
  , 'stats slabs': function(resultSet){
      var response = {};

      // add references to the retrieved server
      response.server = this.serverAddress;

      // Fill the object 
      resultSet.forEach(function(statSet){
        var identifier = statSet[0].split(':');

        if (!response[identifier[0]]) response[identifier[0]] = {};
        response[identifier[0]][identifier[1]] = statSet[1];
      });

      return response;
    }
  , 'stats items': function(resultSet){
      var response = {};

      // add references to the retrieved server
      response.server = this.serverAddress;

      // Fill the object 
      resultSet.forEach(function(statSet){
        var identifier = statSet[0].split(':');

        if (!response[identifier[1]]) response[identifier[1]] = {};
        response[identifier[1]][identifier[2]] = statSet[1];

      });

      return response;
    }
  };

  // Generates a RegExp that can be used to check if a chunk is memcached response identifier
  private.allCommands = new RegExp('^(?:' + Object.keys(private.parsers).join('|') + '|\\d' + ')');
  private.bufferedCommands = new RegExp('^(?:' + Object.keys(private.parsers).join('|') + ')');

  // When working with large chunks of responses, node chunks it in to pieces. So we might have
  // half responses. So we are going to buffer up the buffer and user our buffered buffer to query
  // against. Also when you execute allot of .writes to the same stream, node will combine the responses
  // in to one response stream. With no indication where it had cut the data. So it can be it cuts inside the value response,
  // or even right in the middle of a line-break, so we need to make sure, the last piece in the buffer is a LINEBREAK
  // because that is all what is sure about the Memcached Protocol, all responds end with them.
  private.buffer = function BufferBuffer(S, BufferStream){
    S.responseBuffer += BufferStream;

    // only call transform the data once we are sure, 100% sure, that we valid response ending
    if (S.responseBuffer.substr(S.responseBuffer.length - 2) === LINEBREAK){
      var chunks = S.responseBuffer.split(LINEBREAK);

      if (Client.config.debug)
        chunks.forEach(function(line) { console.log(S.streamID + ' \033[35m>>\033[0m ' + line); });

      S.responseBuffer = ""; // clear!
      this.rawDataReceived(S, S.bufferArray = S.bufferArray.concat(chunks));
    } 
  };

  // The actual parsers function that scan over the responseBuffer in search of Memcached response
  // identifiers. Once we have found one, we will send it to the dedicated parsers that will transform
  // the data in a human readable format, deciding if we should queue it up, or send it to a callback fn. 
  memcached.rawDataReceived = function rawDataReceived(S){
    var queue = []
      , token
      , tokenSet
      , dataSet = ''
      , resultSet
      , metaData
      , err = []
      , tmp;

    while(S.bufferArray.length && private.allCommands.test(S.bufferArray[0])){

      token = S.bufferArray.shift();
      tokenSet = token.split(' ');

      // special case for digit only's these are responses from INCR and DECR
      if (/^\d+$/.test(tokenSet[0])) tokenSet.unshift('INCRDECR');

      // special case for value, it's required that it has a second response!
      // add the token back, and wait for the next response, we might be handling a big 
      // ass response here.
      if (tokenSet[0] == 'VALUE' && S.bufferArray.indexOf('END') == -1){
        return S.bufferArray.unshift(token);
      }

      // check for dedicated parser
      if (private.parsers[tokenSet[0]]){

        // fetch the response content
        if (tokenSet[0] == 'VALUE') {
          while(S.bufferArray.length){
            if (private.bufferedCommands.test(S.bufferArray[0])) break;

            dataSet += S.bufferArray.shift();
          };
        }

        resultSet = private.parsers[tokenSet[0]].call(S, tokenSet, dataSet || token, err, queue, this);

        // check how we need to handle the resultSet response
        switch(resultSet.shift()){
          case BUFFER:
            break;

          case FLUSH:
            metaData = S.metaData.shift();
            resultSet = queue;

            // if we have a callback, call it
            if (metaData && metaData.callback){
              metaData.execution = Date.now() - metaData.start;
              metaData.callback.call(
                metaData, err.length ? err : err[0],

                // see if optional parsing needs to be applied to make the result set more readable
                private.resultParsers[metaData.type] ? private.resultParsers[metaData.type].call(S, resultSet, err) :
                !Array.isArray(queue) || queue.length > 1 ? queue : queue[0] 
             );
            }

            queue.length = err.length = 0;
            break;

          case CONTINUE:
          default:
            metaData = S.metaData.shift();

            if (metaData && metaData.callback){
              metaData.execution = Date.now() - metaData.start;
              metaData.callback.call(metaData, err.length > 1 ? err : err[0], resultSet[0]);
            }

            err.length = 0;
            break;
        }
      } else {
        // handle unkown responses
        metaData = S.metaData.shift();
        if (metaData && metaData.callback){
          metaData.execution = Date.now() - metaData.start;
          metaData.callback.call(metaData, 'Unknown response from the memcached server: "' + token + '"', false);
        }
      }

      // cleanup
      dataSet = ''
      tokenSet = metaData = undefined;

      // check if we need to remove an empty item from the array, as splitting on /r/n might cause an empty
      // item at the end.. 
      if (S.bufferArray[0] === '') S.bufferArray.shift();
    };
  };

  // Small wrapper function that only executes errors when we have a callback
  private.errorResponse = function errorResponse(error, callback){
    if (typeof callback == 'function') callback(error, false);

    return false;
  };
  
  // This is where the actual Memcached API layer begins:
  memcached.get = function get(key, callback){
    if (Array.isArray(key)) return this.getMulti.apply(this, arguments);

    this.command(function getCommand(noreply){ return {
      key: key
    , callback: callback
    , validate: [['key', String], ['callback', Function]]
    , type: 'get'
    , command: 'get ' + key
    }});
  };

  // the difference between get and gets is that gets, also returns a cas value
  // and gets doesn't support multi-gets at this moment.
  memcached.gets = function get(key, callback){
    this.command(function getCommand(noreply){ return {
      key: key
    , callback: callback
    , validate: [['key', String], ['callback', Function]]
    , type: 'gets'
    , command: 'gets ' + key
    }});
  };

  // Handles get's with multiple keys
  memcached.getMulti = function getMulti(keys, callback){
    var memcached = this
      , responses = {}
      , errors = []
      , calls

      // handle multiple responses and cache them untill we receive all. 
      , handle = function(err, results){
          if (err) errors.push(err);

          // add all responses to the array
          (Array.isArray(results) ? results : [results]).forEach(function(value){ Utils.merge(responses, value) });

          if (!--calls) callback(errors.length ? errors : false, responses);
        };

    this.multi(keys, function(server, key, index, totals){
      if (!calls) calls = totals;

      memcached.command(function getMultiCommand(noreply){ return {
          callback: handle
        , multi:true
        , type: 'get'
        , command: 'get ' + key.join(' ')
        }},
        server
     );
    });
  };

  // As all command nearly use the same syntax we are going to proxy them all to this 
  // function to ease maintenance. This is possible because most set commands will use the same
  // syntax for the Memcached server. Some commands do not require a lifetime and a flag, but the
  // memcached server is smart enough to ignore those. 
  private.setters = function setters(type, validate, key, value, lifetime, callback, cas){
    var flag = 0
      , memcached = this
      , valuetype = typeof value
      , length;

    if (Buffer.isBuffer(value)){
      flag = FLAG_BINARY;
      value = value.toString('binary');
    } else if (valuetype !== 'string' && valuetype !== 'number'){
      flag = FLAG_JSON;
      value = JSON.stringify(value);
    } else {
      value = value.toString();
    }

    length = Buffer.byteLength(value);
    if (length > memcached.maxValue) return private.errorResponse('The length of the value is greater than ' + memcached.maxValue, callback);

    memcached.command(function settersCommand(noreply){ return {
      key: key
    , callback: callback
    , lifetime: lifetime
    , value: value
    , cas: cas
    , validate: validate
    , type: type
    , redundancyEnabled: true
    , command: [type, key, flag, lifetime, length].join(' ') +
           (cas ? ' ' + cas : '') + 
           (noreply ? NOREPLY : '') + 
           LINEBREAK + value
    }});
  };

  // Curry the function and so we can tell the type our private set function
  memcached.set = Utils.curry(false, private.setters, 'set', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]]);
  memcached.replace = Utils.curry(false, private.setters, 'replace', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]]);
  memcached.add = Utils.curry(false, private.setters, 'add', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]]);

  memcached.cas = function checkandset(key, value, cas, lifetime, callback){
    private.setters.call(this, 'cas', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]], key, value, lifetime, callback, cas);
  };

  memcached.append = function append(key, value, callback){
    private.setters.call(this, 'append', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]], key, value, 0, callback);
  };

  memcached.prepend = function prepend(key, value, callback){
    private.setters.call(this, 'prepend', [['key', String], ['lifetime', Number], ['value', String], ['callback', Function]], key, value, 0, callback);
  };

  // Small handler for incr and decr's
  private.incrdecr = function incrdecr(type, key, value, callback){
    this.command(function incredecrCommand(noreply){ return {
      key: key
    , callback: callback
    , value: value
    , validate: [['key', String], ['value', Number], ['callback', Function]]
    , type: type
    , redundancyEnabled: true
    , command: [type, key, value].join(' ') +
           (noreply ? NOREPLY : '')
    }});
  };

  // Curry the function and so we can tell the type our private incrdecr
  memcached.increment = memcached.incr = Utils.curry(false, private.incrdecr, 'incr');
  memcached.decrement = memcached.decr = Utils.curry(false, private.incrdecr, 'decr');

  // Deletes the keys from the servers
  memcached.del = function del(key, callback){
    this.command(function deleteCommand(noreply){ return {
      key: key
    , callback: callback
    , validate: [['key', String], ['callback', Function]]
    , type: 'delete'
    , redundancyEnabled: true
    , command: 'delete ' + key + 
           (noreply ? NOREPLY : '')
    }});
  };
  memcached['delete'] = memcached.del;

  // Small wrapper that handle single keyword commands such as FLUSH ALL, VERSION and STAT
  private.singles = function singles(type, callback){
    var memcached = this
      , responses = []
      , errors = []
      , calls

      // handle multiple servers
      , handle = function(err, results){
        if (err) errors.push(err);
        if (results) responses = responses.concat(results);

        // multi calls should ALWAYS return an array!
        if (!--calls) callback(errors, responses);
      };

    this.multi(false, function(server, keys, index, totals){
      if (!calls) calls = totals;

      memcached.command(function singlesCommand(noreply){ return {
          callback: handle
        , type: type
        , command: type
        }},
        server
     );
    });
  };

  // Curry the function and so we can tell the type our private singles
  memcached.version = Utils.curry(false, private.singles, 'version');
  memcached.flush = Utils.curry(false, private.singles, 'flush_all');
  memcached.stats = Utils.curry(false, private.singles, 'stats');
  memcached.settings = Utils.curry(false, private.singles, 'stats settings');
  memcached.slabs = Utils.curry(false, private.singles, 'stats slabs');
  memcached.items = Utils.curry(false, private.singles, 'stats items');

  // You need to use the items dump to get the correct server and slab settings
  // see simple_cachedump.js for an example
  memcached.cachedump = function cachedump(server, slabid, number, callback){
    this.command(function cachedumpCommand(noreply){ return {
        callback: callback
      , number: number
      , slabid: slabid
      , validate: [['number', Number], ['slabid', Number], ['callback', Function]]
      , type: 'stats cachedump'
      , command: 'stats cachedump ' + slabid + ' ' + number
      }},
      server
   );
  };

})(Client);

module.exports = Client;
