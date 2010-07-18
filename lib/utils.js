exports.curry = function curry( obj, func ){
	var copy = Array.prototype.slice,
		args = copy.call( arguments, 2 );
		
	return function() {
		return func.apply(obj, args.concat( copy.call( arguments) ) );
	}
};

exports.fuse = function fuse( target, handlers ){
	for( var i in handlers )
		if( handlers.hasOwnProperty(i) )
			target.addListener( i, handlers[i] );
};

exports.merge = function merge( target, obj ){
	for( var i in obj )
		target[i] = object[i];
	
	return target;
};