import { FLAG_BINARY, FLAG_JSON, FLAG_NUMERIC } from './constants'
import { MemcachedSocket } from './MemcachedSocket'
import { IParseResult, ParseCommand } from './types'
import * as Utils from './utils'

export function parseResults(type: string, resultSet: Array<any> | undefined, err: Array<Error>, socket: MemcachedSocket): any {
    switch (type) {
        // combines the stats array, in to an object
        case 'stats': {
            const response: any = {}

            if (Utils.resultSetIsEmpty(resultSet)) {
                return response

            } else {
                // add references to the retrieved server
                response.server = socket.serverAddress

                // Fill the object
                resultSet!.forEach((statSet) => {
                    if (statSet) {
                        response[statSet[0]] = statSet[1]
                    }
                })

                return response
            }
        }

        // the settings uses the same parse format as the regular stats
        case 'stats settings': {
            return parseResults('stats', resultSet, err, socket)
        }

        // Group slabs by slab id
        case 'stats slabs': {
            const response: any = {}

            if (Utils.resultSetIsEmpty(resultSet)) {
                return response

            } else {
                // add references to the retrieved server
                response.server = socket.serverAddress

                // Fill the object
                resultSet!.forEach((statSet) => {
                    if (statSet) {
                        const identifier = statSet[0].split(':')

                        if (!response[identifier[0]]) {
                            response[identifier[0]] = {}
                        }

                        response[identifier[0]][identifier[1]] = statSet[1]
                    }
                })

                return response
            }
        }

        case 'stats items': {
            const response: any = {}

            if (Utils.resultSetIsEmpty(resultSet)) {
                return response

            } else {
                // add references to the retrieved server
                response.server = socket.serverAddress

                // Fill the object
                resultSet!.forEach((statSet) => {
                    if (statSet && statSet.length > 1) {
                        const identifier = statSet[0].split(':')

                        if (!response[identifier[1]]) {
                            response[identifier[1]] = {}
                        }

                        response[identifier[1]][identifier[2]] = statSet[1]
                    }
                })

                return response
            }
        }
    }
}

export function parse(
    tokenType: string,
    socket: MemcachedSocket,
    tokenSet: Array<string>,
    dataSet: any,
    token: string,
    err: Array<Error>,
    queue: Array<any>,
): IParseResult {
    switch (tokenType) {
        case 'NOT_STORED': {
            const errObj = new Error('Item is not stored')
            // errObj.notStored = true
            err.push(errObj)
            return {
                type: ParseCommand.CONTINUE,
                data: false,
            }
        }

        case 'ERROR': {
            err.push(new Error('Received an ERROR response'))
            return {
                type: ParseCommand.FLUSH,
                data: false,
            }
        }

        case 'CLIENT_ERROR': {
            err.push(new Error(tokenSet.splice(1).join(' ')))
            return {
                type: ParseCommand.CONTINUE,
                data: false,
            }
        }

        case 'SERVER_ERROR': {
            return {
                type: ParseCommand.CONTINUE,
                data: false,
                connectionError: tokenSet.splice(1).join(' '),
            }
        }

        case 'END': {
            if (!queue.length) {
                queue.push(undefined)
            }

            return {
                type: ParseCommand.FLUSH,
                data: true,
            }
        }

        // value parsing:
        case 'VALUE': {
            const key = tokenSet[1]
            const flag = +tokenSet[2]
            const dataLen = tokenSet[3] // length of dataSet in raw bytes,
            const cas = tokenSet[4]
            const multi: any = socket.metaData[0] && socket.metaData[0].multi || cas
                ? {}
                : false

            // In parse data there is an '||' passing us the content of token
            // if dataSet is empty. This may be fine for other types of responses,
            // in the case of an empty string being stored in a key, it will
            // result in unexpected behavior:
            // https://github.com/3rd-Eden/node-memcached/issues/64
            if (dataLen === '0') {
                dataSet = ''
            }

            switch (flag) {
                case FLAG_JSON:
                    dataSet = JSON.parse(dataSet)
                    break

                case FLAG_NUMERIC:
                    dataSet = +dataSet
                    break

                case FLAG_BINARY:
                    dataSet = Buffer.from(dataSet, 'binary')
                    break
            }

            // Add to queue as multiple get key key key key key returns multiple values
            if (!multi) {
                queue.push(dataSet)

            } else {

                multi[key] = dataSet

                if (cas) {
                    multi.cas = cas
                }

                queue.push(multi)
            }

            return {
                type: ParseCommand.BUFFER,
                data: false,
            }
        }

        case 'INCRDECR': {
            return {
                type: ParseCommand.CONTINUE,
                data: +tokenSet[1],
            }
        }

        case 'STAT': {
            queue.push([
                tokenSet[1],
                /^\d+$/.test(tokenSet[2]) ? +tokenSet[2] : tokenSet[2],
            ])
            return {
                type: ParseCommand.BUFFER,
                data: true,
            }
        }

        case 'VERSION': {
            const versionTokens = /(\d+)(?:\.)(\d+)(?:\.)(\d+)(.*)?$/.exec(tokenSet[1])

            return {
                type: ParseCommand.CONTINUE,
                data: {
                    server: socket.serverAddress,
                    version: versionTokens![0] || 0,
                    major: versionTokens![1] || 0,
                    minor: versionTokens![2] || 0,
                    bugfix: versionTokens![3] || 0,
                    additionalInfo: versionTokens![4].trim() || '',
                },
            }
        }

        case 'ITEM': {
            queue.push({
                key: tokenSet[1],
                b: +tokenSet[2].substr(1),
                s: +tokenSet[4],
            })

            return {
                type: ParseCommand.BUFFER,
                data: false,
            }
        }

        // Amazon-specific memcached configuration information, used for node
        // auto-discovery.
        case 'CONFIG': {
            return {
                type: ParseCommand.CONTINUE,
                data: socket.bufferArray[0],
            }
        }

        // keyword based responses
        case 'STORED':
        case 'TOUCHED':
        case 'DELETED':
        case 'OK': {
            return {
                type: ParseCommand.CONTINUE,
                data: true,
            }
        }

        case 'EXISTS':
        case 'NOT_FOUND':
        default: {
            return {
                type: ParseCommand.CONTINUE,
                data: false,
            }
        }
    }
}
