var CreateHash = require('crypto').createHash;

exports.validateArg = function validateArg(args, config){
  var toString = Object.prototype.toString
    , err
    , callback;
  
  args.validate.forEach(function(tokens){
    var key = tokens[0]
      , value = args[key];
    
    switch(tokens[1]){
      case Number:
        if (toString.call(value) !== '[object Number]') err = 'Argument "' + key + '" is not a valid Number.';
        break;
      
      case Boolean:
        if (toString.call(value) !== '[object Boolean]') err = 'Argument "' + key + '" is not a valid Boolean.';
        break;
      
      case Array:
        if (toString.call(value) !== '[object Array]') err = 'Argument "' + key + '" is not a valid Array.';
        break;
      
      case Object:
        if (toString.call(value) !== '[object Object]') err = 'Argument "' + key + '" is not a valid Object.';
        break;
      
      case Function:
        if (toString.call(value) !== '[object Function]') err = 'Argument "' + key + '" is not a valid Function.';
        break;
      
      case String: 
        if (toString.call(value) !== '[object String]') err = 'Argument "' + key + '" is not a valid String.';
        
        if (!err && key == 'key' && value.length > config.maxKeySize){
          if (config.keyCompression){
            args[key] = CreateHash('md5').update(value).digest('hex');
            
            // also make sure you update the command
            config.command.replace(new RegExp('^(' + value + ')'), args[key]); 
          } else {
            err = 'Argument "' + key + '" is longer than the maximum allowed length of ' + config.maxKeySize;
          }
        }
        
        break;
      
      default:
        if (toString.call(value) == '[object global]' && !tokens[2]) err = 'Argument "' + key + '" is not defined.';
    }
  });
    
  if (err){
    if(callback) callback(err, false);
    return false;
  }
  
  return true;
};

// currys a function
exports.curry = function curry(context, func){
  var copy = Array.prototype.slice
    , args = copy.call(arguments, 2);
  
  return function(){
    return func.apply(context || this, args.concat(copy.call(arguments)));
  }
};

// a small util to use an object for eventEmitter
exports.fuse = function fuse(target, handlers){
  for(var i in handlers)
    if (handlers.hasOwnProperty(i)){
      target.on(i, handlers[i]);
    }
};

// merges a object's proppertys / values with a other object
exports.merge = function merge(target, obj){
  for(var i in obj){
    target[i] = obj[i];
  }
  
  return target;
};

// a small items iterator
exports.Iterator = function iterator(collection, callback){
  var arr = Array.isArray(collection)
    , keys = !arr ? Object.keys(collection) : false
    , index = 0
    , maximum = arr ? collection.length : keys.length
    , self = this;
  
  // returns next item
  this.next = function(){
    var obj = arr ? collection[index] : { key: keys[index], value: collection[keys[index]] };
    callback(obj, index++, collection, self);
  };
  
  // check if we have more items
  this.hasNext = function(){
    return index < maximum;
  };
};