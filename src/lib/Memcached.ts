import { EventEmitter } from 'events'
import HashRing = require('hashring')
import Jackpot = require('jackpot')

import {
    CommandCompiler,
    CommandOptions,
    CommandType,
    IMemcachedCommand,
    makeCommand,
} from './commands'

import {
    FLAG_BINARY,
    FLAG_JSON,
    FLAG_NUMERIC,
    LINEBREAK,
    NOREPLY,
    RESULT_PARSERS,
    TOKEN_TYPES,
} from './constants'

import { DEFAULT_CONFIG } from './defaults'
import { IIssueLogDetails, IssueLog } from './IssueLog'
import { MemcachedSocket } from './MemcachedSocket'

import {
    CallbackFunction,
    ICasResult,
    IMemcachedConfig,
    IParseResult,
    ParseCommand,
    Servers,
} from './types'

import * as Parser from './parser'
import * as Utils from './utils'

const ALL_COMMANDS = new RegExp('^(?:' + TOKEN_TYPES.join('|') + '|\\d' + ')')
const BUFFERED_COMMANDS = new RegExp('^(?:' + TOKEN_TYPES.join('|') + ')')

interface IConnectionMap {
    [name: string]: Jackpot<MemcachedSocket>
}

interface IConnectionLike {
    serverAddress: string
    hosts: Array<string>
    end?: () => void
}

interface IIssueMap {
    [name: string]: IssueLog
}

interface IMultiSetMap {
    [key: string]: any
}

type MultiStreamOperation =
    (server: string, key: Array<string>, serverIndex: number, totalServers: number) => Promise<any>

export class Memcached extends EventEmitter {
    public static config: IMemcachedConfig = DEFAULT_CONFIG

    private _config: IMemcachedConfig
    private _hashRing: HashRing
    private _activeQueries: number
    private _servers: Array<string>
    private _issues: IIssueMap
    private _connections: IConnectionMap

    constructor(servers: Servers, options: Partial<IMemcachedConfig> = {}) {
        super()
        this._config = Utils.merge(Memcached.config, options)
        this._hashRing = new HashRing(servers)
        this._activeQueries = 0
        this._servers = []
        this._issues = {}
        this._connections = {}

        if (Array.isArray(servers)) {
            this._servers = servers

        } else if (typeof servers === 'object') {
            this._servers = Object.keys(servers)

        } else if (typeof servers === 'string') {
            this._servers.push(servers)
        }
    }

    public end(): void {
        Object.keys(this._connections).forEach((key: string) => {
            this._connections[key].end()
        })
    }

    public touch(key: string, ttl: number = this._config.defaultTTL): Promise<boolean> {
        const fullkey = `${this._config.namespace}${key}`
        return this._executeCommand((): CommandOptions => ({
            type: 'touch',
            key: fullkey,
            lifetime: ttl,
            validate: [
                ['key', String],
                ['lifetime', Number],
            ],
            command: `touch ${fullkey} ${ttl}`,
        }))
    }

    public set(key: string, value: any, ttl: number = this._config.defaultTTL): Promise<boolean> {
        return this._setters(
            'set',
            key,
            value,
            ttl,
        )
    }

    public add(key: string, value: any, ttl: number = this._config.defaultTTL): Promise<boolean> {
        return this._setters(
            'add',
            key,
            value,
            ttl,
        )
    }

    // check and set
    public cas(key: string, value: any, cas: string, ttl: number = this._config.defaultTTL): Promise<boolean> {
        return this._setters(
            'cas',
            key,
            value,
            ttl,
            cas,
        )
    }

    public del(key: string): Promise<void> {
        const fullkey = `${this._config.namespace}${key}`
        return this._executeCommand((noreply) => ({
            type: 'delete',
            key: fullkey,
            validate: [
                ['key', String],
            ],
            redundancyEnabled: true,
            command: `delete ${fullkey}${(noreply ? NOREPLY : '')}`,
        }))
    }

    public delete(key: string): Promise<void> {
        return this.del(key)
    }

