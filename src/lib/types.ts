import Jackpot = require('jackpot')

// List of server hosts as strings
export type ServerList = Array<string>

// Map of server host to server priority
export interface IServerPriorityMap {
    [host: string]: number
}

export type Server = string

export type Servers =
    ServerList | IServerPriorityMap | Server

export type Key = string | Array<string>

export type ErrorValue =
    Error | Array<Error> | undefined | null

export type CallbackFunction<T = any> =
    (err: ErrorValue, result: T) => void

export const enum ParseCommand {
    FLUSH,
    BUFFER,
    CONTINUE,
}

export interface IParseResult {
    type: ParseCommand
    data: any
    connectionError?: string
}

export interface IMemcachedConfig {
    maxKeySize: number
    maxExpiration: number
    maxValue: number
    activeQueries: number
    maxQueueSize: number
    algorithm: string
    compatibility: string
    poolSize: number
    retries: number
    factor: number
    minTimeout: number
    maxTimeout: number
    randomize: boolean
    reconnect: number
    timeout: number
    failures: number
    failuresTimeout: number
    retry: number
    idle: number
    remove: boolean
    redundancy: number
    keyCompression: boolean
    namespace: string
    debug: boolean
    encoding: string
    defaultTTL: number
    failOverServers: Array<string>
}

export type MemcachedOptions =
    Partial<IMemcachedConfig>

export interface ICasResult {
    cas: string
    [key: string]: any
}

export type DecoderFunction<T> =
    (input: string) => T

export type EncoderFunction<T> =
    (input: T) => string
