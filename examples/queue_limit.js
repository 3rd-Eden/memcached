/**
 * Created with IntelliJ IDEA.
 * User: jmordetsky
 * Date: 1/24/13
 * Time: 6:33 PM
 * To change this template use File | Settings | File Templates.
 */

var crc32 = require('crc32');
var Membase = require('../index.js');
var m1 = new Membase("127.0.0.1:11211", {poolSize:50, maxQueueSize:1000});
//var m2 = new Membase("127.0.0.1:11212", {poolSize:50, maxQueueSize:1000});
//var m3 = new Membase("127.0.0.1:11213", {poolSize:50, maxQueueSize:1000});
//var m4 = new Membase("127.0.0.1:11214", {poolSize:50, maxQueueSize:1000});
//var m5 = new Membase("127.0.0.1:11215", {poolSize:50, maxQueueSize:1000});
//var m6 = new Membase("127.0.0.1:11216", {poolSize:50, maxQueueSize:1000});
//var m7 = new Membase("127.0.0.1:11217", {poolSize:50, maxQueueSize:1000});
//var m8 = new Membase("127.0.0.1:11218", {poolSize:50, maxQueueSize:1000});
//var m9 = new Membase("127.0.0.1:11219", {poolSize:50, maxQueueSize:1000});


//var membases = [m1,m2,m3,m4,m5,m6,m7,m8,m9];
var i =0;
for (i =0;i<10000;i++){
    setInterval(function(){
        go(i);
    },0);
}

function go(val){
    //random key
    var key = GUID();
    var value = GUID();
    //set
    m1.set(key, value, 60, function(err, result){
        if (err){
            if (err !== "over queue limit"){
                throw new Error(err);
            }else{
                return;
            }
        }
        console.log("SET: " + result);
        m1.get(key, function(err, result){
            if (err){
                if (err !== "over queue limit"){
                    throw new Error(err);
                }else{
                    return;
                }
            }
            console.log("GET: " + result);
        });
    } );
}

//function defaultShard(key){
//    return (((crc32(key) >>> 16) & 0x7fff) % membases.length) || 0;
//}

function S4()
{
    return Math.floor(
        Math.random() * 0x10000 /* 65536 */
    ).toString(16);
}

function GUID ()
{
    return (
        S4() + S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + "-" +
            S4() + S4() + S4()
        );
};