    public get<T = any>(key: string | Array<string>): Promise<T> {
        if (Array.isArray(key)) {
            return this.getMulti(key)

        } else {
            const fullkey = `${this._config.namespace}${key}`
            return this._executeCommand((noreply: boolean): CommandOptions => ({
                type: 'get',
                key: fullkey,
                validate: [
                    ['key', String],
                ],
                command: `get ${fullkey}`,
            }))
        }
    }

    // the difference between get and gets is that gets, also returns a cas value
    // and gets doesn't support multi-gets at this moment.
    public gets(key: string): Promise<ICasResult> {
        const fullkey = `${this._config.namespace}${key}`
        return this._executeCommand((noreply: boolean): CommandOptions => ({
            type: 'gets',
            key: fullkey,
            validate: [
                ['key', String],
            ],
            command: `gets ${fullkey}`,
        }))
    }

    public incr(key: string, value: number): Promise<number|boolean> {
        return this._incrdecr('incr', key, value)
    }

    public increment(key: string, value: number): Promise<number|boolean> {
        return this.incr(key, value)
    }

    public decr(key: string, value: number): Promise<number|boolean> {
        return this._incrdecr('decr', key, value)
    }

    public decrement(key: string, value: number): Promise<number|boolean> {
        return this.decr(key, value)
    }

    // You need to use the items dump to get the correct server and slab settings
    // see simple_cachedump.js for an example
    public cachedump(server: string, slabid: number, num: number): Promise<void> {
        return this._executeCommand((noreply) => ({
            type: 'stats cachedump',
            number: num,
            slabid,
            validate: [
                ['number', Number],
                ['slabid', Number],
            ],
            command: `stats cachedump ${slabid} ${num}`,
        }), server)
    }

    public version(): Promise<any> {
        return this._singles('version')
    }

    public flush(): Promise<any> {
        return this._singles('flush_all')
    }

    public flushAll(): Promise<any> {
        return this.flush()
    }

    public stats(): Promise<any> {
        return this._singles('stats')
    }

    public settings(): Promise<any> {
        return this._singles('stats settings')
    }

    public statsSettings(): Promise<void> {
        return this.settings()
    }

    public slabs(): Promise<any> {
        return this._singles('stats slabs')
    }

    public statsSlabs(): Promise<void> {
        return this.slabs()
    }

    public items(): Promise<any> {
        return this._singles('stats items')
    }

    public statsItems(): Promise<void> {
        return this.items()
    }

    // Handles get's with multiple keys
    public getMulti(keys: Array<string>): Promise<any> {
        let responses: any = {}

        keys = keys.map((key: string): string => {
            return `${this._config.namespace}${key}`
        })

        return this._multi(keys, (
            server: string,
            key: Array<string>,
            serverIndex: number,
            totalServers: number,
        ): Promise<any> => {
            return this._executeCommand((noreply: boolean): CommandOptions => ({
                type: 'get',
                multi: true,
                command: `get ${key.join(' ')}`,
                key: keys,
                validate: [
                    ['key', Array],
                ],
            }), server)

        }).then((results: Array<any>) => {
            results.forEach((next: any) => {
                // add all responses to the array
                (Array.isArray(next) ? next : [next]).forEach((value: any) => {
                    if (value && this._config.namespace.length) {
                        const nsKey: string = Object.keys(value)[0]
                        const newvalue: { [key: string]: any } = {}

                        newvalue[nsKey.replace(this._config.namespace, '')] = value[nsKey]
                        responses = Utils.merge(responses, newvalue)
                    } else {
                        responses = Utils.merge(responses, value)
                    }
                })
            })

            return responses
        })
    }

    public setMulti(pairs: IMultiSetMap, ttl: number = this._config.defaultTTL): Promise<boolean> {
        const promises = []

        for (const key of Object.keys(pairs)) {
            const value = pairs[key]

            promises.push(this.set(key, value, ttl))
        }

        return Promise.all(promises).then((ok) => true, (e) => false)
    }

