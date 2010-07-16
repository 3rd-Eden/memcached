var sys = require('sys');

// A object pool manager for net.Streams
var manager = exports.manager = function( name, limit, constructor ){
	this.name = name;
	this.limit = limit;
	this.constructor = constructor;
	this.connections = [];
};

// Fetches a new active connection from the pool
manager.prototype.fetch = function( callback ){
	var total_connections, 
		i = total_connections = this.connections.length,
		self = this,
		construction,
		connection;
	
	// search for a unQueued open connection, if we have one return it
	while( i-- ){
		connection = this.connections[i];
		if( connection.readyState == 'open' && !( connection._writeQueue && connection._writeQueue.length ) && connection.available ){
			return callback( false, connection );
		}
	}
	
	// check if we are allowed to create a new connection
	if( total_connections < this.limit ){
		// the constructor function should handle the callback
		construction = this.constructor.apply( this, arguments );
		return this.connections.push( construction );
	}
	
	// we are not allowed to create new connections so we are going to check again later for
	// a new open and ready connection.
	process.nextTick( function(){ self.fetch( callback ) } );
};

// removes a connection from the pool
manager.prototype.remove = function( connection ){
	var position = this.connections.indexOf( connection );
	
	// check if we have that connection in our pool
	if( position !== -1 ){
		this.connections.splice( position, 1 );
		// close the connection, if it's still open
		if( connection.readyState !== 'closed' && connection.destroy )
			connection.destroy();
	}
};

// Free's up the pool
manager.prototype.free = function( keep ){
	var pool = [],
		count = 0,
		i = this.connections.length,
		connection;
	
	while( i-- ){
		connection = this.connections[i];
		if( count < keep && connection.readyState == 'open' && !( connection._writeQueue && connection._writeQueue.length )){
			pool.push( connection );
			count++;
			continue;
		}
		
		// we don't need to keep this connection so remove it
		this.remove( connection );
	}
	
	// update with the new active connections
	this.connections = this.connections.concat( pool );
};

// cleans up all connections, all of them
manager.prototype.destroy = function(){
	this.free(0);
}