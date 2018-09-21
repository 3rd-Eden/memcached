import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { IMemcachedCommand, ValidationItem } from './commands'
import { IMemcachedConfig } from './types'

const toString = Object.prototype.toString

export function validateArg(args: IMemcachedCommand, config: IMemcachedConfig): string | undefined {
    let err: any

    args.validate.forEach((tokens: ValidationItem) => {
        const key = tokens[0]
        const value = (args as any)[key]

        switch (tokens[1]) {
            case Number:
                if (toString.call(value) !== '[object Number]') {
                    err = `Argument "${key}" is not a valid Number.`
                }

                break

            case Boolean:
                if (toString.call(value) !== '[object Boolean]') {
                    err = `Argument "${key}" is not a valid Boolean.`
                }

                break

            case Array:
                if (toString.call(value) !== '[object Array]') {
                    err = `Argument "${key}" is not a valid Array.`

                } else if (!err && key === 'key') {
                    for (let vKey = 0; vKey < value.length; vKey++) {
                        const vValue = value[vKey]
                        const result = validateKeySize(config, vKey, vValue)
                        if (result.err) {
                            err = result.err
                        } else {
                            args.command = args.command.replace(vValue, result.value)
                        }
                    }
                }
                break

            case Object:
                if (toString.call(value) !== '[object Object]') {
                    err = `Argument "${key}" is not a valid Object.`
                }

                break

            case Function:
                if (toString.call(value) !== '[object Function]') {
                    err = `Argument "${key}" is not a valid Function.`
                }

                break

            case String:
                if (toString.call(value) !== '[object String]') {
                    err = `Argument "${key}" is not a valid String.`

                } else if (!err && key === 'key') {
                    const result = validateKeySize(config, key, value)
                    if (result.err) {
                        err = result.err
                    } else {
                        args.command = args.command.replace(value, result.value)
                    }
                }

                break

            default:
                if (toString.call(value) === '[object global]' && !tokens[2]) {
                    err = `Argument "${key}" is not defined.`
                }
        }
    })

    return err
}

function validateKeySize(config: IMemcachedConfig, key: string | number, value: any) {
    if (value.length > config.maxKeySize) {
        if (config.keyCompression) {
            return { err: false, value: createHash('md5').update(value).digest('hex') }

        } else {
            return { err: `Argument "${key}" is longer than the maximum allowed length of ${config.maxKeySize}` }
        }

    } else if (/[\s\n\r]/.test(value)) {
        return { err: 'The key should not contain any whitespace or new lines' }

    } else {
        return { err: false, value }
    }
}

export type EventHandler =
    (evt: any) => void

export interface IEventHandlerMap {
    [name: string]: EventHandler
}

// a small util to use an object for eventEmitter
export function fuse<T extends EventEmitter>(target: T, handlers: IEventHandlerMap) {
    for (const i in handlers) {
        if (handlers.hasOwnProperty(i)) {
            target.on(i, handlers[i])
        }
    }
}

// merges a object's proppertys / values with a other object
export function merge<A extends object, B extends object>(obj1: A, obj2: B): A & B
export function merge<A extends object, B extends object, C extends object>(obj1: A, obj2: B, obj3: C): A & B & C
export function merge(...objs: Array<any>): any {
    const target: any = {}

    for (const obj of objs) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                target[key] = obj[key]
            }
        }
    }

    return target
}

// Escapes values by putting backslashes before line breaks
export function escapeValue(value: string): string {
    return value.replace(/(\r|\n)/g, '\\$1')
}

// Unescapes escaped values by removing backslashes before line breaks
export function unescapeValue(value: string): string {
    return value.replace(/\\(\r|\n)/g, '$1')
}

export function resultSetIsEmpty(resultSet?: Array<any>): boolean {
    return !resultSet || (resultSet.length === 1 && !resultSet[0])
}