    // Creates a multi stream, so it's easier to query agains multiple memcached
    // servers.
    private _multi(keys: Array<string>, op: MultiStreamOperation): Promise<Array<any>> {
        // Map of server name to keys on that server
        const promises: Array<Promise<any>> = []
        const serverMap: { [name: string]: Array<string> } = {}
        let servers: Array<string>
        let i: number

        // gets all servers based on the supplied keys,
        // or just gives all servers if we don't have keys
        if (keys && keys.length > 0) {
            keys.forEach((key: string): void => {
                const server: string = this._servers.length === 1
                    ? this._servers[0]
                    : this._hashRing.get(key)

                if (serverMap[server]) {
                    serverMap[server].push(key)

                } else {
                    serverMap[server] = [key]
                }
            })

            // store the servers
            servers = Object.keys(serverMap)
        } else {
            servers = this._servers
        }

        i = servers.length

        while (i--) {
            promises.push(op(servers[i], serverMap[servers[i]], i, servers.length))
        }

        return Promise.all(promises)
    }

    private _singles(type: CommandType): Promise<Array<any>> {
        return this._multi([], (
            server: string,
            key: Array<string>,
            serverIndex: number,
            totalServers: number,
        ): Promise<any> => {
            return this._executeCommand((noreply) => ({
                type,
                command: type,
            }), server)
        })
    }

    private _incrdecr(type: 'incr' | 'decr', key: string, value: number): Promise<number|boolean> {
        const fullkey = `${this._config.namespace}${key}`
        return this._executeCommand((noreply) => ({
            type,
            key: fullkey,
            value,
            validate: [
                ['key', String],
                ['value', Number],
            ],
            redundancyEnabled: true,
            command: [type, fullkey, value].join(' ') +
                (noreply ? NOREPLY : ''),
        }))
    }

    // As all command nearly use the same syntax we are going to proxy them all to
    // this function to ease maintenance. This is possible because most set
    // commands will use the same syntax for the Memcached server. Some commands
    // do not require a lifetime and a flag, but the memcached server is smart
    // enough to ignore those.
    private async _setters(
        type: CommandType,
        key: string,
        value: any,
        lifetime: number,
        cas: string = '',
    ): Promise<boolean> {
        const fullKey = `${this._config.namespace}${key}`
        let flag: number = 0
        const valuetype: string = typeof value

        if (Buffer.isBuffer(value)) {
            flag = FLAG_BINARY
            value = value.toString('binary')

        } else if (valuetype === 'number') {
            flag = FLAG_NUMERIC
            value = value.toString()

        } else if (valuetype !== 'string') {
            flag = FLAG_JSON
            value = JSON.stringify(value)
        }

        value = Utils.escapeValue(value)

        const length: number = Buffer.byteLength(value)

        if (length > this._config.maxValue) {
            return this._throwError(new Error(`The length of the value is greater than ${this._config.maxValue}`))

        } else {
            return this._executeCommand((noreply): CommandOptions => ({
                type,
                key: fullKey,
                lifetime,
                value,
                cas,
                validate: [
                    ['key', String],
                    ['value', String],
                    ['lifetime', Number],
                ],
                redundancyEnabled: false,
                command: `${type} ${fullKey} ${flag} ${lifetime} ${length}` +
                    (cas ? ` ${cas}` : '') +
                    (noreply ? NOREPLY : '') +
                    LINEBREAK + value,
            }))
        }
    }

    private _failedServers(): Array<string> {
        const result: Array<string> = []

        for (const server in this._issues) {
            if (this._issues[server].failed) {
                result.push(server)
            }
        }

        return result
    }

