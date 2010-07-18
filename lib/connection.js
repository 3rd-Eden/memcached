var EventEmitter = require('events').EventEmitter
	Lookup 		 = require('dns').lookup,
	Utils		 = require('./utils');

exports.Manager = ConnectionManager;	// connection pooling
exports.IssueLog = IssueLog;			// connection issue handling

function IssueLog( args ){
	this.config = args;
	this.messages = [];
	this.failed = false;
	
	this.totalRetrys = 0;
	this.totalReconnectsAttempted = 0;
	this.totalReconnectsSuccess = 0;
	
	Utils.merge( this, args );
	EventEmitter.call( this );
};

var issues = IssueLog.prototype = new EventEmitter;

issues.log = function( message ){
	var issue = this;
	
	this.failed = true;
	this.messages.push( message || 'No message specified' );
	
	if( this.retrys ){
		setTimeout( Utils.curry( issue, issue.attempt ), this.retry_timeout );
		return this.emit( 'issue', this.details );
	}
	
	if( this.remove )
		return this.emit( 'remove', this.details )
	
	setTimeout(curry( issue, issue.attemptReconnect ), this.reconnect );
};

Object.defineProperty( issues, 'details', {
	get: function(){
		var res = {};
		
		res.server = this.server;
		res.tokens = this.tokens;
		res.messages = this.messages;
		
		if( this.retrys ){
			res.retrys = this.retrys;
			res.totalRetrys = this.totalretrys
		} else {
			res.totalReconnectsAttempted = this.totalReconnectsAttempted;
			res.totalReconnectsSuccess = this.totalReconnectsSuccess;
		}
		
		return res;
	}
});

issues.attemptRetry = function(){
	this.totalRetrys++;
	this.failed = false;
};
issues.attemptReconnect = function(){
	var issue = this;
	this.totalReconnectsAttempted++;
	this.emit( 'reconnecting', this.details );
	
	dns.lookup( this.tokens[1], function( err ){
		// still no access to the server
		if( err ){
			this.messages.push( message || 'No message specified' );
			return setTimeout( curry( issue, issue.attemptReconnect ), issue.reconnect );
		}
		
		issue.emit( 'reconnected', issue.details );
		
		issue.totalReconnectsSuccess++;
		issue.messages.length = 0;
		issue.failed = false;
		
		// we connected again, so we are going through the whole cycle again
		Utils.merge( issue, JSON.parse( JSON.stringify( issue.config )));
	});
};

var Manager = ConnectionManager.prototype;

Manager.allocate = function( callback ){
	var total, i = total = this.connections.length, Manager = this;
	
	// check for available
	while( i-- ){
		if( this.isAvailable( this.connections[i] ))
			return callback( false, this.connections[i] );
	}
	
	// create new
	if( total < this.total )
		return this.connections.push( this.factory.apply( this, arguments ) );
	
	// wait
	process.nextTick(function(){ Manager.allocate( callback ) })
};

Manager.isAvailable = function( connection ){
	return connection.readyState == 'open' && !( connection._writeQueue && connection._writeQueue.length );
};

Manager.remove = function( connection ){
	var position = this.connections.indexOf( connection );
	if( position !== -1 ){
		this.connections.splice( position, 1 );
		if( connection.readyState !== 'closed' && connection.end )
			connection.end();
	}
};

Manager.free  = function( keep ){
	var save = [], i = this.connections.length;
	
	while( i-- ){
		if( save.length < keep && this.isAvailable( this.connections[i] ) ){
			save.push( this.connections[i] );
			continue;
		}
		
		this.remove( this.connections[i] );
	}
	
	// update with the new active connections
	this.connections = this.connections.concat( save );
};