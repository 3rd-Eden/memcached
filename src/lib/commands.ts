import {
    CallbackFunction,
    Key,
    MemcachedOptions,
} from './types'

import * as Utils from './utils'

export type NativeConstructor =
    StringConstructor | NumberConstructor | FunctionConstructor |
    ArrayConstructor | BooleanConstructor | ObjectConstructor

export type ValidationItem =
    [ string, NativeConstructor ]

export type ValidationItems =
    Array<ValidationItem>

export type CommandType =
    'touch' | 'get' | 'gets' | 'delete' | 'stats cachedump' |
    'set' | 'replace' | 'add' | 'cas' | 'append' | 'prepend' |
    'incr' | 'decr' | 'version' | 'flush_all' | 'stats' |
    'stats settings' | 'stats slabs' | 'stats items'

export type CommandCompiler =
    (noreply?: boolean) => CommandOptions

export interface IMemcachedCommand {
    type: CommandType
    key: Key
    value: any
    lifetime: number
    validate: ValidationItems
    command: string
    redundancyEnabled: boolean
    multi: boolean
    cas: string
    start: number
    execution: number
}

export const DEFAULT_COMMAND: IMemcachedCommand = {
    key: '',
    value: null,
    lifetime: 0,
    validate: [],
    type: 'touch',
    command: '',
    redundancyEnabled: false,
    multi: false,
    cas: '',
    start: 0,
    execution: 0,
}

export type CommandOptions =
    Partial<IMemcachedCommand>

export function makeCommand(options: CommandOptions): IMemcachedCommand {
    return Utils.merge(DEFAULT_COMMAND, options)
}