    private async _executeCommand(compiler: CommandCompiler, server?: string): Promise<any> {
        this._activeQueries += 1
        const command: IMemcachedCommand = makeCommand(compiler())

        if (this._activeQueries > this._config.maxQueueSize && this._config.maxQueueSize > 0) {
            return this._throwError(new Error('over queue limit'))

        } else {
            const argsError = Utils.validateArg(command, this._config)
            if (argsError !== undefined) {
                this._activeQueries -= 1
                return this._throwError(new Error(argsError))

            } else {
                 // generate a regular query,
                const redundancy = this._config.redundancy < this._servers.length
                const queryRedundancy = command.redundancyEnabled
                let redundants: Array<string> = []

                if (redundancy && queryRedundancy) {
                    redundants = this._hashRing.range(command.key, (this._config.redundancy + 1), true)
                }

                // try to find the correct server for this query
                if (server === undefined) {
                    // no need to do a hashring lookup if we only have one server assigned to
                    // us
                    if (this._servers.length === 1) {
                        server = this._servers[0]

                    } else {
                        if (redundancy && queryRedundancy) {
                            server = redundants.shift()

                        } else {
                            server = this._hashRing.get(command.key)
                        }
                    }
                }

                // check if any server exists or and if the server is still alive
                // a server may not exist if the manager was never able to connect
                // to any server.
                if (server === undefined || (server in this._issues && this._issues[server].failed)) {
                    const failedServers: string = this._failedServers().join()
                    return this._throwError(new Error(`Server at ${failedServers} not available`))

                } else {
                    return this._connect(server).then((socket: MemcachedSocket | undefined) => {
                        return new Promise((resolve, reject) => {
                            if (!socket) {
                                const connectionLike: IConnectionLike = {
                                    serverAddress: server!,
                                    hosts: server!.split(':').reverse(),
                                }
                                const message: string = `Unable to connect to socket[${server}]`
                                const err = new Error(message)
                                this._connectionIssue(message, connectionLike)
                                reject(err)

                            } else {
                                if (this._config.debug) {
                                    command.command.split(LINEBREAK).forEach((line) => {
                                        console.log(socket.streamID + ' << ' + line)
                                    })
                                }

                                if (!socket.writable) {
                                    const err = new Error(`Unable to write to socket[${socket.serverAddress}]`)
                                    this._connectionIssue(err.toString(), socket)
                                    reject(err)

                                } else {
                                    const handleData = (data: Buffer) => {
                                        this._buffer(socket, data, (err, result) => {
                                            socket.removeListener('data', handleData)
                                            if (err) {
                                                reject(err)
                                            } else {
                                                resolve(result)
                                            }
                                        })
                                    }

                                    socket.on('data', handleData)

                                    // used for request timing
                                    command.start = Date.now()
                                    // used
                                    socket.metaData.push(command)
                                    const commandString: string = `${command.command}${LINEBREAK}`
                                    socket.write(commandString)
                                }
                            }
                        })
                    }).catch((err: Error) => {
                        const connectionLike: IConnectionLike = {
                            serverAddress: server!,
                            hosts: server!.split(':').reverse(),
                        }

                        this._connectionIssue(err.toString(), connectionLike)

                        return this._throwError(err)
                    })
                }
            }
        }
    }

    private _connectionIssue(error: string, socket: IConnectionLike): void {
        if (socket && socket.end) {
            socket.end()
        }

        let issues
        const server = socket.serverAddress
        const memcached = this

        // check for existing issue logs, or create a new log
        if (server in this._issues) {
            issues = this._issues[server]

        } else {
            issues = this._issues[server] = new IssueLog({
                server,
                hosts: socket.hosts,
                reconnect: this._config.reconnect,
                failures: this._config.failures,
                failuresTimeout: this._config.failuresTimeout,
                retry: this._config.retry,
                remove: this._config.remove,
                failOverServers: this._config.failOverServers,
            })

            // proxy the events
            Utils.fuse(issues, {
                issue: (details: IIssueLogDetails) => {
                    memcached.emit('issue', details)
                },
                failure: (details: IIssueLogDetails) => {
                    memcached.emit('failure', details)
                },
                reconnecting: (details: IIssueLogDetails) => {
                    memcached.emit('reconnecting', details)
                },
                reconnected: (details: IIssueLogDetails) => {
                    memcached.emit('reconnect', details)
                },
                remove: (details: IIssueLogDetails) => {
                    // emit event and remove servers
                    memcached.emit('remove', details)
                    memcached._connections[server].end()

                    if (memcached._config.failOverServers.length > 0) {
                        memcached._hashRing.swap(server, memcached._config.failOverServers.shift()!)

                    } else {
                        memcached._hashRing.remove(server)
                        memcached.emit('failure', details)
                    }
                },
            })

            // bumpt the event listener limit
            issues.setMaxListeners(0)
        }

        // log the issue
        issues.log(error)
    }

