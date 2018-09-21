import { IMemcachedConfig } from './types'

export const DEFAULT_CONFIG: IMemcachedConfig = {
    maxKeySize: 250,         // max key size allowed by Memcached
    maxExpiration: 2592000,  // max expiration duration allowed by Memcached
    maxValue: 1048576,       // max length of value allowed by Memcached
    activeQueries: 0,
    maxQueueSize: -1,
    algorithm: 'md5',        // hashing algorithm that is used for key mapping
    compatibility: 'ketama', // hashring compatibility

    poolSize: 10,            // maximal parallel connections
    retries: 2,              // Connection pool retries to pull connection from pool
    factor: 3,               // Connection pool retry exponential backoff factor
    minTimeout: 1000,        // Connection pool retry min delay before retrying
    maxTimeout: 60000,       // Connection pool retry max delay before retrying
    randomize: false,        // Connection pool retry timeout randomization

    reconnect: 18000000,     // if dead, attempt reconnect each xx ms
    timeout: 1000,           // after x ms the server should send a timeout if we can't connect
    failures: 5,             // Number of times a server can have an issue before marked dead
    failuresTimeout: 300000, // Time after which `failures` will be reset to original value, since last failure
    retry: 1000 ,            // When a server has an error, wait this amount of time before retrying
    idle: 1000,              // Remove connection from pool when no I/O after `idle` ms
    remove: false,           // remove server if dead if false, we will attempt to reconnect
    redundancy: 0,           // allows you do re-distribute the keys over a x amount of servers
    keyCompression: true,    // compress keys if they are to large (md5)
    namespace: '',           // sentinel to prepend to all memcache keys for namespacing the entries
    debug: false,            // Output the commands and responses

    defaultTTL: 600,
    failOverServers: [],
}