    // Creates or generates a new connection for the give server, the callback
    // will receive the connection if the operation was successful
    private _connect(server: string): Promise<MemcachedSocket | undefined> {
        return new Promise((resolve, reject) => {
            const memcached = this

            // Default port to 11211
            if (!server.match(/(.+):(\d+)$/)) {
                server = `${server}:11211`
            }

            // server is dead, bail out
            if (server in this._issues && this._issues[server].failed) {
                return resolve()

            } else {
                // fetch from connection pool
                if (this._connections[server] === undefined) {
                    // No connection factory created yet, so we must build one
                    const serverHosts: Array<string> = (Array.isArray(server) && server[0] === '/')
                        ? server
                        : /(.*):(\d+){1,}$/.exec(server)!.reverse()

                    // Pop original string from array
                    if (Array.isArray(serverHosts)) {
                        serverHosts.pop()
                    }

                    let sid: number = 0

                    /**
                     * Generate a new connection pool manager.
                     */
                    const manager = new Jackpot<MemcachedSocket>(this._config.poolSize)
                    manager.retries = this._config.retries
                    manager.factor = this._config.factor
                    manager.minTimeout = this._config.minTimeout
                    manager.maxTimeout = this._config.maxTimeout
                    manager.randomize = this._config.randomize

                    manager.setMaxListeners(0)

                    manager.factory((): MemcachedSocket => {
                        const streamID = sid++
                        const socket = new MemcachedSocket(streamID, server)

                        // config the Stream
                        socket.setTimeout(this._config.timeout)
                        socket.setNoDelay(true)
                        socket.setEncoding(this._config.encoding)
                        socket.hosts = [ ...serverHosts ]

                        Utils.fuse(socket, {
                            error: (err: Error): void => {
                                memcached._connectionIssue(err.toString(), socket)
                                manager.remove(socket)
                            },
                            close: (): void => {
                                manager.remove(socket)
                            },
                            end: (): void => {
                                socket.end()
                            },
                        })

                        // connect the net.Socket [port, hostname]
                        socket.connect(socket.hosts[0])
                        return socket
                    })

                    manager.on('error', (err: Error): void => {
                        if (memcached._config.debug) {
                            console.log('Connection error', err)
                        }
                    })

                    memcached._connections[server] = manager
                }

                // now that we have setup our connection factory we can allocate a new
                // connection
                memcached._connections[server].pull((err?: Error, socket?: MemcachedSocket) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(socket)
                    }
                })
            }
        })
    }

    private _buffer(socket: MemcachedSocket, buffer: Buffer, callback: CallbackFunction): void {
        socket.responseBuffer += buffer

        // only call transform the data once we are sure, 100% sure, that we valid
        // response ending
        if (socket.responseBuffer.substr(socket.responseBuffer.length - 2) === LINEBREAK) {
            socket.responseBuffer = `${socket.responseBuffer}`

            const chunks = socket.responseBuffer.split(LINEBREAK)

            if (this._config.debug) {
                chunks.forEach((line: string): void => {
                    console.log(socket.streamID + ' >> ' + line)
                })
            }

            // Fix zero-line endings in the middle
            const chunkLength: number = (chunks.length - 1)
            if (chunks[chunkLength].length === 0) {
                chunks.splice(chunkLength, 1)
            }

            socket.responseBuffer = '' // clear!
            socket.bufferArray = socket.bufferArray.concat(chunks)
            this._rawDataReceived(socket, callback)
        }
    }

    private _rawDataReceived(socket: MemcachedSocket, callback: CallbackFunction): void {
        const queue: Array<any> = []
        const err: Array<Error> = []

        while (socket.bufferArray.length && ALL_COMMANDS.test(socket.bufferArray[0])) {
            const token: string = socket.bufferArray.shift()!
            const tokenSet: Array<string> = token.split(' ')
            let dataSet: string | undefined = ''

            if (/^\d+$/.test(tokenSet[0])) {
                // special case for "config get cluster"
                // Amazon-specific memcached configuration information, see aws
                // documentation regarding adding auto-discovery to your client library.
                // Example response of a cache cluster containing three nodes:
                //   configversion\n
                //   hostname|ip-address|port hostname|ip-address|port hostname|ip-address|port\n\r\n
                if (/(([-.a-zA-Z0-9]+)\|(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)\|(\d+))/.test(socket.bufferArray[0])) {
                    tokenSet.unshift('CONFIG')

                } else {
                    tokenSet.unshift('INCRDECR')
                }
            }

            const tokenType: string = tokenSet[0]

            // special case for value, it's required that it has a second response!
            // add the token back, and wait for the next response, we might be
            // handling a big ass response here.
            if (tokenType === 'VALUE' && socket.bufferArray.indexOf('END') === -1) {
                socket.bufferArray.unshift(token)
                return

            } else {
                // check for dedicated parser
                if (TOKEN_TYPES.indexOf(tokenType) > -1) {

                    // fetch the response content
                    if (tokenType === 'VALUE') {
                        dataSet = Utils.unescapeValue(socket.bufferArray.shift() || '')
                    }

                    const result: IParseResult = Parser.parse(tokenType, socket, tokenSet, dataSet, token, err, queue)

                    // check how we need to handle the resultSet response
                    switch (result.type) {
                        case ParseCommand.BUFFER:
                            break

                        case ParseCommand.FLUSH: {
                            const metaData = socket.metaData.shift()
                            // resultSet = queue

                            // if we have a callback, call it
                            if (metaData) {
                                let parsedResult = // see if optional parsing needs to be applied to make the result set more readable
                                    RESULT_PARSERS.indexOf(metaData.type) > -1
                                        ? Parser.parseResults(metaData.type, queue, err, socket)
                                        : !Array.isArray(queue) || queue.length > 1 ? queue : queue[0]

                                if (Array.isArray(parsedResult)) {
                                    parsedResult = [ ...parsedResult ]
                                }

                                metaData.execution = Date.now() - metaData.start

                                this._delegateCallback(
                                    // err.length ? err : err[0],
                                    err[0],
                                    parsedResult,
                                    callback,
                                )
                            }

                            queue.length = err.length = 0
                            break
                        }

                        case ParseCommand.CONTINUE: {
                            const metaData = socket.metaData.shift()

                            if (metaData) {
                                metaData.execution = Date.now() - metaData.start

                                this._delegateCallback(
                                    // err.length > 1 ? err : err[0],
                                    err[0],
                                    result.data,
                                    callback,
                                )
                            }

                            err.length = 0
                            break
                        }

                        default: {
                            const _exhaustiveCheck: never = result.type
                            throw new Error(`Unknown command returned from parse ${_exhaustiveCheck}`)
                        }
                    }

                } else {
                    // handle unkown responses
                    const metaData = socket.metaData.shift()

                    if (metaData) {
                        metaData.execution = Date.now() - metaData.start

                        this._delegateCallback(
                            new Error(`Unknown response from the memcached server: ${token}`),
                            false,
                            callback,
                        )
                    }
                }

                // check if we need to remove an empty item from the array, as splitting on /r/n might cause an empty
                // item at the end..
                if (socket.bufferArray[0] === '') {
                    socket.bufferArray.shift()
                }
            }
        }
    }

    private _throwError(err: Error): never {
        this._activeQueries--
        throw err
    }

    private _delegateCallback(err: Error | undefined, result: any, callback: CallbackFunction): void {
        this._activeQueries -= 1
        callback(err, result)
    }
}
